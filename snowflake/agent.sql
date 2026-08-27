-- ============================================
-- Cortex Agent Setup
-- ============================================
-- Prerequisites:
--   1. Semantic View: ENERGY_DEMO.WELLS.WELL_ANALYTICS_VIEW
--   2. Search Service: ENERGY_DEMO.WELLS.WELL_EVENTS_SEARCH
-- ============================================

USE ROLE ACCOUNTADMIN;
USE DATABASE ENERGY_DEMO;
USE SCHEMA WELLS;

-- Create the Cortex Agent with two tools:
--   1. Cortex Analyst (text-to-SQL) for structured production data
--   2. Cortex Search (semantic search) for maintenance/event history

CREATE OR REPLACE AGENT ENERGY_DEMO.WELLS.WELL_ANALYTICS_AGENT
  COMMENT = 'AI assistant for oil & gas well analytics'
  PROFILE = '{"display_name": "Well Assistant"}'
  FROM SPECIFICATION $$
  {
    "models": {
      "orchestration": "claude-4-sonnet"
    },
    "instructions": {
      "orchestration": "ROUTING RULES: 1) Use well_events_search for questions about failures, maintenance, repairs, incidents, workovers, ESP problems, pump issues, leaks, chemical treatments, or operational events. 2) Use well_analyst ONLY for production volumes (oil/gas/water), totals, averages, field comparisons, top producers, or decline rates. When filtering by well name, use EXACT match.",
      "response": "Be concise. Use **bold** for key numbers. CRITICAL: When reporting events from well_events_search, ALWAYS include the EVENT_DATE for each result. Format as: **Well Name** - **Date** - Description summary."
    },
    "tools": [
      {
        "tool_spec": {
          "type": "cortex_analyst_text_to_sql",
          "name": "well_analyst",
          "description": "Query structured well data: production volumes (oil/gas/water), well metadata, field comparisons, decline analysis, top producers. Always use exact match on WELL_NAME."
        }
      },
      {
        "tool_spec": {
          "type": "cortex_search",
          "name": "well_events_search",
          "description": "Search operational events: maintenance logs, ESP failures, workovers, pump repairs, chemical treatments, incidents. When searching for a specific well, use the filter parameter with exact WELL_NAME match."
        }
      }
    ],
    "tool_resources": {
      "well_analyst": {
        "semantic_view": "ENERGY_DEMO.WELLS.WELL_ANALYTICS_VIEW",
        "execution_environment": {
          "type": "warehouse",
          "warehouse": "COMPUTE_WH"
        },
        "query_timeout": 60
      },
      "well_events_search": {
        "search_service": "ENERGY_DEMO.WELLS.WELL_EVENTS_SEARCH",
        "max_results": 10,
        "columns": ["WELL_NAME", "FIELD", "EVENT_TYPE", "EVENT_DATE", "EVENT_DESCRIPTION", "COST_USD", "DURATION_HOURS"]
      }
    }
  }
  $$;

-- Grant access
GRANT USAGE ON AGENT ENERGY_DEMO.WELLS.WELL_ANALYTICS_AGENT TO ROLE PUBLIC;

-- Verify
SHOW AGENTS IN SCHEMA ENERGY_DEMO.WELLS;
DESC AGENT ENERGY_DEMO.WELLS.WELL_ANALYTICS_AGENT;
