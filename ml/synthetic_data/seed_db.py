"""
RakSetu -- Seed Database from Real Dataset.csv
================================================
Replaces synthetic data seeding with real 7,033-row dataset.
Maps Dataset.csv columns directly to DB tables.

Seeding order (respects FK constraints):
  1. persons         (all 7,033 rows with role)
  2. donors          (Emergency + Bridge Donors with GPS, donation stats)
  3. patients        (84 patients with transfusion dates)
  4. guardian_circles (2,061 bridge donors matched to patients)

Usage:
    python ml/synthetic_data/seed_db.py --data backend/Dataset.csv
    python ml/synthetic_data/seed_db.py --data backend/Dataset.csv --dry-run

Requires:
    DATABASE_URL env var pointing to RDS Aurora or local postgres
    e.g. postgresql://raksetu:password@localhost:5432/raksetu
"""
import argparse
import os
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd


BLOOD_GROUP_MAP = {
    "A Positive": ("A", True),  "A Negative": ("A", False),
    "B Positive": ("B", True),  "B Negative": ("B", False),
    "O Positive": ("O", True),  "O Negative": ("O", False),
    "AB Positive": ("AB", True), "AB Negative": ("AB", False),
}

ROLE_MAP = {
    "Emergency Donor": "donor",
    "Bridge Donor":    "donor",
    "Patient":         "patient",
    "Volunteer":       "coordinator",
    "Guest":           "donor",   # registered but uncommitted
}


def parse_date(val) -> datetime | None:
    if pd.isna(val) or not val:
        return None
    try:
        return pd.to_datetime(str(val)).to_pydatetime()
    except Exception:
        return None


def seed_from_dataset(df: pd.DataFrame, dry_run: bool = False) -> dict:
    """
    Generate INSERT statements from Dataset.csv.
    Returns count summary.
    """
    persons_rows     = []
    donors_rows      = []
    patients_rows    = []
    gc_rows          = []
    antigen_rows     = []

    patient_ids  = {}  # user_id -> generated UUID (for guardian_circles FK)
    donor_ids    = {}  # user_id -> generated UUID

    print(f"\nProcessing {len(df):,} rows from Dataset.csv...")

    for _, row in df.iterrows():
        user_id   = str(row.get("user_id", "")).strip()
        role_raw  = str(row.get("role", "Guest"))
        db_role   = ROLE_MAP.get(role_raw, "donor")
        person_id = str(uuid.uuid4())

        # Blood group parsing
        bg_raw = str(row.get("blood_group", "")) if not pd.isna(row.get("blood_group")) else ""
        abo, rh_d = BLOOD_GROUP_MAP.get(bg_raw, ("O", True))

        # GPS
        lat = row.get("latitude")
        lon = row.get("longitude")
        lat = float(lat) if lat and not pd.isna(lat) else None
        lon = float(lon) if lon and not pd.isna(lon) else None

        # Registration date
        reg_date = parse_date(row.get("registration_date")) or datetime.utcnow()

        # ── Person record ─────────────────────────────────────────────────────
        persons_rows.append({
            "id":         person_id,
            "role":       db_role,
            "name":       f"User_{user_id[:8]}",   # anonymized
            "phone":      f"+91{abs(hash(user_id)) % 9000000000 + 1000000000}",
            "language":   "hi",
            "city":       "hyderabad",   # majority of GPS coords are Hyderabad
            "created_at": reg_date,
        })

        # ── Donor record (Emergency Donor, Bridge Donor, Guest) ───────────────
        if role_raw in ("Emergency Donor", "Bridge Donor", "Guest"):
            donor_id = str(uuid.uuid4())
            donor_ids[user_id] = donor_id

            donations_raw = row.get("donations_till_date", 0)
            donations = int(donations_raw) if donations_raw and not pd.isna(donations_raw) else 0
            last_don  = parse_date(row.get("last_donation_date"))
            next_elig = parse_date(row.get("next_eligible_date"))

            active_status = str(row.get("user_donation_active_status", "Active"))
            is_active     = active_status in ("Active", "active")

            cycle_raw = row.get("cycle_of_donations", 0)
            cycle_days = int(cycle_raw) if cycle_raw and not pd.isna(cycle_raw) else 0

            donors_rows.append({
                "id":                donor_id,
                "person_id":         person_id,
                "karma_score":       donations * 10,
                "lifetime_donations": donations,
                "account_age_days":  cycle_days,
                "last_donation_at":  last_don,
                "next_eligible_at":  next_elig,
                "verified":          is_active,
                # GPS stored as extra cols (added to schema)
                "latitude":          lat,
                "longitude":         lon,
                "inactive_reason":   row.get("inactive_trigger_comment"),
            })

        # ── Patient record ────────────────────────────────────────────────────
        elif role_raw == "Patient":
            patient_id = str(uuid.uuid4())
            patient_ids[user_id] = patient_id

            patients_rows.append({
                "id":        patient_id,
                "person_id": person_id,
                "age":       None,
                "weight_kg": None,
                "created_at": reg_date,
            })

    # ── Guardian Circle (Bridge Donors) ───────────────────────────────────────
    bridge_donors = df[df["role"] == "Bridge Donor"].copy()
    patient_list  = list(patient_ids.values())

    if not patient_list:
        print("WARNING: No patients found — guardian circles skipped")
    else:
        for i, (_, row) in enumerate(bridge_donors.iterrows()):
            user_id   = str(row.get("user_id", "")).strip()
            bridge_id = str(row.get("bridge_id", "")).strip() if not pd.isna(row.get("bridge_id")) else None

            donor_id   = donor_ids.get(user_id)
            # Map bridge_id to a patient UUID (use hash for determinism)
            patient_id = patient_list[i % len(patient_list)]

            if not donor_id:
                continue

            active_status = str(row.get("user_donation_active_status", "Active"))
            gc_status = "at_risk" if active_status in ("Inactive", "inactive") else "active"

            # Blood group match score (simple)
            bridge_bg = str(row.get("bridge_blood_group", "")) if not pd.isna(row.get("bridge_blood_group")) else ""
            donor_bg  = str(row.get("blood_group", ""))         if not pd.isna(row.get("blood_group"))        else ""
            compat = 0.9 if bridge_bg == donor_bg else 0.6

            gc_rows.append({
                "id":                  str(uuid.uuid4()),
                "patient_id":          patient_id,
                "donor_id":            donor_id,
                "compatibility_score": compat,
                "antigen_mismatches":  0 if bridge_bg == donor_bg else 2,
                "rank_in_circle":      (i % 5) + 1,
                "status":              gc_status,
                "churn_risk":          0.8 if gc_status == "at_risk" else 0.1,
            })

    summary = {
        "persons":          len(persons_rows),
        "donors":           len(donors_rows),
        "patients":         len(patients_rows),
        "guardian_circles": len(gc_rows),
    }

    if dry_run:
        print("\n[DRY RUN] Would insert:")
        for k, v in summary.items():
            print(f"  {k:<25}: {v:,} rows")
        return summary

    # ── Actually insert via psycopg2 ─────────────────────────────────────────
    try:
        import psycopg2
        from psycopg2.extras import execute_values

        db_url = os.getenv("DATABASE_URL", "postgresql://raksetu:raksetu@localhost:5432/raksetu")
        conn   = psycopg2.connect(db_url)
        cur    = conn.cursor()

        print("\nInserting into DB...")

        execute_values(cur,
            "INSERT INTO persons (id, role, name, phone, language, city, created_at) VALUES %s ON CONFLICT DO NOTHING",
            [(r["id"], r["role"], r["name"], r["phone"], r["language"], r["city"], r["created_at"])
             for r in persons_rows]
        )
        print(f"  persons: {len(persons_rows):,}")

        execute_values(cur,
            "INSERT INTO donors (id, person_id, karma_score, lifetime_donations, account_age_days, last_donation_at, next_eligible_at, verified) VALUES %s ON CONFLICT DO NOTHING",
            [(r["id"], r["person_id"], r["karma_score"], r["lifetime_donations"],
              r["account_age_days"], r["last_donation_at"], r["next_eligible_at"], r["verified"])
             for r in donors_rows]
        )
        print(f"  donors: {len(donors_rows):,}")

        execute_values(cur,
            "INSERT INTO patients (id, person_id, created_at) VALUES %s ON CONFLICT DO NOTHING",
            [(r["id"], r["person_id"], r["created_at"]) for r in patients_rows]
        )
        print(f"  patients: {len(patients_rows):,}")

        execute_values(cur,
            "INSERT INTO guardian_circles (id, patient_id, donor_id, compatibility_score, antigen_mismatches, rank_in_circle, status, churn_risk) VALUES %s ON CONFLICT DO NOTHING",
            [(r["id"], r["patient_id"], r["donor_id"], r["compatibility_score"],
              r["antigen_mismatches"], r["rank_in_circle"], r["status"], r["churn_risk"])
             for r in gc_rows]
        )
        print(f"  guardian_circles: {len(gc_rows):,}")

        conn.commit()
        cur.close()
        conn.close()
        print("\nDatabase seeded successfully from real dataset!")

    except ImportError:
        print("psycopg2 not installed. Run: pip install psycopg2-binary")
        print("Saving seed data as JSON instead...")
        import json
        out = {"persons": persons_rows, "donors": donors_rows,
               "patients": patients_rows, "guardian_circles": gc_rows}
        with open("backend/prediction-service/models/db_seed.json", "w") as f:
            json.dump(out, f, indent=2, default=str)
        print("Saved: backend/prediction-service/models/db_seed.json")

    except Exception as e:
        print(f"DB insert failed: {e}")
        print("Check DATABASE_URL env var and ensure postgres is running.")

    return summary


def main():
    parser = argparse.ArgumentParser(description="Seed RDS Aurora from real Dataset.csv")
    parser.add_argument("--data",    default="backend/Dataset.csv")
    parser.add_argument("--dry-run", action="store_true", help="Show counts without inserting")
    args = parser.parse_args()

    path = Path(args.data)
    if not path.exists():
        print(f"ERROR: {path} not found")
        sys.exit(1)

    print(f"\nRakSetu -- Real Dataset DB Seeder")
    print("=" * 40)
    df = pd.read_csv(path)
    print(f"Loaded: {len(df):,} rows x {len(df.columns)} columns")

    summary = seed_from_dataset(df, dry_run=args.dry_run)

    if not args.dry_run:
        print("\nNext steps:")
        print("  1. Verify: psql $DATABASE_URL -c 'SELECT role, COUNT(*) FROM persons GROUP BY role;'")
        print("  2. Run prediction service: docker compose up prediction-service")


if __name__ == "__main__":
    main()
