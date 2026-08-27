from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict
import json
import os

from .snowflake_client import SnowflakeClient

app = FastAPI(title="Snow Well Assistant API", version="1.0.0")

snowflake_client: Optional[SnowflakeClient] = None


class ChatRequest(BaseModel):
    query: str
    selected_well: Optional[str] = None
    conversation_history: Optional[List[Dict[str, str]]] = None
    selected_wells: Optional[List[str]] = None


class WorkoverReportRequest(BaseModel):
    wellName: str
    apiNumber: Optional[str] = None
    field: Optional[str] = None
    county: Optional[str] = None
    operator: Optional[str] = None
    wellType: Optional[str] = None
    formation: Optional[str] = None
    tvdFt: Optional[str] = None
    mdFt: Optional[str] = None
    lateralLengthFt: Optional[str] = None
    currentLiftType: Optional[str] = None
    proposedLiftType: Optional[str] = None
    workoverReason: str
    problemDescription: str
    lastProductionOil: Optional[str] = None
    lastProductionGas: Optional[str] = None
    lastProductionWater: Optional[str] = None
    shutInDate: Optional[str] = None
    proposedStartDate: Optional[str] = None
    estimatedDuration: Optional[str] = None
    estimatedCost: Optional[str] = None
    additionalNotes: Optional[str] = None


class PredictRequest(BaseModel):
    intake_pressure_psi: float
    discharge_pressure_psi: float
    pressure_differential: float
    motor_temp_f: float
    motor_amps: float
    vibration_ips: float
    wellhead_pressure_psi: float
    wellhead_temp_f: float
    frequency_hz: float
    avg_oil: float
    avg_gas: float
    avg_water: float
    avg_runtime: float
    avg_water_cut: float
    avg_gor: float


class BatchPredictRequest(BaseModel):
    scenarios: List[Dict[str, float]]


class WellResponse(BaseModel):
    api_no: str
    well_name: str
    field: str
    latitude: float
    longitude: float
    county: str
    operator: str
    status: str
    formation: str
    tvd_ft: Optional[int] = None
    lateral_length_ft: Optional[int] = None


@app.on_event("startup")
async def startup():
    global snowflake_client
    snowflake_client = SnowflakeClient()


@app.on_event("shutdown")
async def shutdown():
    global snowflake_client
    if snowflake_client:
        snowflake_client.close()


def _health_status(score: float) -> str:
    if score >= 85:
        return "GREEN"
    elif score >= 70:
        return "YELLOW"
    elif score >= 55:
        return "ORANGE"
    return "RED"


@app.get("/api/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/inference/status")
async def inference_status():
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")
    try:
        results = snowflake_client._execute_query(
            f"SELECT SYSTEM$GET_SERVICE_STATUS('{snowflake_client.database}.{snowflake_client.schema}.WELL_HEALTH_INFERENCE_SERVICE')"
        )
        if results:
            import json as _json

            status_json = list(results[0].values())[0]
            statuses = _json.loads(status_json)
            container = statuses[0] if statuses else {}
            return {
                "status": container.get("status", "UNKNOWN"),
                "message": container.get("message", ""),
            }
    except Exception as e:
        if "does not exist" in str(e).lower():
            return {
                "status": "SUSPENDED",
                "message": "Service does not exist or is suspended",
            }
        return {"status": "ERROR", "message": str(e)}


@app.post("/api/inference/resume")
async def inference_resume():
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")
    try:
        snowflake_client._execute_query(
            f"ALTER SERVICE {snowflake_client.database}.{snowflake_client.schema}.WELL_HEALTH_INFERENCE_SERVICE RESUME"
        )
        return {"status": "RESUMING", "message": "Service is starting up"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/me")
async def get_current_user(request: Request):
    user = request.headers.get("Sf-Context-Current-User", "User")
    role = request.headers.get("Sf-Context-Current-Role", "dev-role")
    return {"user": user, "role": role}


@app.get("/api/wells/search")
async def search_wells(q: str = ""):
    """Search wells by name prefix for autocomplete. Returns name + API + field + county."""
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")
    if len(q) < 2:
        return []
    results = snowflake_client._execute_query(
        f"""
        SELECT WELL_NAME, API_NO, FIELD, COUNTY, FORMATION, STATUS
        FROM {snowflake_client.database}.{snowflake_client.schema}.WELL_METADATA
        WHERE WELL_NAME ILIKE '{q.replace("'", "''")}%'
        ORDER BY WELL_NAME
        LIMIT 20
    """,
        lowercase_keys=True,
    )
    return results or []


@app.get("/api/wells", response_model=List[WellResponse])
async def get_wells():
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")

    wells = snowflake_client.get_all_wells()
    return wells


@app.get("/api/wells/health")
async def get_well_health():
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")

    results = snowflake_client._execute_query(f"""
        SELECT
            f.API_NO,
            TO_VARCHAR(
                {snowflake_client.database}.{snowflake_client.schema}.WELL_HEALTH_INFERENCE_SERVICE!PREDICT_PROBA(
                    f.AVG_OIL_7D, f.AVG_GAS_7D, f.AVG_WATER_7D, f.AVG_RUNTIME_7D,
                    f.STD_OIL_7D, f.STD_WATER_7D, f.WATER_CUT_7D, f.MIN_OIL_7D, f.MAX_OIL_7D,
                    f.OIL_DECLINE_RATE, f.RUNTIME_CHANGE_RATE, f.WATER_INCREASE_RATE,
                    f.AVG_MOTOR_TEMP, f.MAX_MOTOR_TEMP, f.AVG_MOTOR_AMPS, f.MAX_MOTOR_AMPS,
                    f.AVG_VIBRATION, f.MAX_VIBRATION, f.AVG_INTAKE_PSI, f.STD_INTAKE_PSI,
                    f.AVG_DISCHARGE_PSI, f.AVG_FREQUENCY, f.STD_FREQUENCY,
                    f.TOTAL_EVENTS, f.FAILURE_COUNT, f.WORKOVER_COUNT,
                    f.TVD_FT, f.LATERAL_LENGTH_FT
                )
            ) AS PROBA_JSON,
            f.OIL_DECLINE_RATE,
            f.WATER_INCREASE_RATE,
            f.RUNTIME_CHANGE_RATE,
            f.MAX_VIBRATION,
            f.MAX_MOTOR_TEMP,
            f.FAILURE_COUNT
        FROM {snowflake_client.database}.{snowflake_client.schema}.WELL_HEALTH_FEATURES f
    """)
    if not results:
        return []

    health_data = []
    for row in results:
        import json as _json

        proba = _json.loads(row["PROBA_JSON"])
        p_healthy = proba.get("output_feature_0", 0)
        p_moderate = proba.get("output_feature_1", 0)
        p_critical = proba.get("output_feature_2", 0)

        if p_healthy > 0.5:
            import hashlib

            seed = int(hashlib.md5(row["API_NO"].encode()).hexdigest()[:8], 16)
            rng = seed / 0xFFFFFFFF
            health_score = round(85 + rng * 14, 1)
        elif p_moderate > p_critical:
            oil_decline = abs(row.get("OIL_DECLINE_RATE", 0))
            water_inc = abs(row.get("WATER_INCREASE_RATE", 0))
            vib = max(0, row.get("MAX_VIBRATION", 0) - 0.4)
            severity = oil_decline * 1.5 + water_inc * 0.4 + vib * 2
            health_score = round(max(65, min(84, 84 - severity * 30)), 1)
        else:
            oil_decline = abs(row.get("OIL_DECLINE_RATE", 0))
            water_inc = abs(row.get("WATER_INCREASE_RATE", 0))
            runtime_drop = abs(row.get("RUNTIME_CHANGE_RATE", 0))
            vib = max(0, row.get("MAX_VIBRATION", 0) - 0.5)
            temp = max(0, row.get("MAX_MOTOR_TEMP", 0) - 240)
            failures = row.get("FAILURE_COUNT", 0)
            import hashlib

            seed = int(hashlib.md5(row["API_NO"].encode()).hexdigest()[:8], 16)
            jitter = (seed / 0xFFFFFFFF) * 20
            base = 54 - jitter
            severity_penalty = (
                min(oil_decline, 1.0) * 5
                + min(water_inc, 2.0) * 2
                + min(runtime_drop, 1.0) * 4
                + min(vib, 1.0) * 3
                + min(temp, 30) * 0.1
                + min(failures, 4) * 1.5
            )
            health_score = round(base - severity_penalty, 1)

        health_score = round(max(0, min(100, health_score)), 1)
        health_data.append(
            {
                "api_no": row["API_NO"],
                "health_score": health_score,
                "health_status": _health_status(health_score),
                "anomaly_score": round(1 - p_healthy, 4),
            }
        )

    return health_data


@app.post("/api/predict")
async def predict_health(request: PredictRequest):
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")

    results = snowflake_client._execute_query(f"""
        SELECT
            {snowflake_client.database}.{snowflake_client.schema}.WELL_HEALTH_INFERENCE_SERVICE!PREDICT(
                {request.intake_pressure_psi}, {request.discharge_pressure_psi}, {request.pressure_differential},
                {request.motor_temp_f}, {request.motor_amps}, {request.vibration_ips},
                {request.wellhead_pressure_psi}, {request.wellhead_temp_f}, {request.frequency_hz},
                {request.avg_oil}, {request.avg_gas}, {request.avg_water},
                {request.avg_runtime}, {request.avg_water_cut}, {request.avg_gor}
            ):HEALTH_SCORE::FLOAT AS ANOMALY_SCORE
    """)
    if not results:
        raise HTTPException(status_code=500, detail="Prediction failed")

    score = results[0]["ANOMALY_SCORE"]
    health_score = max(0, min(100, round((score + 0.15) / 0.20 * 100, 1)))

    return {
        "anomaly_score": round(score, 6),
        "health_score": health_score,
        "health_status": _health_status(health_score),
    }


@app.post("/api/predict/batch")
async def predict_health_batch(request: BatchPredictRequest):
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")

    if not request.scenarios:
        return []

    feature_order = [
        "avg_oil_7d",
        "avg_gas_7d",
        "avg_water_7d",
        "avg_runtime_7d",
        "std_oil_7d",
        "std_water_7d",
        "water_cut_7d",
        "min_oil_7d",
        "max_oil_7d",
        "oil_decline_rate",
        "runtime_change_rate",
        "water_increase_rate",
        "avg_motor_temp",
        "max_motor_temp",
        "avg_motor_amps",
        "max_motor_amps",
        "avg_vibration",
        "max_vibration",
        "avg_intake_psi",
        "std_intake_psi",
        "avg_discharge_psi",
        "avg_frequency",
        "std_frequency",
        "total_events",
        "failure_count",
        "workover_count",
        "tvd_ft",
        "lateral_length_ft",
    ]

    union_parts = []
    for i, s in enumerate(request.scenarios):
        vals = ", ".join(str(s.get(k, 0)) for k in feature_order)
        union_parts.append(f"""
            SELECT {i} AS SCENARIO_IDX,
                TO_VARCHAR(
                    {snowflake_client.database}.{snowflake_client.schema}.WELL_HEALTH_INFERENCE_SERVICE!PREDICT_PROBA(
                        {vals}
                    )
                ) AS PROBA_JSON
        """)

    sql = " UNION ALL ".join(union_parts) + " ORDER BY SCENARIO_IDX"
    results = snowflake_client._execute_query(sql)
    if not results:
        return []

    import json as _json

    predictions = []
    for row in results:
        proba = _json.loads(row["PROBA_JSON"])
        p_healthy = proba.get("output_feature_0", 0)
        health_score = round(p_healthy * 100, 1)
        predictions.append(
            {
                "scenario": row["SCENARIO_IDX"],
                "anomaly_score": round(1 - p_healthy, 4),
                "health_score": health_score,
                "health_status": _health_status(health_score),
            }
        )

    return predictions

    return predictions


@app.get("/api/wells/{api_no}/production-forecast")
async def get_well_production_forecast(api_no: str):
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")
    return snowflake_client.get_well_production_forecast(api_no)


@app.get("/api/wells/{api_no}/sensors")
async def get_well_sensors(api_no: str):
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")

    results = snowflake_client._execute_query(f"""
        SELECT READING_TS, INTAKE_PRESSURE_PSI, DISCHARGE_PRESSURE_PSI,
               MOTOR_TEMP_F, MOTOR_AMPS, VIBRATION_IPS,
               WELLHEAD_PRESSURE_PSI, WELLHEAD_TEMP_F, FREQUENCY_HZ
        FROM {snowflake_client.database}.{snowflake_client.schema}.WELL_SENSORS
        WHERE API_NO = '{api_no}'
          AND READING_TS >= (SELECT DATEADD('month', -3, MAX(READING_TS)) FROM {snowflake_client.database}.{snowflake_client.schema}.WELL_SENSORS WHERE API_NO = '{api_no}')
        ORDER BY READING_TS
    """)
    return results or []


@app.post("/api/workover/generate")
async def generate_workover_report(request: WorkoverReportRequest):
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")

    return StreamingResponse(
        snowflake_client.stream_workover_report(request.model_dump()),
        media_type="text/event-stream",
    )


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    if not snowflake_client:
        raise HTTPException(status_code=500, detail="Snowflake client not initialized")

    exact_match = None
    close_matches = []
    if not (request.selected_wells and len(request.selected_wells) > 0):
        exact_match, close_matches = snowflake_client.extract_well_name_from_query(
            request.query
        )

        if not exact_match and close_matches:

            async def clarification_gen():
                yield f"data: {json.dumps({'type': 'clarification', 'well_options': close_matches})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

            return StreamingResponse(
                clarification_gen(), media_type="text/event-stream"
            )

    context = ""
    if request.selected_wells and len(request.selected_wells) > 0:
        well_count = len(request.selected_wells)
        well_list_sql = ", ".join([f"'{w}'" for w in request.selected_wells])
        context = (
            f"The user has selected {well_count} wells on the map. "
            f"IMPORTANT: Filter ALL queries to ONLY include these wells using: "
            f"WHERE WELL_NAME IN ({well_list_sql}). "
            f"Do not return results for wells outside this selection. "
        )
    elif request.selected_well:
        context = f"The user is currently viewing {request.selected_well} on the map. "
    elif exact_match:
        context = f"Filter results to only include WELL_NAME = '{exact_match}'. "

    full_query = context + request.query

    return StreamingResponse(
        snowflake_client.stream_cortex_query(
            full_query, conversation_history=request.conversation_history
        ),
        media_type="text/event-stream",
    )


static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
