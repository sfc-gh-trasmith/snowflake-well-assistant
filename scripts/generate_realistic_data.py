"""
Generate 2000 Delaware Basin wells with production health tiers:
- 80% healthy (normal decline, stable operations)
- 10% moderate unhealthy (elevated water cut, intermittent issues)
- 10% critical unhealthy (correlated with equipment failures)

Each well gets ~12 months of daily production + sensor data + maintenance history.
Unhealthy wells have correlated failure events.
"""

import csv
import os
import random
from datetime import date, datetime, timedelta

import numpy as np

random.seed(42)
np.random.seed(42)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

NUM_WELLS = 2000
OPERATOR = "Texas Energy LLC"

DELAWARE_BASIN_COUNTIES = {
    "Reeves": {"fips": "389", "lat_range": (31.0, 31.8), "lon_range": (-103.8, -103.1)},
    "Loving": {"fips": "301", "lat_range": (31.6, 32.0), "lon_range": (-104.0, -103.5)},
    "Ward": {"fips": "475", "lat_range": (31.2, 31.7), "lon_range": (-103.5, -103.0)},
    "Winkler": {
        "fips": "495",
        "lat_range": (31.7, 32.1),
        "lon_range": (-103.5, -103.0),
    },
    "Pecos": {"fips": "371", "lat_range": (30.5, 31.3), "lon_range": (-103.8, -102.5)},
    "Culberson": {
        "fips": "109",
        "lat_range": (31.3, 32.0),
        "lon_range": (-104.8, -104.0),
    },
}
COUNTY_WEIGHTS = [0.35, 0.10, 0.20, 0.10, 0.15, 0.10]

FORMATIONS = [
    "Wolfcamp A",
    "Wolfcamp B",
    "Wolfcamp C",
    "Bone Spring",
    "1st Bone Spring",
    "2nd Bone Spring",
    "3rd Bone Spring",
    "Delaware Mountain",
    "Avalon Shale",
    "Brushy Canyon",
]
FORMATION_WEIGHTS = [0.22, 0.18, 0.08, 0.12, 0.10, 0.08, 0.05, 0.07, 0.05, 0.05]

FIELDS = [
    "Pecos Valley",
    "Reeves County",
    "Delaware Basin",
    "Mentone",
    "Orla",
    "Toyah",
    "Balmorhea",
    "Loving",
    "Red Hills",
    "Ward-Estes",
    "Wink",
    "Kermit",
    "Monahans",
    "Coyanosa",
    "Fort Stockton",
    "Imperial",
    "Grandfalls",
    "Buena Vista",
    "Van Horn",
    "Culberson County",
]

LEASE_PREFIXES = [
    "University",
    "State",
    "Beal",
    "Bass",
    "Clayton",
    "Parker",
    "Mitchell",
    "Wheeler",
    "Hart",
    "Johnson",
    "Williams",
    "Thompson",
    "Anderson",
    "Davis",
    "Wilson",
    "Martin",
    "Taylor",
    "Moore",
    "Jackson",
    "Harris",
    "White",
    "King",
    "Scott",
    "Green",
    "Baker",
    "Adams",
    "Nelson",
    "Hill",
    "Campbell",
    "Turner",
    "Roberts",
    "Phillips",
    "Evans",
    "Edwards",
    "Collins",
    "Stewart",
    "Morris",
    "Rogers",
    "Reed",
    "Cook",
    "Morgan",
    "Bell",
    "Murphy",
    "Bailey",
    "Rivera",
    "Cooper",
    "Richardson",
    "Cox",
    "Howard",
    "Ward",
    "Torres",
    "Peterson",
    "Gray",
    "Ramirez",
    "James",
    "Watson",
    "Brooks",
    "Kelly",
    "Sanders",
    "Price",
    "Bennett",
    "Wood",
    "Barnes",
    "Ross",
    "Henderson",
    "Coleman",
    "Jenkins",
    "Perry",
    "Powell",
    "Long",
    "Patterson",
    "Hughes",
    "Flores",
    "Washington",
    "Butler",
    "Simmons",
    "Foster",
    "Bryant",
    "Alexander",
    "Russell",
    "Griffin",
    "Diaz",
    "Hayes",
    "Myers",
    "Ford",
    "Hamilton",
    "Graham",
    "Sullivan",
    "Wallace",
    "Woods",
    "Cole",
    "West",
    "Jordan",
    "Owens",
    "Reynolds",
    "Fisher",
    "Ellis",
    "Harrison",
    "Gibson",
    "Ranch",
    "Cattle Co",
    "Land Trust",
    "Minerals",
    "Resources",
]

HEALTHY_FAILURES = [
    "Routine preventive maintenance on ESP system including motor inspection and cable check",
    "Scheduled wellhead maintenance and valve replacement",
    "Quarterly ESP system diagnostic and vibration analysis completed",
    "Surface facility maintenance including separator cleaning and meter calibration",
    "Annual safety valve inspection and function test completed",
    "Routine tubing pressure test and casing inspection",
    "Corrosion coupon retrieval and analysis - 2 mpy average rate",
]

MODERATE_FAILURES = [
    "Elevated motor temperature detected, monitoring increased frequency",
    "Intermittent ESP trips due to gas slugging, VSD ramp adjusted",
    "Scale buildup detected in tubing, chemical squeeze scheduled",
    "Increasing water cut trend noted, zone isolation evaluation in progress",
    "Sand production increasing, pump wear accelerating",
    "Gas lift valve partially plugged, reduced injection efficiency",
    "Paraffin accumulation restricting flow, hot oil treatment performed",
    "Emulsion issues at separator requiring increased demulsifier dosage",
]

CRITICAL_FAILURES = [
    "ESP motor failure due to overheating, well shut-in pending replacement",
    "Tubing leak detected at depth, production ceased for workover",
    "Gas lift valve failure causing complete loss of artificial lift",
    "Downhole pump seized due to severe sand production, pulling unit dispatched",
    "Electrical cable failure on ESP causing complete shutdown",
    "Casing collapse detected during pressure test, integrity compromised",
    "Rod parting at depth, well dead, workover rig scheduled",
    "VSD drive failure causing ESP shutdown, replacement ordered",
    "Hole in tubing at 6500ft, severe production loss and gas migration",
    "Christmas tree valve failure, emergency well control initiated",
    "Complete ESP system failure - motor burnout and pump lockup",
    "Severe corrosion-induced tubing failure, well flowing up annulus",
]

EVENT_TYPES_HEALTHY = ["MAINTENANCE", "INSPECTION", "CHEMICAL_TREATMENT"]
EVENT_TYPES_MODERATE = [
    "MAINTENANCE",
    "EQUIPMENT_CHANGE",
    "CHEMICAL_TREATMENT",
    "INSPECTION",
]
EVENT_TYPES_CRITICAL = ["FAILURE", "WORKOVER", "FAILURE", "EQUIPMENT_CHANGE"]


def generate_wells():
    wells = []
    counties = list(DELAWARE_BASIN_COUNTIES.keys())
    used_apis = set()

    for i in range(NUM_WELLS):
        county = random.choices(counties, weights=COUNTY_WEIGHTS)[0]
        info = DELAWARE_BASIN_COUNTIES[county]

        well_seq = random.randint(30000, 99999)
        api_no = f"42-{info['fips']}-{well_seq:05d}"
        while api_no in used_apis:
            well_seq = random.randint(30000, 99999)
            api_no = f"42-{info['fips']}-{well_seq:05d}"
        used_apis.add(api_no)

        lat = round(random.uniform(*info["lat_range"]), 6)
        lon = round(random.uniform(*info["lon_range"]), 6)

        prefix = random.choice(LEASE_PREFIXES)
        well_num = random.randint(1, 12)
        suffix = random.choice(["H", "H", "H", "H", "V"])
        well_name = f"{prefix} {well_num}{suffix}"

        formation = random.choices(FORMATIONS, weights=FORMATION_WEIGHTS)[0]
        field = random.choice(FIELDS)

        if i < 200:
            health_tier = "critical"
            status = random.choice(["ACTIVE", "SHUT-IN", "SHUT-IN"])
        elif i < 400:
            health_tier = "moderate"
            status = "ACTIVE"
        else:
            health_tier = "healthy"
            status = random.choices(["ACTIVE", "SHUT-IN"], weights=[0.92, 0.08])[0]

        spud_year = random.randint(2022, 2025)
        spud_month = random.randint(1, 12)
        spud_day = random.randint(1, 28)
        spud_date = date(spud_year, spud_month, spud_day)
        first_prod_date = spud_date + timedelta(days=random.randint(45, 90))

        tvd = random.randint(8500, 13500)
        lateral_length = random.randint(5000, 15000)
        md = tvd + lateral_length + random.randint(-500, 500)
        perf_top = tvd - random.randint(100, 500)
        perf_bottom = tvd + random.randint(50, 300)

        wells.append(
            {
                "API_NO": api_no,
                "WELL_NAME": well_name,
                "FIELD": field,
                "OPERATOR": OPERATOR,
                "LATITUDE": lat,
                "LONGITUDE": lon,
                "COUNTY": county,
                "STATE": "TX",
                "FORMATION": formation,
                "STATUS": status,
                "SPUD_DATE": spud_date.isoformat(),
                "FIRST_PROD_DATE": first_prod_date.isoformat(),
                "TVD_FT": tvd,
                "MD_FT": md,
                "LATERAL_LENGTH_FT": lateral_length,
                "PERF_TOP_FT": perf_top,
                "PERF_BOTTOM_FT": perf_bottom,
                "_health_tier": health_tier,
            }
        )

    random.shuffle(wells)
    return wells


def generate_production(wells):
    production = []
    end_date = date(2026, 7, 15)

    for well in wells:
        first_prod = date.fromisoformat(well["FIRST_PROD_DATE"])
        if first_prod > end_date:
            first_prod = end_date - timedelta(days=random.randint(90, 365))

        tier = well["_health_tier"]

        initial_oil = random.uniform(400, 2200)
        initial_gas = initial_oil * random.uniform(2.0, 6.0)
        initial_water = random.uniform(100, 600)
        decline_rate = random.uniform(0.02, 0.06)

        current_date = first_prod
        day_count = 0
        max_days = (end_date - first_prod).days

        failure_start_day = None
        if tier == "critical":
            failure_start_day = max_days - random.randint(15, 90)
        elif tier == "moderate":
            failure_start_day = max_days - random.randint(30, 120)

        while current_date <= end_date and day_count <= max_days:
            t = day_count / 30.0
            decline_factor = np.exp(-decline_rate * t)

            oil = initial_oil * decline_factor * random.uniform(0.90, 1.10)
            gas = initial_gas * decline_factor * random.uniform(0.90, 1.10)
            water = initial_water * (1 + t * 0.02) * random.uniform(0.92, 1.08)
            runtime = max(0, min(24, random.gauss(22.5, 1.5)))

            if failure_start_day and day_count >= failure_start_day:
                days_into_failure = day_count - failure_start_day

                if tier == "critical":
                    severity = min(1.0, days_into_failure / 20.0)
                    oil *= max(0.05, 1 - severity * 0.85)
                    gas *= max(0.1, 1 - severity * 0.7)
                    water *= 1 + severity * 2.5
                    runtime *= max(0.1, 1 - severity * 0.8)
                    oil += random.gauss(0, oil * 0.15)
                    gas += random.gauss(0, gas * 0.2)

                elif tier == "moderate":
                    severity = min(1.0, days_into_failure / 45.0)
                    oil *= max(0.4, 1 - severity * 0.4)
                    gas *= max(0.5, 1 - severity * 0.3)
                    water *= 1 + severity * 1.2
                    runtime *= max(0.6, 1 - severity * 0.3)
                    if random.random() < 0.1 * severity:
                        oil *= random.uniform(0.3, 0.7)
                        runtime *= random.uniform(0.4, 0.8)

            oil = max(0, oil)
            gas = max(0, gas)
            water = max(0, water)
            runtime = max(0, min(24, runtime))

            production.append(
                {
                    "API_NO": well["API_NO"],
                    "PRODUCTION_DATE": current_date.isoformat(),
                    "OIL_BBL": round(oil, 1),
                    "GAS_MCF": round(gas, 1),
                    "WATER_BBL": round(water, 1),
                    "RUNTIME_HOURS": round(runtime, 1),
                }
            )

            current_date += timedelta(days=1)
            day_count += 1

    return production


def generate_sensors(wells):
    sensors = []
    now = datetime(2026, 7, 15, 0, 0, 0)

    for well in wells:
        if well["STATUS"] == "P&A":
            continue
        tier = well["_health_tier"]
        num_readings = 168

        base_intake_psi = random.uniform(900, 2200)
        base_discharge_psi = random.uniform(1800, 3800)
        base_motor_temp = random.uniform(190, 260)
        base_motor_amps = random.uniform(40, 110)
        base_vibration = random.uniform(0.1, 0.6)
        base_wellhead_psi = random.uniform(150, 700)
        base_wellhead_temp = random.uniform(100, 155)
        base_freq = random.uniform(48, 62)

        for h in range(num_readings):
            ts = now - timedelta(hours=num_readings - h)
            progress = h / num_readings

            intake = base_intake_psi + random.gauss(0, 20)
            discharge = base_discharge_psi + random.gauss(0, 40)
            motor_temp = base_motor_temp + random.gauss(0, 3)
            motor_amps = base_motor_amps + random.gauss(0, 2)
            vibration = base_vibration + random.gauss(0, 0.03)
            wellhead_psi = base_wellhead_psi + random.gauss(0, 10)
            wellhead_temp = base_wellhead_temp + random.gauss(0, 2)
            freq = base_freq + random.gauss(0, 0.3)

            if tier == "critical" and progress > 0.5:
                severity = (progress - 0.5) * 2
                motor_temp += severity * 40
                motor_amps += severity * 25
                vibration += severity * 0.8
                intake -= severity * 300
                discharge += severity * 200
                if random.random() < severity * 0.05:
                    motor_amps *= random.uniform(1.5, 2.5)
                    vibration *= random.uniform(2, 4)

            elif tier == "moderate" and progress > 0.6:
                severity = (progress - 0.6) * 2.5
                motor_temp += severity * 15
                vibration += severity * 0.3
                intake -= severity * 100
                if random.random() < severity * 0.02:
                    motor_amps *= random.uniform(1.2, 1.5)

            sensors.append(
                {
                    "API_NO": well["API_NO"],
                    "WELL_NAME": well["WELL_NAME"],
                    "READING_TS": ts.isoformat(),
                    "INTAKE_PRESSURE_PSI": round(max(0, intake), 1),
                    "DISCHARGE_PRESSURE_PSI": round(max(0, discharge), 1),
                    "MOTOR_TEMP_F": round(motor_temp, 1),
                    "MOTOR_AMPS": round(max(0, motor_amps), 1),
                    "VIBRATION_IPS": round(max(0.01, vibration), 3),
                    "WELLHEAD_PRESSURE_PSI": round(max(0, wellhead_psi), 1),
                    "WELLHEAD_TEMP_F": round(wellhead_temp, 1),
                    "FREQUENCY_HZ": round(freq, 1),
                }
            )

    return sensors


def generate_history(wells):
    history = []
    event_id = 1

    for well in wells:
        tier = well["_health_tier"]
        first_prod = date.fromisoformat(well["FIRST_PROD_DATE"])
        end_date = date(2026, 7, 15)
        days_producing = (end_date - first_prod).days

        if tier == "critical":
            num_events = random.randint(4, 10)
            event_types = EVENT_TYPES_CRITICAL
            descriptions = CRITICAL_FAILURES
        elif tier == "moderate":
            num_events = random.randint(3, 7)
            event_types = EVENT_TYPES_MODERATE
            descriptions = MODERATE_FAILURES
        else:
            num_events = random.randint(1, 4)
            event_types = EVENT_TYPES_HEALTHY
            descriptions = HEALTHY_FAILURES

        for j in range(num_events):
            event_type = random.choice(event_types)

            if tier == "critical" and j >= num_events - 2:
                event_type = "FAILURE"
                description = random.choice(CRITICAL_FAILURES)
                days_offset = days_producing - random.randint(5, 60)
            elif tier == "moderate" and j >= num_events - 1:
                event_type = random.choice(["FAILURE", "EQUIPMENT_CHANGE"])
                description = random.choice(MODERATE_FAILURES)
                days_offset = days_producing - random.randint(20, 90)
            else:
                description = random.choice(descriptions)
                days_offset = random.randint(0, max(1, days_producing - 30))

            event_date = first_prod + timedelta(days=days_offset)
            if event_date > end_date:
                event_date = end_date - timedelta(days=random.randint(1, 30))

            if event_type == "FAILURE":
                duration = round(random.uniform(24, 480), 1)
                cost = round(random.uniform(25000, 800000), 2)
            elif event_type == "WORKOVER":
                duration = round(random.uniform(48, 720), 1)
                cost = round(random.uniform(100000, 2000000), 2)
            elif event_type == "EQUIPMENT_CHANGE":
                duration = round(random.uniform(12, 168), 1)
                cost = round(random.uniform(15000, 300000), 2)
            else:
                duration = round(random.uniform(2, 48), 1)
                cost = round(random.uniform(500, 25000), 2)

            history.append(
                {
                    "EVENT_ID": f"EVT-{event_id:06d}",
                    "API_NO": well["API_NO"],
                    "WELL_NAME": well["WELL_NAME"],
                    "FIELD": well["FIELD"],
                    "EVENT_DATE": event_date.isoformat(),
                    "EVENT_TYPE": event_type,
                    "EVENT_DESCRIPTION": description,
                    "DURATION_HOURS": duration,
                    "COST_USD": cost,
                }
            )
            event_id += 1

    return history


def write_csv(filename, data, fieldnames):
    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data)
    print(f"  Written {len(data):,} rows to {filepath}")


def main():
    print(
        "Generating 2000 Delaware Basin wells (80% healthy, 10% moderate, 10% critical)..."
    )
    wells = generate_wells()

    tiers = {"healthy": 0, "moderate": 0, "critical": 0}
    for w in wells:
        tiers[w["_health_tier"]] += 1
    print(f"  Tiers: {tiers}")

    print("Generating production data (all wells, full history)...")
    production = generate_production(wells)
    print(f"  Generated {len(production):,} production records")

    print("Generating sensor data (168 hrs per well)...")
    sensors = generate_sensors(wells)
    print(f"  Generated {len(sensors):,} sensor records")

    print("Generating well history (correlated with health tier)...")
    history = generate_history(wells)
    print(f"  Generated {len(history):,} history events")

    print("\nWriting CSV files...")
    write_csv(
        "well_metadata.csv",
        wells,
        [
            "API_NO",
            "WELL_NAME",
            "FIELD",
            "OPERATOR",
            "LATITUDE",
            "LONGITUDE",
            "COUNTY",
            "STATE",
            "FORMATION",
            "STATUS",
            "SPUD_DATE",
            "FIRST_PROD_DATE",
            "TVD_FT",
            "MD_FT",
            "LATERAL_LENGTH_FT",
            "PERF_TOP_FT",
            "PERF_BOTTOM_FT",
        ],
    )
    write_csv(
        "well_production.csv",
        production,
        [
            "API_NO",
            "PRODUCTION_DATE",
            "OIL_BBL",
            "GAS_MCF",
            "WATER_BBL",
            "RUNTIME_HOURS",
        ],
    )
    write_csv(
        "well_sensors.csv",
        sensors,
        [
            "API_NO",
            "WELL_NAME",
            "READING_TS",
            "INTAKE_PRESSURE_PSI",
            "DISCHARGE_PRESSURE_PSI",
            "MOTOR_TEMP_F",
            "MOTOR_AMPS",
            "VIBRATION_IPS",
            "WELLHEAD_PRESSURE_PSI",
            "WELLHEAD_TEMP_F",
            "FREQUENCY_HZ",
        ],
    )
    write_csv(
        "well_history.csv",
        history,
        [
            "EVENT_ID",
            "API_NO",
            "WELL_NAME",
            "FIELD",
            "EVENT_DATE",
            "EVENT_TYPE",
            "EVENT_DESCRIPTION",
            "DURATION_HOURS",
            "COST_USD",
        ],
    )

    print("\nDone! CSV files ready for Snowflake upload.")


if __name__ == "__main__":
    main()
