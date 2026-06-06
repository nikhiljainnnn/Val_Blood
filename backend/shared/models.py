"""
SQLAlchemy async ORM models shared across all services.
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, Float, Integer,
    DateTime, ForeignKey, Text, JSON, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def gen_uuid():
    return str(uuid.uuid4())


class Person(Base):
    __tablename__ = "persons"
    id          = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    role        = Column(String(20), nullable=False)   # "patient" | "donor" | "coordinator"
    name        = Column(String(120), nullable=False)
    phone       = Column(String(20), unique=True, nullable=False)
    language    = Column(String(10), default="hi")
    city        = Column(String(60))
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AntigenProfile(Base):
    __tablename__ = "antigen_profiles"
    id          = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    person_id   = Column(UUID(as_uuid=False), ForeignKey("persons.id"), unique=True)
    # ABO + RhD
    abo         = Column(String(3), nullable=False)
    rh_d        = Column(Boolean, nullable=False)
    # Rh system
    rh_c        = Column("rh_c_lower", Boolean)
    rh_C        = Column("rh_C_upper", Boolean)
    rh_e        = Column("rh_e_lower", Boolean)
    rh_E        = Column("rh_E_upper", Boolean)
    # Kell
    kell_k      = Column("kell_k_lower", Boolean)
    kell_K      = Column("kell_K_upper", Boolean)
    # Duffy
    duffy_fya   = Column(Boolean)
    duffy_fyb   = Column(Boolean)
    # Kidd
    kidd_jka    = Column(Boolean)
    kidd_jkb    = Column(Boolean)
    # MNS
    mns_M       = Column("mns_M_upper", Boolean)
    mns_N       = Column("mns_N_upper", Boolean)
    mns_S       = Column("mns_S_upper", Boolean)
    mns_s       = Column("mns_s_lower", Boolean)
    source      = Column(String(30), default="serological")
    genotyped_at = Column(DateTime)
    created_at  = Column(DateTime, default=datetime.utcnow)

    person = relationship("Person", foreign_keys=[person_id])

class Patient(Base):
    __tablename__ = "patients"
    id              = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    person_id       = Column(UUID(as_uuid=False), ForeignKey("persons.id"), unique=True)
    age             = Column(Integer)
    weight_kg       = Column(Float)
    splenomegaly    = Column(Boolean, default=False)
    chelation_dose  = Column(Float, default=0.0)
    hospital_id     = Column(UUID(as_uuid=False), ForeignKey("hospitals.id"))
    thalassemia_type = Column(String(30))       # "major"|"intermedia"
    transfusion_interval_days = Column(Integer, default=21)
    created_at      = Column(DateTime, default=datetime.utcnow)

    person   = relationship("Person", foreign_keys=[person_id])
    hospital = relationship("Hospital")


class Donor(Base):
    __tablename__ = "donors"
    id              = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    person_id       = Column(UUID(as_uuid=False), ForeignKey("persons.id"), unique=True)
    karma_score     = Column(Integer, default=0)
    lifetime_donations = Column(Integer, default=0)
    account_age_days   = Column(Integer, default=0)
    last_donation_at   = Column(DateTime)
    next_eligible_at   = Column(DateTime)
    verified        = Column(Boolean, default=False)
    created_at      = Column(DateTime, default=datetime.utcnow)

    person = relationship("Person", foreign_keys=[person_id])


class Hospital(Base):
    __tablename__ = "hospitals"
    id          = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name        = Column(String(200), nullable=False)
    city        = Column(String(60))
    lat         = Column(Float)
    lng         = Column(Float)
    nabh_accredited = Column(Boolean, default=False)
    fl_node_url = Column(String(200))   # Flower federated node URL
    created_at  = Column(DateTime, default=datetime.utcnow)


class GuardianCircle(Base):
    __tablename__ = "guardian_circles"
    id                  = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    patient_id          = Column(UUID(as_uuid=False), ForeignKey("patients.id"))
    donor_id            = Column(UUID(as_uuid=False), ForeignKey("donors.id"))
    compatibility_score = Column(Float)
    antigen_mismatches  = Column(Integer)
    rank_in_circle      = Column(Integer)
    status              = Column(String(20), default="active")  # active|at_risk|churned|donated
    churn_risk          = Column(Float, default=0.0)
    last_donation_at    = Column(DateTime)
    created_at          = Column(DateTime, default=datetime.utcnow)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient = relationship("Patient")
    donor   = relationship("Donor")

    __table_args__ = (
        Index("ix_gc_patient_rank", "patient_id", "rank_in_circle"),
        Index("ix_gc_patient_status", "patient_id", "status"),
    )


class DonorSignal(Base):
    __tablename__ = "donor_signals"
    id          = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    donor_id    = Column(UUID(as_uuid=False), ForeignKey("donors.id"))
    signal_type = Column(String(40), nullable=False)
    value       = Column(JSON)
    ts          = Column(DateTime, default=datetime.utcnow)

    donor = relationship("Donor")

    __table_args__ = (
        Index("ix_ds_donor_ts", "donor_id", "ts"),
        Index("ix_ds_type_ts", "signal_type", "ts"),
    )


class TransfusionEvent(Base):
    __tablename__ = "transfusion_events"
    id              = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    patient_id      = Column(UUID(as_uuid=False), ForeignKey("patients.id"))
    donor_id        = Column(UUID(as_uuid=False), ForeignKey("donors.id"), nullable=True)
    units           = Column(Integer, default=1)
    hb_pre          = Column(Float)
    hb_post         = Column(Float)
    days_since_last = Column(Integer)
    hospital_id     = Column(UUID(as_uuid=False), ForeignKey("hospitals.id"))
    outcome         = Column(String(20), default="success")
    transfused_at   = Column(DateTime, default=datetime.utcnow)

    patient  = relationship("Patient")
    donor    = relationship("Donor")
    hospital = relationship("Hospital")

    __table_args__ = (
        Index("ix_te_patient_ts", "patient_id", "transfused_at"),
    )


class TransfusionRequest(Base):
    __tablename__ = "transfusion_requests"
    id              = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    patient_id      = Column(UUID(as_uuid=False), ForeignKey("patients.id"))
    hospital_id     = Column(UUID(as_uuid=False), ForeignKey("hospitals.id"))
    urgency         = Column(String(20), default="normal")  # normal|urgent|critical
    units_needed    = Column(Integer, default=1)
    status          = Column(String(20), default="open")    # open|matched|confirmed|completed|failed
    matched_donor_id = Column(UUID(as_uuid=False), ForeignKey("donors.id"), nullable=True)
    hb_at_request   = Column(Float)
    notes           = Column(Text)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient  = relationship("Patient")
    hospital = relationship("Hospital")

    __table_args__ = (
        Index("ix_tr_patient_status", "patient_id", "status"),
        Index("ix_tr_status_urgency", "status", "urgency"),
    )


class PatientMilestone(Base):
    __tablename__ = "patient_milestones"
    id           = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    patient_id   = Column(UUID(as_uuid=False), ForeignKey("patients.id"))
    milestone_type = Column(String(40))  # birthday|school_grade|walk_milestone|transfusion_count
    description  = Column(Text)          # anonymized text
    share_consent = Column(Boolean, default=False)
    recorded_at  = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient")


class BloodInventory(Base):
    __tablename__ = "blood_inventory"
    id           = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    hospital_id  = Column(UUID(as_uuid=False), ForeignKey("hospitals.id"))
    abo          = Column(String(3), nullable=False)
    rh_d         = Column(Boolean, nullable=False)
    units        = Column(Integer, default=0)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    hospital = relationship("Hospital")

    __table_args__ = (
        Index("ix_bi_hospital_abo", "hospital_id", "abo", "rh_d"),
    )
