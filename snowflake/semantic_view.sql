-- ============================================
-- Semantic Views for Well Analytics
-- ============================================
-- Prerequisites:
--   1. Tables: WELL_METADATA, WELL_PRODUCTION, FORECASTED_PRODUCTION
-- Note: WELL_HISTORY is NOT included here - event queries
--       are handled by Cortex Search (well_events_search)
-- ============================================

USE ROLE ACCOUNTADMIN;
USE DATABASE ENERGY_DEMO;
USE SCHEMA WELLS;

-- ============================================
-- 1. WELL_ANALYTICS_VIEW - Historical Production
-- ============================================
CREATE OR REPLACE SEMANTIC VIEW ENERGY_DEMO.WELLS.WELL_ANALYTICS_VIEW
  TABLES (
    ENERGY_DEMO.WELLS.WELL_METADATA PRIMARY KEY (API_NO) COMMENT='Master well metadata including location, operator, and completion details',
    ENERGY_DEMO.WELLS.WELL_PRODUCTION PRIMARY KEY (API_NO, PRODUCTION_DATE) COMMENT='Daily production volumes for oil, gas, and water by well'
  )
  RELATIONSHIPS (
    PRODUCTION_TO_METADATA AS WELL_PRODUCTION(API_NO) REFERENCES WELL_METADATA(API_NO)
  )
  FACTS (
    WELL_PRODUCTION.OIL_BBL AS OIL_BBL COMMENT='Oil production volume in barrels per day',
    WELL_PRODUCTION.GAS_MCF AS GAS_MCF COMMENT='Gas production volume in thousand cubic feet per day',
    WELL_PRODUCTION.WATER_BBL AS WATER_BBL COMMENT='Water production volume in barrels per day',
    WELL_PRODUCTION.RUNTIME_HOURS AS RUNTIME_HOURS COMMENT='Equipment runtime hours per day'
  )
  DIMENSIONS (
    WELL_METADATA.API_NO AS API_NO COMMENT='Unique API number identifying the well',
    WELL_METADATA.WELL_NAME AS WELL_NAME COMMENT='Human-readable well name (e.g., Thunderbolt 1H). Use exact match when filtering.',
    WELL_METADATA.FIELD AS FIELD COMMENT='Oil/gas field where the well is located',
    WELL_METADATA.COUNTY AS COUNTY COMMENT='County where well is located',
    WELL_METADATA.OPERATOR AS OPERATOR COMMENT='Company operating the well',
    WELL_METADATA.STATUS AS STATUS COMMENT='Current operational status (e.g., ACTIVE, SHUT-IN)',
    WELL_METADATA.FORMATION AS FORMATION COMMENT='Target geological formation',
    WELL_METADATA.SPUD_DATE AS SPUD_DATE COMMENT='Date when drilling began',
    WELL_METADATA.FIRST_PROD_DATE AS FIRST_PROD_DATE COMMENT='Date of first production',
    WELL_PRODUCTION.PRODUCTION_DATE AS PRODUCTION_DATE COMMENT='Date of production measurement'
  )
  METRICS (
    WELL_METADATA.WELL_COUNT AS COUNT(DISTINCT WELL_METADATA.API_NO) COMMENT='Count of unique wells',
    WELL_PRODUCTION.TOTAL_OIL AS SUM(OIL_BBL) COMMENT='Total oil production in barrels',
    WELL_PRODUCTION.TOTAL_GAS AS SUM(GAS_MCF) COMMENT='Total gas production in MCF',
    WELL_PRODUCTION.TOTAL_WATER AS SUM(WATER_BBL) COMMENT='Total water production in barrels',
    WELL_PRODUCTION.AVG_OIL AS AVG(OIL_BBL) COMMENT='Average daily oil production in barrels',
    WELL_PRODUCTION.AVG_WATER_CUT AS AVG(WATER_BBL / NULLIF(OIL_BBL + WATER_BBL, 0)) COMMENT='Average water cut ratio (water / total liquid). Higher values indicate more water production.'
  )
  COMMENT='Semantic model for historical production data. For maintenance events and failures, use Cortex Search.'
  WITH EXTENSION (CA='{
    "verified_queries": [
      {
        "name": "decline_rate_for_well",
        "question": "What is the decline rate for [well name]?",
        "sql": "WITH first_last AS (SELECT m.WELL_NAME, FIRST_VALUE(p.OIL_BBL) OVER (PARTITION BY m.WELL_NAME ORDER BY p.PRODUCTION_DATE) as FIRST_OIL, LAST_VALUE(p.OIL_BBL) OVER (PARTITION BY m.WELL_NAME ORDER BY p.PRODUCTION_DATE ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as LAST_OIL, FIRST_VALUE(p.PRODUCTION_DATE) OVER (PARTITION BY m.WELL_NAME ORDER BY p.PRODUCTION_DATE) as FIRST_DATE, LAST_VALUE(p.PRODUCTION_DATE) OVER (PARTITION BY m.WELL_NAME ORDER BY p.PRODUCTION_DATE ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as LAST_DATE FROM ENERGY_DEMO.WELLS.WELL_PRODUCTION p JOIN ENERGY_DEMO.WELLS.WELL_METADATA m ON p.API_NO = m.API_NO WHERE m.WELL_NAME = :well_name) SELECT DISTINCT WELL_NAME, FIRST_OIL as INITIAL_PRODUCTION_BBL, LAST_OIL as CURRENT_PRODUCTION_BBL, ROUND((FIRST_OIL - LAST_OIL) / NULLIF(FIRST_OIL, 0) * 100, 2) as DECLINE_RATE_PCT, FIRST_DATE as START_DATE, LAST_DATE as END_DATE FROM first_last"
      },
      {
        "name": "water_cut_by_well",
        "question": "Show me wells with high water cut",
        "sql": "SELECT m.WELL_NAME, m.FIELD, ROUND(AVG(p.WATER_BBL / NULLIF(p.OIL_BBL + p.WATER_BBL, 0)) * 100, 2) as WATER_CUT_PCT FROM ENERGY_DEMO.WELLS.WELL_PRODUCTION p JOIN ENERGY_DEMO.WELLS.WELL_METADATA m ON p.API_NO = m.API_NO GROUP BY m.WELL_NAME, m.FIELD HAVING AVG(p.WATER_BBL / NULLIF(p.OIL_BBL + p.WATER_BBL, 0)) > 0.5 ORDER BY WATER_CUT_PCT DESC"
      },
      {
        "name": "production_for_well",
        "question": "What is the production for [well name]?",
        "sql": "SELECT m.WELL_NAME, SUM(p.OIL_BBL) as TOTAL_OIL, SUM(p.GAS_MCF) as TOTAL_GAS, SUM(p.WATER_BBL) as TOTAL_WATER FROM ENERGY_DEMO.WELLS.WELL_PRODUCTION p JOIN ENERGY_DEMO.WELLS.WELL_METADATA m ON p.API_NO = m.API_NO WHERE m.WELL_NAME = :well_name GROUP BY m.WELL_NAME"
      },
      {
        "name": "top_producing_wells",
        "question": "Which wells have the highest oil production?",
        "sql": "SELECT m.WELL_NAME, m.FIELD, SUM(p.OIL_BBL) as TOTAL_OIL FROM ENERGY_DEMO.WELLS.WELL_PRODUCTION p JOIN ENERGY_DEMO.WELLS.WELL_METADATA m ON p.API_NO = m.API_NO GROUP BY m.WELL_NAME, m.FIELD ORDER BY TOTAL_OIL DESC LIMIT 10"
      }
    ]
  }');

-- Grant access
GRANT SELECT ON SEMANTIC VIEW ENERGY_DEMO.WELLS.WELL_ANALYTICS_VIEW TO ROLE PUBLIC;

-- ============================================
-- 2. WELL_FORECAST_VIEW - Forecasted Production
-- ============================================
CREATE OR REPLACE SEMANTIC VIEW ENERGY_DEMO.WELLS.WELL_FORECAST_VIEW
  TABLES (
    ENERGY_DEMO.WELLS.WELL_METADATA PRIMARY KEY (API_NO) COMMENT='Master well metadata including location, operator, and completion details',
    ENERGY_DEMO.WELLS.FORECASTED_PRODUCTION PRIMARY KEY (API_NO, FORECAST_DATE) COMMENT='30-day forecasted production volumes using ML decline curve analysis'
  )
  RELATIONSHIPS (
    FORECAST_TO_METADATA AS FORECASTED_PRODUCTION(API_NO) REFERENCES WELL_METADATA(API_NO)
  )
  FACTS (
    FORECASTED_PRODUCTION.FORECASTED_OIL_BBL AS FORECASTED_OIL_BBL COMMENT='Forecasted oil production in barrels per day',
    FORECASTED_PRODUCTION.FORECASTED_GAS_MCF AS FORECASTED_GAS_MCF COMMENT='Forecasted gas production in MCF per day',
    FORECASTED_PRODUCTION.FORECASTED_WATER_BBL AS FORECASTED_WATER_BBL COMMENT='Forecasted water production in barrels per day'
  )
  DIMENSIONS (
    WELL_METADATA.API_NO AS API_NO COMMENT='Unique API number identifying the well',
    WELL_METADATA.WELL_NAME AS WELL_NAME COMMENT='Human-readable well name (e.g., Snowflake 1H). Use exact match when filtering.',
    WELL_METADATA.FIELD AS FIELD COMMENT='Oil/gas field where the well is located',
    WELL_METADATA.OPERATOR AS OPERATOR COMMENT='Company operating the well',
    FORECASTED_PRODUCTION.FORECAST_DATE AS FORECAST_DATE COMMENT='Date of forecasted production',
    FORECASTED_PRODUCTION.FORECAST_TYPE AS FORECAST_TYPE COMMENT='Type of forecast model used (e.g., ML_DECLINE_CURVE)'
  )
  METRICS (
    FORECASTED_PRODUCTION.TOTAL_FORECASTED_OIL AS SUM(FORECASTED_OIL_BBL) COMMENT='Total forecasted oil production in barrels',
    FORECASTED_PRODUCTION.TOTAL_FORECASTED_GAS AS SUM(FORECASTED_GAS_MCF) COMMENT='Total forecasted gas production in MCF',
    FORECASTED_PRODUCTION.TOTAL_FORECASTED_WATER AS SUM(FORECASTED_WATER_BBL) COMMENT='Total forecasted water production in barrels',
    FORECASTED_PRODUCTION.AVG_FORECASTED_OIL AS AVG(FORECASTED_OIL_BBL) COMMENT='Average forecasted daily oil production in barrels'
  )
  COMMENT='Semantic model for production forecasts. Use for predicted/forecasted production volumes.'
  WITH EXTENSION (CA='{
    "verified_queries": [
      {
        "name": "forecasted_production_for_well",
        "question": "What is the forecasted production for [well name]?",
        "sql": "SELECT m.WELL_NAME, f.FORECAST_DATE, f.FORECASTED_OIL_BBL, f.FORECASTED_GAS_MCF, f.FORECASTED_WATER_BBL, f.FORECAST_TYPE FROM ENERGY_DEMO.WELLS.FORECASTED_PRODUCTION f JOIN ENERGY_DEMO.WELLS.WELL_METADATA m ON f.API_NO = m.API_NO WHERE m.WELL_NAME = :well_name ORDER BY f.FORECAST_DATE"
      },
      {
        "name": "total_forecasted_production",
        "question": "What is the total forecasted oil production?",
        "sql": "SELECT m.WELL_NAME, SUM(f.FORECASTED_OIL_BBL) as TOTAL_FORECASTED_OIL, SUM(f.FORECASTED_GAS_MCF) as TOTAL_FORECASTED_GAS, SUM(f.FORECASTED_WATER_BBL) as TOTAL_FORECASTED_WATER, MIN(f.FORECAST_DATE) as FORECAST_START, MAX(f.FORECAST_DATE) as FORECAST_END FROM ENERGY_DEMO.WELLS.FORECASTED_PRODUCTION f JOIN ENERGY_DEMO.WELLS.WELL_METADATA m ON f.API_NO = m.API_NO GROUP BY m.WELL_NAME"
      }
    ]
  }');

-- Grant access
GRANT SELECT ON SEMANTIC VIEW ENERGY_DEMO.WELLS.WELL_FORECAST_VIEW TO ROLE PUBLIC;
