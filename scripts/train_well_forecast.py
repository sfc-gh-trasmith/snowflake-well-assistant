"""
Log ML.FORECAST model run to Snowflake Experiment Tracking.

The WELL_OIL_PRODUCTION_FORECAST model was already trained via SQL.
This script fetches its evaluation metrics and records the run in the
WELL_PRODUCTION_FORECAST experiment for full ML observability.

Usage:
    SNOWFLAKE_CONNECTION_NAME=Trace-CoCo python scripts/train_well_forecast.py
"""

import os
from snowflake.snowpark import Session

CONNECTION_NAME = os.getenv("SNOWFLAKE_CONNECTION_NAME", "Trace-CoCo")
DATABASE = "ENERGY_DEMO"
SCHEMA = "WELLS"

WELL_NAMES = {
    "42-389-77250": "Woods 6H",
    "42-301-45420": "Wilson 1V",
    "42-371-37128": "Patterson 8V",
    "42-389-77498": "Green 8H",
    "42-389-52825": "Scott 6V",
    "42-475-41157": "Jordan 6H",
    "42-371-67282": "Edwards 3V",
    "42-475-57028": "Land Trust 5V",
}


def main():
    print("Connecting to Snowflake...")
    connection_params = {"connection_name": CONNECTION_NAME}
    session = Session.builder.configs(connection_params).create()
    session.use_database(DATABASE)
    session.use_schema(SCHEMA)
    session.use_warehouse("COMPUTE_WH")

    print("Fetching evaluation metrics from WELL_OIL_PRODUCTION_FORECAST...")
    metrics_df = session.sql(
        "CALL ENERGY_DEMO.WELLS.WELL_OIL_PRODUCTION_FORECAST!SHOW_EVALUATION_METRICS()"
    ).to_pandas()

    # Pivot: one row per (series, metric)
    mape_by_well = {}
    mae_by_well = {}
    mda_by_well = {}
    for _, row in metrics_df.iterrows():
        series = row["SERIES"]
        metric = row["ERROR_METRIC"]
        value = float(row["METRIC_VALUE"]) if row["METRIC_VALUE"] is not None else None
        if metric == "MAPE":
            mape_by_well[series] = value
        elif metric == "MAE":
            mae_by_well[series] = value
        elif metric == "MDA":
            mda_by_well[series] = value

    avg_mape = sum(mape_by_well.values()) / len(mape_by_well) if mape_by_well else None
    avg_mae = sum(mae_by_well.values()) / len(mae_by_well) if mae_by_well else None

    print(
        f"  Average MAPE across {len(WELL_NAMES)} wells: {avg_mape:.3f}"
        if avg_mape
        else "  MAPE unavailable"
    )

    # Log to Snowflake Experiment Tracking
    try:
        from snowflake.ml.experiment import Experiment

        exp = Experiment(
            session=session,
            database=DATABASE,
            schema=SCHEMA,
            name="WELL_PRODUCTION_FORECAST",
        )

        with exp.start_run(run_name="ML_FORECAST_V1_2026_07") as run:
            # Parameters
            run.log_parameter("model_type", "SNOWFLAKE.ML.FORECAST")
            run.log_parameter("wells_count", len(WELL_NAMES))
            run.log_parameter("forecast_horizon_days", 90)
            run.log_parameter("prediction_interval", 0.9)
            run.log_parameter(
                "training_table", "ENERGY_DEMO.WELLS.WELL_OIL_FORECAST_INPUT"
            )
            run.log_parameter("output_table", "ENERGY_DEMO.WELLS.FORECASTED_PRODUCTION")
            run.log_parameter("model_version", "ML_FORECAST_V1")

            # Aggregate metrics
            if avg_mape is not None:
                run.log_metric("avg_mape", round(avg_mape, 4))
            if avg_mae is not None:
                run.log_metric("avg_mae", round(avg_mae, 2))

            # Per-well metrics
            for api_no, name in WELL_NAMES.items():
                safe = name.replace(" ", "_").replace("/", "_")
                if api_no in mape_by_well and mape_by_well[api_no] is not None:
                    run.log_metric(f"mape_{safe}", round(mape_by_well[api_no], 4))
                if api_no in mae_by_well and mae_by_well[api_no] is not None:
                    run.log_metric(f"mae_{safe}", round(mae_by_well[api_no], 2))
                if api_no in mda_by_well and mda_by_well[api_no] is not None:
                    run.log_metric(f"mda_{safe}", round(mda_by_well[api_no], 3))

        print("Experiment run logged: ML_FORECAST_V1_2026_07")
        print(f"  View in Snowsight: {DATABASE}.{SCHEMA}.WELL_PRODUCTION_FORECAST")

    except ImportError:
        print("snowflake-ml-python not installed — skipping experiment tracking.")
        print("Install with: pip install snowflake-ml-python")

    session.close()
    print("Done.")


if __name__ == "__main__":
    main()
