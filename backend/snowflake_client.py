import json
import logging
import os
import re
from difflib import SequenceMatcher
from typing import Any, Dict, Generator, List, Optional, Tuple

import requests
import snowflake.connector

logger = logging.getLogger(__name__)


class SnowflakeClient:
    TOKEN_PATH = "/snowflake/session/token"

    def __init__(self):
        self._connection = None
        self.database = "ENERGY_DEMO"
        self.schema = "WELLS"
        self.agent = f"{self.database}.{self.schema}.WELL_ANALYTICS_AGENT"
        self.warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")
        self._host = None
        self._token = None
        self._known_wells_cache = None
        self._is_spcs = os.path.exists(self.TOKEN_PATH)

    @property
    def connection(self):
        if self._connection is None:
            self._connection = self._create_connection()
        return self._connection

    @connection.setter
    def connection(self, value):
        self._connection = value

    def _create_connection(self):
        if os.path.exists(self.TOKEN_PATH):
            with open(self.TOKEN_PATH, "r") as f:
                token = f.read()
            return snowflake.connector.connect(
                host=os.getenv("SNOWFLAKE_HOST"),
                account=os.getenv("SNOWFLAKE_ACCOUNT"),
                authenticator="oauth",
                token=token,
            )
        else:
            connection_name = os.getenv("SNOWFLAKE_CONNECTION_NAME", "default")
            private_key_file = os.getenv(
                "SNOWFLAKE_PRIVATE_KEY_FILE",
                os.path.expanduser("~/.snowflake/keys/rsa_key.p8"),
            )
            return snowflake.connector.connect(
                connection_name=connection_name,
                private_key_file=private_key_file,
            )

    def _reconnect(self):
        try:
            self.connection.close()
        except Exception:
            pass
        self._host = None
        self._token = None
        self.connection = self._create_connection()

    def _get_rest_credentials(self):
        if self._is_spcs:
            with open(self.TOKEN_PATH, "r") as f:
                self._token = f.read().strip()
            self._host = os.getenv("SNOWFLAKE_HOST")
        else:
            self._token = self.connection.rest.token
            account = self.connection.account.replace("_", "-").lower()
            self._host = f"{account}.snowflakecomputing.com"
        return self._host, self._token

    def close(self):
        if self.connection:
            self.connection.close()

    def _execute_query(
        self, sql: str, lowercase_keys: bool = False
    ) -> List[Dict[str, Any]]:
        try:
            return self._run_query(sql, lowercase_keys)
        except snowflake.connector.errors.ProgrammingError as e:
            if self._is_spcs and "390114" in str(e.errno):
                logger.info("Token expired, reconnecting...")
                self._reconnect()
                return self._run_query(sql, lowercase_keys)
            raise

    def _run_query(
        self, sql: str, lowercase_keys: bool = False
    ) -> List[Dict[str, Any]]:
        cursor = self.connection.cursor()
        try:
            cursor.execute(sql)
            columns = (
                [desc[0] for desc in cursor.description] if cursor.description else []
            )
            if lowercase_keys:
                columns = [c.lower() for c in columns]
            rows = cursor.fetchall()
            return [dict(zip(columns, row)) for row in rows]
        finally:
            cursor.close()

    def get_well_production_forecast(self, api_no: str) -> Dict[str, Any]:
        """Return monthly historical production and ML forecast for a single well."""
        safe_api = api_no.replace("'", "''")

        historical = self._execute_query(
            f"""
            SELECT
                DATE_TRUNC('month', PRODUCTION_DATE)::DATE AS month,
                ROUND(AVG(OIL_BBL), 1)                    AS avg_oil,
                ROUND(AVG(GAS_MCF), 1)                    AS avg_gas,
                ROUND(AVG(WATER_BBL), 1)                  AS avg_water,
                ROUND(AVG(RUNTIME_HOURS), 1)              AS avg_runtime,
                COUNT(*)                                  AS days_in_month
            FROM {self.database}.{self.schema}.WELL_PRODUCTION
            WHERE API_NO = '{safe_api}'
              AND PRODUCTION_DATE >= DATEADD('month', -24, CURRENT_DATE())
            GROUP BY 1
            ORDER BY 1
        """,
            lowercase_keys=True,
        )

        forecast = self._execute_query(
            f"""
            SELECT
                FORECAST_DATE           AS forecast_date,
                FORECASTED_OIL_BBL      AS p50,
                LOWER_BOUND_OIL         AS p10,
                UPPER_BOUND_OIL         AS p90,
                MODEL_VERSION           AS model_version,
                CREATED_AT              AS created_at
            FROM {self.database}.{self.schema}.FORECASTED_PRODUCTION
            WHERE API_NO = '{safe_api}'
              AND FORECAST_DATE >= CURRENT_DATE()
              AND MODEL_VERSION = 'ML_FORECAST_V1'
            ORDER BY FORECAST_DATE
        """,
            lowercase_keys=True,
        )

        # Serialise date/datetime objects to strings
        for row in historical:
            for k, v in row.items():
                if hasattr(v, "isoformat"):
                    row[k] = v.isoformat()
        for row in forecast:
            for k, v in row.items():
                if hasattr(v, "isoformat"):
                    row[k] = v.isoformat()

        return {
            "historical": historical or [],
            "forecast": forecast or [],
            "has_forecast": len(forecast) > 0,
        }

    def get_all_wells(self) -> List[Dict[str, Any]]:
        sql = f"""
        SELECT 
            API_NO,
            WELL_NAME,
            FIELD,
            LATITUDE,
            LONGITUDE,
            COUNTY,
            OPERATOR,
            STATUS,
            FORMATION,
            TVD_FT,
            LATERAL_LENGTH_FT
        FROM {self.database}.{self.schema}.WELL_METADATA
        ORDER BY FIELD, WELL_NAME
        """
        return self._execute_query(sql, lowercase_keys=True)

    def get_known_wells(self) -> List[str]:
        """Get list of all known well names from database (cached)."""
        if self._known_wells_cache is None:
            sql = f"""
            SELECT DISTINCT WELL_NAME 
            FROM {self.database}.{self.schema}.WELL_METADATA
            ORDER BY WELL_NAME
            """
            results = self._execute_query(sql)
            self._known_wells_cache = [r["WELL_NAME"] for r in results]
        return self._known_wells_cache

    def extract_well_name_from_query(
        self, query: str
    ) -> Tuple[Optional[str], List[str]]:
        """
        Extract potential well name from user query and match against known wells.

        Returns:
            Tuple of (exact_match_or_None, list_of_close_matches)
        """
        known_wells = self.get_known_wells()
        query_lower = query.lower()

        for well in known_wells:
            if well.lower() in query_lower:
                return (well, [])

        potential_names = []
        patterns = [
            r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+\d+[HhVv]?)\b",
            r"\bon\s+([A-Za-z]+(?:\s+[A-Za-z]+)?\s*\d*[HhVv]?)\b",
            r"\bfor\s+([A-Za-z]+(?:\s+[A-Za-z]+)?\s*\d*[HhVv]?)\b",
            r"\bwell\s+([A-Za-z]+(?:\s+[A-Za-z]+)?\s*\d*[HhVv]?)\b",
            r"\b([A-Za-z]+\s*\d+[HhVv])\b",
        ]

        for pattern in patterns:
            matches = re.findall(pattern, query)
            potential_names.extend(matches)

        close_matches = []
        for potential in potential_names:
            potential_lower = potential.lower().strip()
            for well in known_wells:
                well_lower = well.lower()
                ratio = SequenceMatcher(None, potential_lower, well_lower).ratio()
                if ratio > 0.7 and well not in close_matches:
                    close_matches.append(well)
                if potential_lower in well_lower or well_lower in potential_lower:
                    if well not in close_matches:
                        close_matches.append(well)

        if len(close_matches) == 1:
            return (close_matches[0], [])

        return (None, close_matches[:5])

    def stream_workover_report(
        self, form_data: Dict[str, Any]
    ) -> Generator[str, None, None]:
        """Stream a full workover report from WORKOVER_REPORT_AGENT using submitted form data."""
        shut_in = form_data.get("shutInDate", "")
        proposed_start = form_data.get("proposedStartDate", "")
        well_name = form_data.get("wellName", "Unknown")
        api_number = form_data.get("apiNumber", "")
        field = form_data.get("field", "")
        county = form_data.get("county", "")

        # Build a disambiguation hint if field/county are provided, so the agent
        # can pick the right well when multiple share the same name.

        prompt = f"""You are generating a formal WORKOVER REPORT that will be submitted for AFE approval. This is not a conversational answer — write the full report as a professional engineering document.

WELL DETAILS (from engineer's submission):
- Well Name: {well_name}
- API: {api_number if api_number else "see database"}
- Field: {field if field else "see database"}, {county if county else ""} County
- Operator: {form_data.get("operator", "N/A")}
- Well Type: {form_data.get("wellType", "N/A")} | Formation: {form_data.get("formation", "N/A")}
- TVD: {form_data.get("tvdFt", "N/A")} ft | MD: {form_data.get("mdFt", "N/A")} ft | Lateral: {form_data.get("lateralLengthFt", "N/A")} ft
- Current Lift: {form_data.get("currentLiftType", "N/A")} | Proposed: {form_data.get("proposedLiftType", "same")}
- Workover Reason: {form_data.get("workoverReason", "N/A")}
- Problem: {form_data.get("problemDescription", "N/A")}
- Shut-in Date: {shut_in if shut_in else "not specified"}
- Last Production: {form_data.get("lastProductionOil", "0")} BBL/day oil | {form_data.get("lastProductionGas", "0")} MCF/day gas | {form_data.get("lastProductionWater", "0")} BBL/day water
- Proposed Start: {proposed_start if proposed_start else "ASAP"} | Duration: {form_data.get("estimatedDuration", "TBD")} days | Budget: ${form_data.get("estimatedCost", "TBD")}
- Notes: {form_data.get("additionalNotes", "None")}

DATA LOOKUP INSTRUCTIONS:
1. Use well_analyst to query 12-24 months of production for "{well_name}" (search by WELL_NAME, not API — the API above may be approximate).
2. Use well_events_search to find ALL historical failures, workovers, and maintenance events for this well. Search for "{well_name} workover", "{well_name} failure", and "{well_name} repair".
3. Use well_completions_analyst if frac/completion data exists for this well.
4. Use code_execution to calculate revenue lost since shut-in: days × (oil_rate × 75 + gas_rate × 2.50).

After gathering data, write the complete workover report with ALL of these sections:

## EXECUTIVE SUMMARY
## WELL INFORMATION
## PRODUCTION HISTORY ANALYSIS
## WELLBORE & COMPLETION SUMMARY
## PROBLEM ANALYSIS & ROOT CAUSE
## PROPOSED WORK PROGRAM
## RISK ASSESSMENT & WELL CONTROL
## ESTIMATED COSTS & AFE
## POST-WORKOVER PRODUCTION FORECAST
## RECOMMENDATIONS & NEXT STEPS

Use **bold** for all key numbers, depths, pressures. Tables for production data and cost breakdowns. Numbered lists for the work program steps. All depths in MD. AFE cost standards: workover rig $18-22k/day, ESP assembly $45-75k, tubing 2-3/8in EUE $5.50/ft, add 15% contingency."""

        yield from self._stream_agent_request(
            query=prompt,
            agent_name="WELL_ANALYTICS_AGENT_V2",
            timeout=300,
        )

    def _stream_agent_request(
        self,
        query: str,
        agent_name: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        timeout: int = 120,
    ) -> Generator[str, None, None]:
        """Core SSE streaming method shared by all agent callers."""
        host, token = self._get_rest_credentials()

        messages = []
        if conversation_history:
            for msg in conversation_history:
                messages.append(
                    {
                        "role": msg["role"],
                        "content": [{"type": "text", "text": msg["content"]}],
                    }
                )
        messages.append({"role": "user", "content": [{"type": "text", "text": query}]})

        try:
            auth_value = (
                f"Bearer {token}" if self._is_spcs else f'Snowflake Token="{token}"'
            )
            headers = {"Authorization": auth_value, "Content-Type": "application/json"}

            resp = requests.post(
                url=f"https://{host}/api/v2/databases/{self.database}/schemas/{self.schema}/agents/{agent_name}:run",
                json={"messages": messages},
                headers=headers,
                stream=True,
                timeout=timeout,
            )
            # Force UTF-8 so multi-byte unicode chars (→, ✓, etc.) aren't
            # mangled by requests' default ISO-8859-1 fallback for text/* types.
            resp.encoding = "utf-8"

            if resp.status_code >= 400:
                logger.error(
                    "Agent error %d: host=%s, body=%s",
                    resp.status_code,
                    host,
                    resp.text[:500],
                )
                yield f"data: {json.dumps({'type': 'error', 'message': f'Agent error: {resp.status_code}'})}\n\n"
                return

            current_event = None
            for line in resp.iter_lines(decode_unicode=True):
                if not line:
                    continue

                if line.startswith("event:"):
                    current_event = line[6:].strip()
                    continue

                if not line.startswith("data:"):
                    continue

                data_str = line[5:].strip()
                if not data_str:
                    continue

                try:
                    event_data = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                if current_event == "response.text.delta":
                    yield f"data: {json.dumps({'type': 'text_delta', 'text': event_data.get('text', '')})}\n\n"

                elif current_event == "response.thinking.delta":
                    yield f"data: {json.dumps({'type': 'thinking_delta', 'text': event_data.get('text', '')})}\n\n"

                elif current_event == "response.status":
                    yield f"data: {json.dumps({'type': 'status', 'message': event_data.get('message', '')})}\n\n"

                elif current_event == "response.tool_use":
                    tool_name = event_data.get("name", "")
                    tool_used = (
                        "cortex_analyst"
                        if "analyst" in tool_name.lower()
                        else (
                            "cortex_search"
                            if "search" in tool_name.lower()
                            else tool_name
                        )
                    )
                    yield f"data: {json.dumps({'type': 'tool_use', 'tool': tool_used})}\n\n"

                elif current_event == "response.tool_result":
                    content = event_data.get("content", [])
                    for item in content:
                        if isinstance(item, dict) and "json" in item:
                            result_json = item.get("json", {})
                            sql = result_json.get("sql")
                            query_id = result_json.get("query_id")
                            data = None
                            wells_mentioned = []

                            search_results = result_json.get("search_results", [])
                            if search_results:
                                data = search_results
                                for row in search_results:
                                    cols = row.get("columns", {})
                                    well_name = cols.get("WELL_NAME")
                                    if well_name:
                                        wells_mentioned.append(well_name)

                            result_set = result_json.get("result_set", {})
                            if result_set:
                                raw_data = result_set.get("data", [])
                                metadata = result_set.get("resultSetMetaData", {})
                                row_types = metadata.get("rowType", [])
                                if raw_data and row_types:
                                    col_names = [
                                        rt.get("name", f"col_{i}")
                                        for i, rt in enumerate(row_types)
                                    ]
                                    data = [
                                        dict(zip(col_names, row)) for row in raw_data
                                    ]
                                    for row in data:
                                        if row.get("WELL_NAME"):
                                            wells_mentioned.append(row["WELL_NAME"])

                                if query_id and not sql:
                                    try:
                                        sql_result = self._execute_query(
                                            f"SELECT QUERY_TEXT FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY()) WHERE QUERY_ID = '{query_id}'"
                                        )
                                        if sql_result:
                                            sql = sql_result[0].get("QUERY_TEXT")
                                    except Exception:
                                        pass

                            search_results_alt = result_json.get("results", [])
                            if search_results_alt:
                                data = search_results_alt
                                for row in search_results_alt:
                                    if isinstance(row, dict) and row.get("WELL_NAME"):
                                        wells_mentioned.append(row["WELL_NAME"])

                            tool_result_payload: Dict[str, Any] = {
                                "type": "tool_result"
                            }
                            if sql:
                                tool_result_payload["sql"] = sql
                            if data:
                                tool_result_payload["data"] = data
                            if wells_mentioned:
                                tool_result_payload["wells_mentioned"] = list(
                                    set(wells_mentioned)
                                )
                            yield f"data: {json.dumps(tool_result_payload)}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            logger.exception("Stream error: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    def stream_cortex_query(
        self, query: str, conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Generator[str, None, None]:
        yield from self._stream_agent_request(
            query=query,
            agent_name="WELL_ANALYTICS_AGENT",
            conversation_history=conversation_history,
        )
