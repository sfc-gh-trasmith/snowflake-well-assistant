"""
Train well health model using production + sensor features.
- Target: health tier (critical/moderate/healthy) mapped to anomaly probability
- Features: recent production trends, sensor stats, well metadata
- Registers model in Snowflake Model Registry
- Deploys as inference service
"""

import os
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import snowflake.connector
from snowflake.ml.registry import Registry

CONNECTION_NAME = os.getenv("SNOWFLAKE_CONNECTION_NAME", "Trace-CoCo")
PRIVATE_KEY_FILE = os.path.expanduser("~/.snowflake/keys/rsa_key.p8")
DATABASE = "ENERGY_DEMO"
SCHEMA = "WELLS"


def get_connection():
    return snowflake.connector.connect(
        connection_name=CONNECTION_NAME,
        private_key_file=PRIVATE_KEY_FILE,
    )


def build_features():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(f"USE DATABASE {DATABASE}")
    cursor.execute(f"USE SCHEMA {SCHEMA}")
    cursor.execute("USE WAREHOUSE COMPUTE_WH")

    print("Building feature table from production + sensor data...")

    cursor.execute("""
        CREATE OR REPLACE TABLE WELL_HEALTH_FEATURES AS
        WITH recent_prod AS (
            SELECT
                p.API_NO,
                AVG(p.OIL_BBL) AS avg_oil_7d,
                AVG(p.GAS_MCF) AS avg_gas_7d,
                AVG(p.WATER_BBL) AS avg_water_7d,
                AVG(p.RUNTIME_HOURS) AS avg_runtime_7d,
                STDDEV(p.OIL_BBL) AS std_oil_7d,
                STDDEV(p.WATER_BBL) AS std_water_7d,
                AVG(p.WATER_BBL) / NULLIF(AVG(p.OIL_BBL) + AVG(p.WATER_BBL), 0) AS water_cut_7d,
                MIN(p.OIL_BBL) AS min_oil_7d,
                MAX(p.OIL_BBL) AS max_oil_7d
            FROM WELL_PRODUCTION p
            WHERE p.PRODUCTION_DATE >= DATEADD('day', -7, (SELECT MAX(PRODUCTION_DATE) FROM WELL_PRODUCTION WHERE API_NO = p.API_NO))
            GROUP BY p.API_NO
        ),
        prev_prod AS (
            SELECT
                p.API_NO,
                AVG(p.OIL_BBL) AS avg_oil_prev_30d,
                AVG(p.GAS_MCF) AS avg_gas_prev_30d,
                AVG(p.WATER_BBL) AS avg_water_prev_30d,
                AVG(p.RUNTIME_HOURS) AS avg_runtime_prev_30d
            FROM WELL_PRODUCTION p
            WHERE p.PRODUCTION_DATE BETWEEN
                DATEADD('day', -37, (SELECT MAX(PRODUCTION_DATE) FROM WELL_PRODUCTION WHERE API_NO = p.API_NO))
                AND DATEADD('day', -7, (SELECT MAX(PRODUCTION_DATE) FROM WELL_PRODUCTION WHERE API_NO = p.API_NO))
            GROUP BY p.API_NO
        ),
        sensor_stats AS (
            SELECT
                API_NO,
                AVG(MOTOR_TEMP_F) AS avg_motor_temp,
                MAX(MOTOR_TEMP_F) AS max_motor_temp,
                AVG(MOTOR_AMPS) AS avg_motor_amps,
                MAX(MOTOR_AMPS) AS max_motor_amps,
                AVG(VIBRATION_IPS) AS avg_vibration,
                MAX(VIBRATION_IPS) AS max_vibration,
                AVG(INTAKE_PRESSURE_PSI) AS avg_intake_psi,
                STDDEV(INTAKE_PRESSURE_PSI) AS std_intake_psi,
                AVG(DISCHARGE_PRESSURE_PSI) AS avg_discharge_psi,
                AVG(FREQUENCY_HZ) AS avg_frequency,
                STDDEV(FREQUENCY_HZ) AS std_frequency
            FROM WELL_SENSORS
            GROUP BY API_NO
        ),
        failure_counts AS (
            SELECT
                API_NO,
                COUNT(*) AS total_events,
                SUM(CASE WHEN EVENT_TYPE = 'FAILURE' THEN 1 ELSE 0 END) AS failure_count,
                SUM(CASE WHEN EVENT_TYPE = 'WORKOVER' THEN 1 ELSE 0 END) AS workover_count
            FROM WELL_HISTORY
            GROUP BY API_NO
        )
        SELECT
            m.API_NO,
            COALESCE(rp.avg_oil_7d, 0) AS AVG_OIL_7D,
            COALESCE(rp.avg_gas_7d, 0) AS AVG_GAS_7D,
            COALESCE(rp.avg_water_7d, 0) AS AVG_WATER_7D,
            COALESCE(rp.avg_runtime_7d, 0) AS AVG_RUNTIME_7D,
            COALESCE(rp.std_oil_7d, 0) AS STD_OIL_7D,
            COALESCE(rp.std_water_7d, 0) AS STD_WATER_7D,
            COALESCE(rp.water_cut_7d, 0) AS WATER_CUT_7D,
            COALESCE(rp.min_oil_7d, 0) AS MIN_OIL_7D,
            COALESCE(rp.max_oil_7d, 0) AS MAX_OIL_7D,
            CASE
                WHEN COALESCE(pp.avg_oil_prev_30d, 0) > 0
                THEN (COALESCE(rp.avg_oil_7d, 0) - pp.avg_oil_prev_30d) / pp.avg_oil_prev_30d
                ELSE 0
            END AS OIL_DECLINE_RATE,
            CASE
                WHEN COALESCE(pp.avg_runtime_prev_30d, 0) > 0
                THEN (COALESCE(rp.avg_runtime_7d, 0) - pp.avg_runtime_prev_30d) / pp.avg_runtime_prev_30d
                ELSE 0
            END AS RUNTIME_CHANGE_RATE,
            CASE
                WHEN COALESCE(pp.avg_water_prev_30d, 0) > 0
                THEN (COALESCE(rp.avg_water_7d, 0) - pp.avg_water_prev_30d) / pp.avg_water_prev_30d
                ELSE 0
            END AS WATER_INCREASE_RATE,
            COALESCE(ss.avg_motor_temp, 0) AS AVG_MOTOR_TEMP,
            COALESCE(ss.max_motor_temp, 0) AS MAX_MOTOR_TEMP,
            COALESCE(ss.avg_motor_amps, 0) AS AVG_MOTOR_AMPS,
            COALESCE(ss.max_motor_amps, 0) AS MAX_MOTOR_AMPS,
            COALESCE(ss.avg_vibration, 0) AS AVG_VIBRATION,
            COALESCE(ss.max_vibration, 0) AS MAX_VIBRATION,
            COALESCE(ss.avg_intake_psi, 0) AS AVG_INTAKE_PSI,
            COALESCE(ss.std_intake_psi, 0) AS STD_INTAKE_PSI,
            COALESCE(ss.avg_discharge_psi, 0) AS AVG_DISCHARGE_PSI,
            COALESCE(ss.avg_frequency, 0) AS AVG_FREQUENCY,
            COALESCE(ss.std_frequency, 0) AS STD_FREQUENCY,
            COALESCE(fc.total_events, 0) AS TOTAL_EVENTS,
            COALESCE(fc.failure_count, 0) AS FAILURE_COUNT,
            COALESCE(fc.workover_count, 0) AS WORKOVER_COUNT,
            m.TVD_FT,
            m.LATERAL_LENGTH_FT
        FROM WELL_METADATA m
        LEFT JOIN recent_prod rp ON m.API_NO = rp.API_NO
        LEFT JOIN prev_prod pp ON m.API_NO = pp.API_NO
        LEFT JOIN sensor_stats ss ON m.API_NO = ss.API_NO
        LEFT JOIN failure_counts fc ON m.API_NO = fc.API_NO
        WHERE m.STATUS != 'P&A'
    """)
    print("  Feature table created.")

    print("Fetching features for training...")
    cursor.execute("SELECT * FROM WELL_HEALTH_FEATURES")
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    df = pd.DataFrame(rows, columns=columns)
    print(f"  {len(df)} wells with features")

    cursor.close()
    conn.close()
    return df


def assign_labels(df):
    """
    Label wells based on production/sensor anomaly patterns.
    Uses a composite anomaly score from multiple signals.
    """
    df = df.copy()

    score = np.zeros(len(df))

    mask = df["OIL_DECLINE_RATE"] < -0.3
    score[mask] += 2
    mask = (df["OIL_DECLINE_RATE"] < -0.1) & (df["OIL_DECLINE_RATE"] >= -0.3)
    score[mask] += 1

    mask = df["WATER_INCREASE_RATE"] > 1.0
    score[mask] += 2
    mask = (df["WATER_INCREASE_RATE"] > 0.3) & (df["WATER_INCREASE_RATE"] <= 1.0)
    score[mask] += 1

    mask = df["RUNTIME_CHANGE_RATE"] < -0.3
    score[mask] += 2
    mask = (df["RUNTIME_CHANGE_RATE"] < -0.1) & (df["RUNTIME_CHANGE_RATE"] >= -0.3)
    score[mask] += 1

    mask = df["MAX_VIBRATION"] > 1.0
    score[mask] += 2
    mask = (df["MAX_VIBRATION"] > 0.6) & (df["MAX_VIBRATION"] <= 1.0)
    score[mask] += 1

    mask = df["MAX_MOTOR_TEMP"] > 260
    score[mask] += 2
    mask = (df["MAX_MOTOR_TEMP"] > 240) & (df["MAX_MOTOR_TEMP"] <= 260)
    score[mask] += 1

    mask = df["FAILURE_COUNT"] >= 2
    score[mask] += 2
    mask = df["FAILURE_COUNT"] == 1
    score[mask] += 1

    df["ANOMALY_LABEL"] = 0
    df.loc[score >= 6, "ANOMALY_LABEL"] = 2  # critical
    df.loc[(score >= 3) & (score < 6), "ANOMALY_LABEL"] = 1  # moderate
    # 0 = healthy

    print(
        f"  Labels: healthy={sum(df['ANOMALY_LABEL'] == 0)}, moderate={sum(df['ANOMALY_LABEL'] == 1)}, critical={sum(df['ANOMALY_LABEL'] == 2)}"
    )
    return df


def train_model(df):
    feature_cols = [
        "AVG_OIL_7D",
        "AVG_GAS_7D",
        "AVG_WATER_7D",
        "AVG_RUNTIME_7D",
        "STD_OIL_7D",
        "STD_WATER_7D",
        "WATER_CUT_7D",
        "MIN_OIL_7D",
        "MAX_OIL_7D",
        "OIL_DECLINE_RATE",
        "RUNTIME_CHANGE_RATE",
        "WATER_INCREASE_RATE",
        "AVG_MOTOR_TEMP",
        "MAX_MOTOR_TEMP",
        "AVG_MOTOR_AMPS",
        "MAX_MOTOR_AMPS",
        "AVG_VIBRATION",
        "MAX_VIBRATION",
        "AVG_INTAKE_PSI",
        "STD_INTAKE_PSI",
        "AVG_DISCHARGE_PSI",
        "AVG_FREQUENCY",
        "STD_FREQUENCY",
        "TOTAL_EVENTS",
        "FAILURE_COUNT",
        "WORKOVER_COUNT",
        "TVD_FT",
        "LATERAL_LENGTH_FT",
    ]

    X = df[feature_cols].fillna(0)
    y = df["ANOMALY_LABEL"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"\nTraining GradientBoosting on {len(X_train)} samples...")
    model = GradientBoostingClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.1,
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    print("\nClassification Report (test set):")
    print(
        classification_report(
            y_test, y_pred, target_names=["healthy", "moderate", "critical"]
        )
    )

    proba = model.predict_proba(X_test)
    anomaly_proba = 1 - proba[:, 0]  # probability of NOT being healthy
    print(
        f"  Anomaly probability range: {anomaly_proba.min():.3f} - {anomaly_proba.max():.3f}"
    )
    print(f"  Mean for healthy: {anomaly_proba[y_test == 0].mean():.3f}")
    print(f"  Mean for moderate: {anomaly_proba[y_test == 1].mean():.3f}")
    print(f"  Mean for critical: {anomaly_proba[y_test == 2].mean():.3f}")

    return model, feature_cols, X_test


def register_and_deploy(model, feature_cols, sample_input):
    from snowflake.snowpark import Session

    print("\nConnecting to Snowflake for model registration...")
    session = Session.builder.configs(
        {
            "connection_name": CONNECTION_NAME,
            "private_key_file": PRIVATE_KEY_FILE,
        }
    ).create()
    session.use_database(DATABASE)
    session.use_schema(SCHEMA)
    session.use_warehouse("COMPUTE_WH")

    registry = Registry(session=session, database_name=DATABASE, schema_name=SCHEMA)

    sample_df = pd.DataFrame([sample_input.iloc[0].to_dict()])

    print("Logging model to registry...")
    mv = registry.log_model(
        model=model,
        model_name="WELL_HEALTH_MODEL",
        version_name="V3_RETRAINED",
        sample_input_data=sample_df,
        conda_dependencies=["scikit-learn"],
        comment="GBM classifier for well health. Outputs anomaly probability (1-P(healthy)). Trained on 2000 Delaware Basin wells with production+sensor+history features.",
    )
    print(f"  Model registered: {mv.model_name} version {mv.version_name}")

    print("Setting as default version...")
    m = registry.get_model("WELL_HEALTH_MODEL")
    m.default = mv
    print("  Default version updated.")

    print("\nDeploying inference service...")
    mv.create_service(
        service_name="WELL_HEALTH_INFERENCE_SERVICE",
        service_compute_pool="COCO_ML_COMPUTE_POOL",
        image_build_compute_pool="COCO_ML_COMPUTE_POOL",
        ingress_enabled=True,
        max_instances=1,
        force=True,
    )
    print("  Inference service deployed (may take a few minutes to become READY).")

    session.close()


def main():
    df = build_features()
    df = assign_labels(df)
    model, feature_cols, X_test = train_model(df)
    register_and_deploy(model, feature_cols, X_test)
    print("\nDone! Model trained, registered, and deployed.")


if __name__ == "__main__":
    main()
