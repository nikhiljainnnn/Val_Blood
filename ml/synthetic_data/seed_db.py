"""
Database seeder: reads JSONL files from generate.py and bulk-inserts into PostgreSQL.
Run AFTER generate.py:
  python generate.py --patients 200 --donors 1000
  python seed_db.py
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import datetime

import asyncpg

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:raksetu_dev@localhost/raksetu"
).replace("postgresql+asyncpg://", "postgresql://")

SEED_DIR = Path(os.getenv("SEED_DIR", "data/seed"))


async def seed():
    print(f"Connecting to database...")
    conn = await asyncpg.connect(DATABASE_URL)
    print("Connected.\n")

    try:
        # Order matters due to foreign keys
        await _seed_persons(conn)
        await _seed_patients(conn)
        await _seed_donors(conn)
        await _seed_antigen_profiles(conn)
        await _seed_hospitals(conn)
        await _seed_transfusion_events(conn)
        await _seed_donor_signals(conn)
        print("\n✅ Database seeded successfully.")
    finally:
        await conn.close()


async def _seed_persons(conn):
    path = SEED_DIR / "persons.jsonl"
    if not path.exists():
        print("  ⚠ persons.jsonl not found — skipping")
        return

    records = _load_jsonl(path)
    print(f"  Seeding {len(records):,} persons...")

    await conn.executemany(
        """
        INSERT INTO persons (id, role, name, phone, language, city, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
        ON CONFLICT (phone) DO NOTHING
        """,
        [
            (
                r["id"], r["role"], r["name"], r["phone"],
                r.get("language", "hi"), r.get("city", ""),
                _parse_dt(r.get("created_at")),
            )
            for r in records
        ]
    )
    print(f"    Done: persons")


async def _seed_patients(conn):
    path = SEED_DIR / "patients.jsonl"
    if not path.exists():
        return

    records = _load_jsonl(path)
    print(f"  Seeding {len(records):,} patients...")

    await conn.executemany(
        """
        INSERT INTO patients (
            id, person_id, age, weight_kg, splenomegaly, chelation_dose,
            hospital_id, thalassemia_type, transfusion_interval_days, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT DO NOTHING
        """,
        [
            (
                r["id"], r["person_id"], r.get("age", 10),
                r.get("weight_kg", 30.0), r.get("splenomegaly", False),
                r.get("chelation_dose", 0.0), r.get("hospital_id"),
                r.get("thalassemia_type", "major"),
                r.get("transfusion_interval_days", 21),
                _parse_dt(r.get("created_at")),
            )
            for r in records
        ]
    )
    print(f"    Done: patients")


async def _seed_donors(conn):
    path = SEED_DIR / "donors.jsonl"
    if not path.exists():
        return

    records = _load_jsonl(path)
    print(f"  Seeding {len(records):,} donors...")

    await conn.executemany(
        """
        INSERT INTO donors (
            id, person_id, karma_score, lifetime_donations,
            account_age_days, last_donation_at, next_eligible_at, verified, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT DO NOTHING
        """,
        [
            (
                r["id"], r["person_id"],
                r.get("karma_score", 0), r.get("lifetime_donations", 0),
                r.get("account_age_days", 0),
                _parse_dt(r.get("last_donation_at")),
                _parse_dt(r.get("next_eligible_at")),
                r.get("verified", False),
                _parse_dt(r.get("created_at")),
            )
            for r in records
        ]
    )
    print(f"    Done: donors")


async def _seed_antigen_profiles(conn):
    path = SEED_DIR / "antigen_profiles.jsonl"
    if not path.exists():
        return

    records = _load_jsonl(path)
    print(f"  Seeding {len(records):,} antigen profiles...")

    await conn.executemany(
        """
        INSERT INTO antigen_profiles (
            id, person_id, abo, rh_d, rh_c, "rh_C", rh_e, "rh_E",
            kell_k, "kell_K", duffy_fya, duffy_fyb,
            kidd_jka, kidd_jkb, "mns_M", "mns_N", "mns_S", mns_s,
            source, genotyped_at, created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        ON CONFLICT DO NOTHING
        """,
        [
            (
                r["id"], r["person_id"], r["abo"], r.get("rh_d", True),
                r.get("rh_c", True), r.get("rh_C", False),
                r.get("rh_e", True), r.get("rh_E", False),
                r.get("kell_k", True), r.get("kell_K", False),
                r.get("duffy_fya", False), r.get("duffy_fyb", False),
                r.get("kidd_jka", False), r.get("kidd_jkb", False),
                r.get("mns_M", False), r.get("mns_N", False),
                r.get("mns_S", False), r.get("mns_s", True),
                r.get("source", "serological"),
                _parse_dt(r.get("genotyped_at")),
                _parse_dt(r.get("created_at")),
            )
            for r in records
        ]
    )
    print(f"    Done: antigen_profiles")


async def _seed_hospitals(conn):
    print(f"  Seeding hospitals...")
    hospitals = [
        ("Mumbai", "mumbai",    19.0760,  72.8777),
        ("Delhi",  "delhi",     28.6139,  77.2090),
        ("Bengaluru", "bengaluru", 12.9716, 77.5946),
        ("Chennai", "chennai",  13.0827,  80.2707),
        ("Hyderabad", "hyderabad", 17.3850, 78.4867),
        ("Pune",   "pune",      18.5204,  73.8567),
        ("Ahmedabad", "ahmedabad", 23.0225, 72.5714),
        ("Kolkata", "kolkata",  22.5726,  88.3639),
    ]
    import uuid
    for name, city, lat, lng in hospitals:
        await conn.execute(
            """
            INSERT INTO hospitals (id, name, city, lat, lng, nabh_accredited)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
            """,
            str(uuid.uuid4()), f"{name} Thalassemia Center", city, lat, lng, True
        )
    print(f"    Done: hospitals")


async def _seed_transfusion_events(conn):
    path = SEED_DIR / "transfusion_events.jsonl"
    if not path.exists():
        return

    records = _load_jsonl(path)
    print(f"  Seeding {len(records):,} transfusion events...")

    # Batch insert 500 at a time
    batch_size = 500
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        await conn.executemany(
            """
            INSERT INTO transfusion_events (
                id, patient_id, donor_id, units, hb_pre, hb_post,
                days_since_last, hospital_id, outcome, transfused_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT DO NOTHING
            """,
            [
                (
                    r["id"], r["patient_id"], r.get("donor_id"),
                    r.get("units", 1),
                    r.get("hb_pre"), r.get("hb_post"),
                    r.get("days_since_last"),
                    r.get("hospital_id"),
                    r.get("outcome", "success"),
                    _parse_dt(r.get("transfused_at")),
                )
                for r in batch
            ]
        )
    print(f"    Done: transfusion_events")


async def _seed_donor_signals(conn):
    path = SEED_DIR / "donor_signals.jsonl"
    if not path.exists():
        return

    records = _load_jsonl(path)
    print(f"  Seeding {len(records):,} donor signals...")

    batch_size = 1000
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        await conn.executemany(
            """
            INSERT INTO donor_signals (id, donor_id, signal_type, value, ts)
            VALUES ($1, $2, $3, $4::jsonb, $5)
            ON CONFLICT DO NOTHING
            """,
            [
                (
                    r["id"], r["donor_id"], r["signal_type"],
                    r.get("value", "{}"),
                    _parse_dt(r.get("ts")),
                )
                for r in batch
            ]
        )
    print(f"    Done: donor_signals")


def _load_jsonl(path: Path) -> list[dict]:
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def _parse_dt(val) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:
        return datetime.utcnow()


if __name__ == "__main__":
    asyncio.run(seed())
