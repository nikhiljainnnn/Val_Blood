"""
RakSetu Synthetic Data Generator
Generates realistic demo data for all models and the demo database.
Run: python generate.py --patients 500 --donors 5000 --seed 42
"""
import argparse
import json
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

# ─── Indian blood group frequency (ICMR data) ─────────────────────────────────
ABO_DIST  = {"B": 0.38, "O": 0.29, "A": 0.23, "AB": 0.10}
RH_POS    = 0.93   # 93% Rh+ in India

# ─── Antigen frequencies in Indian population ─────────────────────────────────
ANTIGEN_FREQS = {
    "rh_C":      0.68,
    "rh_c":      0.80,
    "rh_E":      0.29,
    "rh_e":      0.98,
    "kell_K":    0.09,   # K is rare in India (~9%)
    "kell_k":    0.99,
    "duffy_fya": 0.66,
    "duffy_fyb": 0.83,
    "kidd_jka":  0.77,
    "kidd_jkb":  0.72,
    "mns_M":     0.78,
    "mns_N":     0.72,
    "mns_S":     0.55,
    "mns_s":     0.89,
}

CITIES = [
    "mumbai", "delhi", "bengaluru", "chennai",
    "hyderabad", "pune", "ahmedabad", "kolkata"
]
CITY_LANG = {
    "mumbai": "hi", "delhi": "hi", "bengaluru": "kn",
    "chennai": "ta", "hyderabad": "te", "pune": "mr",
    "ahmedabad": "gu", "kolkata": "bn",
}

FIRST_NAMES = [
    "Aarav", "Arjun", "Vikram", "Priya", "Ananya", "Ravi", "Meena",
    "Suresh", "Kavya", "Rajesh", "Deepa", "Amit", "Pooja", "Rohit",
    "Sunita", "Karthik", "Lakshmi", "Sanjay", "Divya", "Arun",
    "Radha", "Mohan", "Geeta", "Vijay", "Nisha", "Kumar", "Rekha",
]
LAST_NAMES = [
    "Sharma", "Patel", "Kumar", "Singh", "Reddy", "Nair", "Iyer",
    "Gupta", "Joshi", "Mehta", "Rao", "Verma", "Agarwal", "Shah",
    "Pillai", "Menon", "Chatterjee", "Mukherjee", "Das", "Bose",
]


def gen_uuid() -> str:
    return str(uuid.uuid4())


def gen_phone() -> str:
    prefix = random.choice(["6", "7", "8", "9"])
    return f"+91{prefix}" + "".join([str(random.randint(0, 9)) for _ in range(9)])


def gen_name() -> str:
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def gen_antigen_profile(person_id: str) -> dict:
    abo = np.random.choice(list(ABO_DIST.keys()), p=list(ABO_DIST.values()))
    profile = {
        "id":        gen_uuid(),
        "person_id": person_id,
        "abo":       abo,
        "rh_d":      random.random() < RH_POS,
        "source":    "serological",
        "genotyped_at": (datetime.utcnow() - timedelta(days=random.randint(0, 365))).isoformat(),
        "created_at":   datetime.utcnow().isoformat(),
    }
    for antigen, freq in ANTIGEN_FREQS.items():
        profile[antigen] = random.random() < freq
    return profile


def gen_hb_series(interval_days: int, n: int = 14) -> list[dict]:
    """Simulate realistic Hb sawtooth over n transfusion cycles."""
    series = []
    date   = datetime.utcnow() - timedelta(days=interval_days * n)

    hb_post = random.uniform(9.5, 11.0)
    for i in range(n):
        hb_pre  = hb_post - random.uniform(0.08, 0.18) * interval_days + random.gauss(0, 0.2)
        hb_pre  = max(6.0, hb_pre)
        hb_post = random.uniform(9.5, 11.0)
        series.append({
            "hb_pre":         round(hb_pre, 1),
            "hb_post":        round(hb_post, 1),
            "days_since_last": interval_days + random.randint(-3, 3),
            "transfused_at":  date.isoformat(),
        })
        date += timedelta(days=interval_days)
    return series


def generate_patients(n: int) -> tuple[list, list, list, list]:
    """Returns (persons, patients, antigen_profiles, transfusion_events)"""
    persons, patients, profiles, events = [], [], [], []
    hospital_ids = [gen_uuid() for _ in range(8)]

    for _ in range(n):
        city      = random.choice(CITIES)
        person_id = gen_uuid()
        patient_id = gen_uuid()

        person = {
            "id":         person_id,
            "role":       "patient",
            "name":       gen_name(),
            "phone":      gen_phone(),
            "language":   CITY_LANG.get(city, "hi"),
            "city":       city,
            "created_at": (datetime.utcnow() - timedelta(days=random.randint(180, 1800))).isoformat(),
        }

        interval = random.randint(14, 28)
        patient = {
            "id":                        patient_id,
            "person_id":                 person_id,
            "age":                       max(1, int(np.random.lognormal(2.5, 0.6))),
            "weight_kg":                 round(random.uniform(15, 70), 1),
            "splenomegaly":              random.random() < 0.35,
            "chelation_dose":            round(random.uniform(0, 40), 1),
            "hospital_id":               random.choice(hospital_ids),
            "thalassemia_type":          random.choices(["major", "intermedia"], weights=[0.7, 0.3])[0],
            "transfusion_interval_days": interval,
            "created_at":                person["created_at"],
        }

        profile    = gen_antigen_profile(person_id)
        hb_series  = gen_hb_series(interval)
        for ev in hb_series:
            events.append({
                "id":             gen_uuid(),
                "patient_id":     patient_id,
                "donor_id":       None,
                "units":          random.randint(1, 2),
                "hb_pre":         ev["hb_pre"],
                "hb_post":        ev["hb_post"],
                "days_since_last": ev["days_since_last"],
                "hospital_id":    patient["hospital_id"],
                "outcome":        random.choices(["success", "delayed"], weights=[0.95, 0.05])[0],
                "transfused_at":  ev["transfused_at"],
            })

        persons.append(person)
        patients.append(patient)
        profiles.append(profile)

    return persons, patients, profiles, events


def generate_donors(n: int) -> tuple[list, list, list, list]:
    """Returns (persons, donors, antigen_profiles, signals)"""
    persons, donors, profiles, signals = [], [], [], []

    for i in range(n):
        city      = random.choice(CITIES)
        person_id = gen_uuid()
        donor_id  = gen_uuid()

        account_age = random.randint(30, 1200)
        lifetime_d  = random.randint(0, max(1, account_age // 60))

        last_donation = None
        if lifetime_d > 0:
            last_donation = (
                datetime.utcnow() - timedelta(days=random.randint(0, 180))
            ).isoformat()

        person = {
            "id":         person_id,
            "role":       "donor",
            "name":       gen_name(),
            "phone":      gen_phone(),
            "language":   CITY_LANG.get(city, "hi"),
            "city":       city,
            "created_at": (datetime.utcnow() - timedelta(days=account_age)).isoformat(),
        }

        donor = {
            "id":                  donor_id,
            "person_id":           person_id,
            "karma_score":         random.randint(0, lifetime_d * 150),
            "lifetime_donations":  lifetime_d,
            "account_age_days":    account_age,
            "last_donation_at":    last_donation,
            "next_eligible_at":    (
                datetime.fromisoformat(last_donation) + timedelta(days=56)
            ).isoformat() if last_donation else None,
            "verified":            random.random() < 0.75,
            "created_at":          person["created_at"],
        }

        profile = gen_antigen_profile(person_id)
        profiles.append(profile)

        # Generate behavioral signals
        base_date = datetime.utcnow() - timedelta(days=90)
        for day in range(90):
            date = base_date + timedelta(days=day)
            # Message open (if active donor)
            if random.random() < 0.15:
                signals.append({
                    "id":          gen_uuid(),
                    "donor_id":    donor_id,
                    "signal_type": "msg_open",
                    "value":       json.dumps({"channel": "whatsapp"}),
                    "ts":          date.isoformat(),
                })
            if random.random() < 0.07:
                signals.append({
                    "id":          gen_uuid(),
                    "donor_id":    donor_id,
                    "signal_type": "msg_reply",
                    "value":       json.dumps({"response": "1"}),
                    "ts":          date.isoformat(),
                })
            if random.random() < 0.03:
                signals.append({
                    "id":          gen_uuid(),
                    "donor_id":    donor_id,
                    "signal_type": "app_login",
                    "value":       json.dumps({}),
                    "ts":          date.isoformat(),
                })

        persons.append(person)
        donors.append(donor)

    return persons, donors, profiles, signals


def generate_sql_seeds(
    n_patients: int = 200,
    n_donors:   int = 1000,
    output_dir: Path = Path("data/seed"),
) -> None:
    """Generate seed SQL inserts for demo database."""
    output_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(42)

    print(f"Generating {n_patients} patients and {n_donors} donors...")

    pat_persons, patients, pat_profiles, events = generate_patients(n_patients)
    don_persons, donors, don_profiles, signals  = generate_donors(n_donors)

    all_persons  = pat_persons + don_persons
    all_profiles = pat_profiles + don_profiles

    # Write to JSONL files for bulk insert
    def write_jsonl(records: list, path: Path):
        with open(path, "w") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")
        print(f"  Written: {path} ({len(records)} records)")

    write_jsonl(all_persons,  output_dir / "persons.jsonl")
    write_jsonl(patients,     output_dir / "patients.jsonl")
    write_jsonl(donors,       output_dir / "donors.jsonl")
    write_jsonl(all_profiles, output_dir / "antigen_profiles.jsonl")
    write_jsonl(events,       output_dir / "transfusion_events.jsonl")
    write_jsonl(signals,      output_dir / "donor_signals.jsonl")

    # Summary
    summary = {
        "generated_at": datetime.utcnow().isoformat(),
        "patients":     len(patients),
        "donors":       len(donors),
        "profiles":     len(all_profiles),
        "events":       len(events),
        "signals":      len(signals),
    }
    with open(output_dir / "summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\n✅ Data generation complete:")
    for k, v in summary.items():
        if k != "generated_at":
            print(f"   {k}: {v:,}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RakSetu Synthetic Data Generator")
    parser.add_argument("--patients", type=int, default=200)
    parser.add_argument("--donors",   type=int, default=1000)
    parser.add_argument("--output",   type=str, default="data/seed")
    parser.add_argument("--seed",     type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    generate_sql_seeds(
        n_patients=args.patients,
        n_donors=args.donors,
        output_dir=Path(args.output),
    )
