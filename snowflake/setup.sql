-- ============================================
-- Snow Well Assistant Demo - Snowflake Setup
-- ============================================

-- Use appropriate role
USE ROLE ACCOUNTADMIN;

-- Create compute pool for SPCS
CREATE COMPUTE POOL IF NOT EXISTS WELL_APP_POOL
  MIN_NODES = 1
  MAX_NODES = 2
  INSTANCE_FAMILY = CPU_X64_XS;

-- Create image repository
CREATE IMAGE REPOSITORY IF NOT EXISTS ENERGY_DEMO.WELLS.WELL_APP_REPO;

-- Get the registry URL (run this separately to get the URL)
SHOW IMAGE REPOSITORIES IN SCHEMA ENERGY_DEMO.WELLS;

-- ============================================
-- Cortex Search Service
-- ============================================
-- Enables semantic search over unstructured event/maintenance history

CREATE OR REPLACE CORTEX SEARCH SERVICE ENERGY_DEMO.WELLS.WELL_EVENTS_SEARCH
  ON EVENT_DESCRIPTION
  ATTRIBUTES WELL_NAME, FIELD, API_NO, EVENT_TYPE, EVENT_DATE, COST_USD, DURATION_HOURS
  WAREHOUSE = COMPUTE_WH
  TARGET_LAG = '1 hour'
  AS (
    SELECT
      EVENT_ID,
      WELL_NAME,
      FIELD,
      API_NO,
      EVENT_TYPE,
      TO_VARCHAR(EVENT_DATE, 'YYYY-MM-DD') AS EVENT_DATE,
      EVENT_DESCRIPTION,
      COST_USD::VARCHAR AS COST_USD,
      DURATION_HOURS::VARCHAR AS DURATION_HOURS
    FROM ENERGY_DEMO.WELLS.WELL_HISTORY
  );

-- Cortex Agent: See agent.sql

-- Grant necessary permissions (adjust role as needed)
GRANT USAGE ON DATABASE ENERGY_DEMO TO ROLE PUBLIC;
GRANT USAGE ON SCHEMA ENERGY_DEMO.WELLS TO ROLE PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA ENERGY_DEMO.WELLS TO ROLE PUBLIC;
GRANT USAGE ON CORTEX SEARCH SERVICE ENERGY_DEMO.WELLS.WELL_EVENTS_SEARCH TO ROLE PUBLIC;
GRANT SELECT ON SEMANTIC VIEW ENERGY_DEMO.WELLS.WELL_ANALYTICS_VIEW TO ROLE PUBLIC;
GRANT USAGE ON AGENT ENERGY_DEMO.WELLS.WELL_ANALYTICS_AGENT TO ROLE PUBLIC;

-- Create the SPCS service (run after pushing the Docker image)

-- Network rule + EAI for Mapbox (browser needs to fetch map tiles)
CREATE OR REPLACE NETWORK RULE ENERGY_DEMO.WELLS.MAPBOX_API_RULE
  MODE = EGRESS
  TYPE = HOST_PORT
  VALUE_LIST = (
    'api.mapbox.com:443',
    'tiles.mapbox.com:443',
    'a.tiles.mapbox.com:443',
    'b.tiles.mapbox.com:443',
    'c.tiles.mapbox.com:443',
    'd.tiles.mapbox.com:443',
    'events.mapbox.com:443'
  );

CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION MAPBOX_EAI
  ALLOWED_NETWORK_RULES = (ENERGY_DEMO.WELLS.MAPBOX_API_RULE)
  ENABLED = TRUE;

CREATE SERVICE ENERGY_DEMO.WELLS.WELL_ANALYTICS_SERVICE
  IN COMPUTE POOL WELL_APP_POOL
  EXTERNAL_ACCESS_INTEGRATIONS = (MAPBOX_EAI)
  QUERY_WAREHOUSE = COMPUTE_WH
  MIN_INSTANCES = 1
  MAX_INSTANCES = 1
  FROM SPECIFICATION $$
spec:
  containers:
    - name: well-analytics
      image: /ENERGY_DEMO/WELLS/WELL_APP_REPO/well-analytics-app:latest
      env:
        SNOWFLAKE_WAREHOUSE: COMPUTE_WH
        PORT: "8000"
      resources:
        requests:
          cpu: 500m
          memory: 1Gi
        limits:
          cpu: 2000m
          memory: 4Gi
      readinessProbe:
        port: 8000
        path: /api/health
  endpoints:
    - name: app
      port: 8000
      public: true
$$;

GRANT SERVICE ROLE ENERGY_DEMO.WELLS.WELL_ANALYTICS_SERVICE!ALL_ENDPOINTS_USAGE TO ROLE ACCOUNTADMIN;

-- Check service status
-- SELECT SYSTEM$GET_SERVICE_STATUS('ENERGY_DEMO.WELLS.WELL_ANALYTICS_SERVICE');

-- Get the public endpoint URL
-- SHOW ENDPOINTS IN SERVICE ENERGY_DEMO.WELLS.WELL_ANALYTICS_SERVICE;

-- View service logs (for debugging)
-- SELECT SYSTEM$GET_SERVICE_LOGS('ENERGY_DEMO.WELLS.WELL_ANALYTICS_SERVICE', 0, 'well-analytics');
