import os
import snowflake.connector

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CONNECTION_NAME = os.getenv("SNOWFLAKE_CONNECTION_NAME", "Trace-CoCo")
PRIVATE_KEY_FILE = os.path.expanduser("~/.snowflake/keys/rsa_key.p8")


def get_connection():
    return snowflake.connector.connect(
        connection_name=CONNECTION_NAME,
        private_key_file=PRIVATE_KEY_FILE,
    )


def upload_data():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("USE DATABASE ENERGY_DEMO")
    cursor.execute("USE SCHEMA WELLS")
    cursor.execute("USE WAREHOUSE COMPUTE_WH")

    print("Creating internal stage...")
    cursor.execute("CREATE OR REPLACE STAGE well_data_stage")

    files = {
        "well_metadata.csv": "WELL_METADATA",
        "well_production.csv": "WELL_PRODUCTION",
        "well_sensors.csv": "WELL_SENSORS",
        "well_history.csv": "WELL_HISTORY",
    }

    for filename, table in files.items():
        filepath = os.path.join(DATA_DIR, filename)
        print(f"\nUploading {filename}...")
        cursor.execute(
            f"PUT file://{filepath} @well_data_stage AUTO_COMPRESS=TRUE OVERWRITE=TRUE"
        )
        print("  PUT complete")

    print("\n--- Truncating and loading tables ---")

    print("\nLoading WELL_METADATA...")
    cursor.execute("TRUNCATE TABLE WELL_METADATA")
    cursor.execute("""
        COPY INTO WELL_METADATA (
            API_NO, WELL_NAME, FIELD, OPERATOR, LATITUDE, LONGITUDE,
            COUNTY, STATE, FORMATION, STATUS, SPUD_DATE, FIRST_PROD_DATE,
            TVD_FT, MD_FT, LATERAL_LENGTH_FT, PERF_TOP_FT, PERF_BOTTOM_FT
        )
        FROM @well_data_stage/well_metadata.csv.gz
        FILE_FORMAT = (TYPE='CSV' SKIP_HEADER=1 FIELD_OPTIONALLY_ENCLOSED_BY='"' NULL_IF=(''))
        ON_ERROR = 'CONTINUE'
    """)
    result = cursor.fetchone()
    print(f"  Result: {result}")

    print("\nLoading WELL_PRODUCTION...")
    cursor.execute("TRUNCATE TABLE WELL_PRODUCTION")
    cursor.execute("""
        COPY INTO WELL_PRODUCTION (
            API_NO, PRODUCTION_DATE, OIL_BBL, GAS_MCF, WATER_BBL, RUNTIME_HOURS
        )
        FROM @well_data_stage/well_production.csv.gz
        FILE_FORMAT = (TYPE='CSV' SKIP_HEADER=1 FIELD_OPTIONALLY_ENCLOSED_BY='"' NULL_IF=(''))
        ON_ERROR = 'CONTINUE'
    """)
    result = cursor.fetchone()
    print(f"  Result: {result}")

    print("\nLoading WELL_SENSORS...")
    cursor.execute("TRUNCATE TABLE WELL_SENSORS")
    cursor.execute("""
        COPY INTO WELL_SENSORS (
            API_NO, WELL_NAME, READING_TS, INTAKE_PRESSURE_PSI,
            DISCHARGE_PRESSURE_PSI, MOTOR_TEMP_F, MOTOR_AMPS,
            VIBRATION_IPS, WELLHEAD_PRESSURE_PSI, WELLHEAD_TEMP_F, FREQUENCY_HZ
        )
        FROM @well_data_stage/well_sensors.csv.gz
        FILE_FORMAT = (TYPE='CSV' SKIP_HEADER=1 FIELD_OPTIONALLY_ENCLOSED_BY='"' NULL_IF=(''))
        ON_ERROR = 'CONTINUE'
    """)
    result = cursor.fetchone()
    print(f"  Result: {result}")

    print("\nLoading WELL_HISTORY...")
    cursor.execute("TRUNCATE TABLE WELL_HISTORY")
    cursor.execute("""
        COPY INTO WELL_HISTORY (
            EVENT_ID, API_NO, WELL_NAME, FIELD, EVENT_DATE,
            EVENT_TYPE, EVENT_DESCRIPTION, DURATION_HOURS, COST_USD
        )
        FROM @well_data_stage/well_history.csv.gz
        FILE_FORMAT = (TYPE='CSV' SKIP_HEADER=1 FIELD_OPTIONALLY_ENCLOSED_BY='"' NULL_IF=(''))
        ON_ERROR = 'CONTINUE'
    """)
    result = cursor.fetchone()
    print(f"  Result: {result}")

    print("\n--- Verifying counts ---")
    for table in ["WELL_METADATA", "WELL_PRODUCTION", "WELL_SENSORS", "WELL_HISTORY"]:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        count = cursor.fetchone()[0]
        print(f"  {table}: {count:,} rows")

    cursor.execute("DROP STAGE IF EXISTS well_data_stage")
    cursor.close()
    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    upload_data()
