import os
import csv
import asyncio
import uuid
from datetime import datetime, timedelta
import random

# Force database URL for seed script if running locally vs in docker
os.environ["DATABASE_URL"] = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/raksetu")

from shared.db import init_db, db_session
from shared.models import (
    Person, Donor, Patient, AntigenProfile, GuardianCircle, TransfusionRequest
)

def parse_date(date_str):
    if not date_str or date_str.strip() == "":
        return None
    try:
        return datetime.strptime(date_str.split(".")[0], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            return None

def parse_int(val, default=0):
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default

def parse_float(val, default=0.0):
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

async def main():
    print("Initializing database tables...")
    await init_db()

    print("Reading Dataset.csv...")
    dataset_path = "Dataset.csv"
    if not os.path.exists(dataset_path):
        print(f"Error: {dataset_path} not found.")
        return

    bridge_patients = {}  # bridge_id -> Patient model
    user_donors = {}      # user_id -> Donor model

    test_phone = "+918000709660"
    dummy_phone_base = 9000000000
    test_donors_assigned = 0

    async with db_session() as session:
        # Clear existing data
        print("Clearing existing data...")
        await session.execute(GuardianCircle.__table__.delete())
        await session.execute(TransfusionRequest.__table__.delete())
        await session.execute(AntigenProfile.__table__.delete())
        await session.execute(Donor.__table__.delete())
        await session.execute(Patient.__table__.delete())
        await session.execute(Person.__table__.delete())
        await session.commit()

        print("Populating data...")
        with open(dataset_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            count = 0
            
            for row in reader:
                count += 1
                user_id = row.get("user_id", "")
                bridge_id = row.get("bridge_id", "")
                role = row.get("role", "")
                blood_group = row.get("blood_group", "O Positive")
                
                if not user_id:
                    continue

                # 1. Create Patient if this row is a bridge and patient doesn't exist
                patient = None
                if bridge_id and bridge_id not in bridge_patients:
                    p_person = Person(
                        id=str(uuid.uuid4()),
                        role="patient",
                        name=f"Patient {bridge_id[-6:]}",
                        phone=f"+91888{random.randint(1000000, 9999999)}",
                        language="hi"
                    )
                    session.add(p_person)
                    
                    patient = Patient(
                        id=str(uuid.uuid4()),
                        person_id=p_person.id,
                        age=random.randint(5, 15),
                        thalassemia_type="major",
                        transfusion_interval_days=parse_int(row.get("frequency_in_days"), 21)
                    )
                    session.add(patient)
                    bridge_patients[bridge_id] = patient

                    # If urgent
                    expected_next = parse_date(row.get("expected_next_transfusion_date"))
                    if expected_next:
                        days_until = (expected_next - datetime.utcnow()).days
                        urgency = "normal"
                        if days_until < 0:
                            urgency = "critical"
                        elif days_until <= 7:
                            urgency = "urgent"
                            
                        if urgency in ["critical", "urgent"]:
                            req = TransfusionRequest(
                                id=str(uuid.uuid4()),
                                patient_id=patient.id,
                                urgency=urgency,
                                units_needed=parse_int(row.get("quantity_required"), 1),
                                status="open",
                                created_at=expected_next - timedelta(days=21)
                            )
                            session.add(req)
                
                patient = bridge_patients.get(bridge_id)

                # 2. Assign Phone Number (Give User's number to at-risk bridge donors)
                inactive_trigger = row.get("inactive_trigger_comment", "")
                if bridge_id and inactive_trigger and test_donors_assigned < 1:
                    phone = test_phone
                    test_donors_assigned += 1
                else:
                    phone = f"+91{dummy_phone_base + count}"

                # 3. Create Donor
                d_person = Person(
                    id=str(uuid.uuid4()),
                    role="donor",
                    name=f"Donor {user_id[-6:]}",
                    phone=phone,
                    language="hi"
                )
                session.add(d_person)

                last_donation = parse_date(row.get("last_donation_date"))
                donor = Donor(
                    id=str(uuid.uuid4()),
                    person_id=d_person.id,
                    lifetime_donations=parse_int(row.get("donations_till_date"), 0),
                    last_donation_at=last_donation,
                    verified=True
                )
                session.add(donor)
                user_donors[user_id] = donor

                # 4. Create Antigen Profile (Simplified mapping)
                abo_raw = blood_group.split(" ")[0] if " " in blood_group else "O"
                if not abo_raw:
                    abo_raw = "O"
                elif abo_raw == "Bombay":
                    abo_raw = "Oh"
                elif abo_raw == "Do":
                    abo_raw = "UNK"
                abo = abo_raw[:3]
                
                rh_d = "Positive" in blood_group
                
                ap = AntigenProfile(
                    person_id=d_person.id,
                    abo=abo,
                    rh_d=rh_d,
                    rh_c=True, rh_C=False, rh_e=True, rh_E=False,
                    kell_k=True, kell_K=False,
                    duffy_fya=True, duffy_fyb=False,
                    kidd_jka=True, kidd_jkb=True,
                    mns_M=True, mns_N=False, mns_S=False, mns_s=True
                )
                session.add(ap)

                # 5. Create Guardian Circle if Bridge Donor
                if patient and role == "Bridge Donor":
                    churn_risk = 0.1
                    status = "active"
                    if inactive_trigger:
                        churn_risk = 0.85
                        status = "at_risk"

                    gc = GuardianCircle(
                        patient_id=patient.id,
                        donor_id=donor.id,
                        compatibility_score=0.95 + random.uniform(-0.05, 0.05),
                        antigen_mismatches=0,
                        rank_in_circle=random.randint(1, 5),
                        status=status,
                        churn_risk=churn_risk,
                        last_donation_at=last_donation
                    )
                    session.add(gc)

                if count % 1000 == 0:
                    print(f"Processed {count} rows...")
                    await session.commit()
            
            await session.commit()
            print(f"Successfully seeded {count} rows! Test donors assigned: {test_donors_assigned}")

if __name__ == "__main__":
    asyncio.run(main())
