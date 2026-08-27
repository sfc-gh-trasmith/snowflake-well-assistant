"""
Utility functions for the Well Health Score ML pipeline.
Shared across all notebooks in this demo.
"""

import os
import numpy as np
import pandas as pd

DATABASE = "ENERGY_DEMO"
SCHEMA = "WELLS"
COMPUTE_POOL = "COCO_ML_COMPUTE_POOL"
STAGE = "MODELS_STAGE"
MODEL_NAME = "WELL_HEALTH_MODEL"
MODEL_VERSION = "V2"
EXPERIMENT_NAME = "WELL_HEALTH_ANOMALY_DETECTION"
SERVICE_NAME = "WELL_HEALTH_INFERENCE_SERVICE"

SENSOR_COLS = [
    "INTAKE_PRESSURE_PSI",
    "DISCHARGE_PRESSURE_PSI",
    "PRESSURE_DIFFERENTIAL",
    "MOTOR_TEMP_F",
    "MOTOR_AMPS",
    "VIBRATION_IPS",
    "WELLHEAD_PRESSURE_PSI",
    "WELLHEAD_TEMP_F",
    "FREQUENCY_HZ",
]

PROD_COLS = [
    "AVG_OIL",
    "AVG_GAS",
    "AVG_WATER",
    "AVG_RUNTIME",
    "AVG_WATER_CUT",
    "AVG_GOR",
]

FEATURE_COLS = SENSOR_COLS + PROD_COLS


def get_session(connection_name=None):
    """Create a Snowpark session using connection name."""
    from snowflake.snowpark import Session

    conn = connection_name or os.getenv("SNOWFLAKE_CONNECTION_NAME", "")
    session = Session.builder.configs({"connection_name": conn}).create()
    session.use_database(DATABASE)
    session.use_schema(SCHEMA)
    return session


def generate_sensor_data(
    n_wells=40, start_date="2025-02-01", hours_interval=6, n_readings=1464
):
    """Generate synthetic ESP sensor data for wells."""
    np.random.seed(42)
    dates = pd.date_range(
        start=start_date, periods=n_readings, freq=f"{hours_interval}h"
    )
    records = []

    for well_idx in range(n_wells):
        base_intake = 1800 + np.random.uniform(0, 600)
        base_discharge = 2800 + np.random.uniform(0, 600)
        base_temp = 220 + np.random.uniform(0, 40)
        base_amps = 45 + np.random.uniform(0, 20)
        base_vib = 0.15 + np.random.uniform(0, 0.2)
        base_whp = 350 + np.random.uniform(0, 200)
        base_wht = 135 + np.random.uniform(0, 25)
        base_freq = 45 + np.random.uniform(0, 10)

        for i, ts in enumerate(dates):
            drift = i / len(dates) * 0.1
            records.append(
                {
                    "WELL_IDX": well_idx,
                    "READING_TS": ts,
                    "INTAKE_PRESSURE_PSI": round(
                        base_intake + np.random.normal(0, 150) + 200 * np.sin(i / 50), 1
                    ),
                    "DISCHARGE_PRESSURE_PSI": round(
                        base_discharge
                        + np.random.normal(0, 100)
                        + 150 * np.sin(i / 60),
                        1,
                    ),
                    "MOTOR_TEMP_F": round(
                        base_temp
                        + np.random.normal(0, 10)
                        + 15 * np.sin(i / 80)
                        + drift * 20,
                        1,
                    ),
                    "MOTOR_AMPS": round(
                        base_amps + np.random.normal(0, 5) + 5 * np.sin(i / 40), 1
                    ),
                    "VIBRATION_IPS": round(
                        base_vib
                        + np.random.normal(0, 0.05)
                        + 0.05 * abs(np.sin(i / 100)),
                        3,
                    ),
                    "WELLHEAD_PRESSURE_PSI": round(
                        base_whp + np.random.normal(0, 40) + 50 * np.sin(i / 70), 1
                    ),
                    "WELLHEAD_TEMP_F": round(
                        base_wht + np.random.normal(0, 5) + 8 * np.sin(i / 90), 1
                    ),
                    "FREQUENCY_HZ": round(
                        base_freq + np.random.normal(0, 2.5) + 3 * np.sin(i / 120), 1
                    ),
                }
            )

    return pd.DataFrame(records)


def build_training_features(df_sensors, df_prod_agg):
    """Build feature matrix from sensors + production aggregates."""
    df = df_sensors[["API_NO"] + SENSOR_COLS].copy()
    df["PRESSURE_DIFFERENTIAL"] = (
        df["DISCHARGE_PRESSURE_PSI"] - df["INTAKE_PRESSURE_PSI"]
    )
    df = df.merge(df_prod_agg, on="API_NO", how="left").fillna(0)
    return df[FEATURE_COLS].values, FEATURE_COLS


def score_to_health(raw_scores, reference_scores):
    """Convert raw anomaly scores to 0-100 health scores using percentile mapping."""
    from scipy.stats import percentileofscore

    return np.array([percentileofscore(reference_scores, s) for s in raw_scores])
