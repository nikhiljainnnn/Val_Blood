-- RakSetu Database Schema
-- Run automatically on first postgres container start

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Persons ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS persons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role        VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'donor', 'coordinator', 'admin')),
    name        VARCHAR(120) NOT NULL,
    phone       VARCHAR(20) UNIQUE NOT NULL,
    language    VARCHAR(10) DEFAULT 'hi',
    city        VARCHAR(60),
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_persons_role ON persons(role);
CREATE INDEX IF NOT EXISTS ix_persons_city ON persons(city);

-- ─── Hospitals ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hospitals (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(200) NOT NULL,
    city             VARCHAR(60),
    lat              FLOAT,
    lng              FLOAT,
    nabh_accredited  BOOLEAN DEFAULT FALSE,
    fl_node_url      VARCHAR(200),
    created_at       TIMESTAMP DEFAULT NOW()
);

-- ─── Antigen profiles ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS antigen_profiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id   UUID UNIQUE REFERENCES persons(id) ON DELETE CASCADE,
    -- ABO + RhD
    abo         VARCHAR(3) NOT NULL CHECK (abo IN ('A','B','AB','O')),
    rh_d        BOOLEAN NOT NULL,
    -- Rh system
    rh_c        BOOLEAN DEFAULT FALSE,
    "rh_C"      BOOLEAN DEFAULT FALSE,
    rh_e        BOOLEAN DEFAULT TRUE,
    "rh_E"      BOOLEAN DEFAULT FALSE,
    -- Kell system
    kell_k      BOOLEAN DEFAULT TRUE,
    "kell_K"    BOOLEAN DEFAULT FALSE,
    -- Duffy system
    duffy_fya   BOOLEAN DEFAULT FALSE,
    duffy_fyb   BOOLEAN DEFAULT FALSE,
    -- Kidd system
    kidd_jka    BOOLEAN DEFAULT FALSE,
    kidd_jkb    BOOLEAN DEFAULT FALSE,
    -- MNS system
    "mns_M"     BOOLEAN DEFAULT FALSE,
    "mns_N"     BOOLEAN DEFAULT FALSE,
    "mns_S"     BOOLEAN DEFAULT FALSE,
    mns_s       BOOLEAN DEFAULT TRUE,
    source      VARCHAR(30) DEFAULT 'serological',
    genotyped_at TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_ap_abo_rhd ON antigen_profiles(abo, rh_d);

-- ─── Patients ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id                 UUID UNIQUE REFERENCES persons(id) ON DELETE CASCADE,
    age                       INTEGER,
    weight_kg                 FLOAT,
    splenomegaly              BOOLEAN DEFAULT FALSE,
    chelation_dose            FLOAT DEFAULT 0.0,
    hospital_id               UUID REFERENCES hospitals(id),
    thalassemia_type          VARCHAR(30) DEFAULT 'major',
    transfusion_interval_days INTEGER DEFAULT 21,
    created_at                TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_patients_hospital ON patients(hospital_id);

-- ─── Donors ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS donors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id           UUID UNIQUE REFERENCES persons(id) ON DELETE CASCADE,
    karma_score         INTEGER DEFAULT 0,
    lifetime_donations  INTEGER DEFAULT 0,
    account_age_days    INTEGER DEFAULT 0,
    last_donation_at    TIMESTAMP,
    next_eligible_at    TIMESTAMP,
    verified            BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_donors_verified ON donors(verified);
CREATE INDEX IF NOT EXISTS ix_donors_karma ON donors(karma_score DESC);

-- ─── Guardian circles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guardian_circles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID REFERENCES patients(id) ON DELETE CASCADE,
    donor_id            UUID REFERENCES donors(id) ON DELETE CASCADE,
    compatibility_score FLOAT,
    antigen_mismatches  INTEGER DEFAULT 0,
    rank_in_circle      INTEGER,
    status              VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active','at_risk','churned','donated')),
    churn_risk          FLOAT DEFAULT 0.0,
    last_donation_at    TIMESTAMP,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    UNIQUE (patient_id, donor_id)
);
CREATE INDEX IF NOT EXISTS ix_gc_patient_rank   ON guardian_circles(patient_id, rank_in_circle);
CREATE INDEX IF NOT EXISTS ix_gc_patient_status ON guardian_circles(patient_id, status);
CREATE INDEX IF NOT EXISTS ix_gc_churn_risk     ON guardian_circles(churn_risk DESC);

-- ─── Donor signals ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS donor_signals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id    UUID REFERENCES donors(id) ON DELETE CASCADE,
    signal_type VARCHAR(40) NOT NULL,
    value       JSONB DEFAULT '{}',
    ts          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_ds_donor_ts ON donor_signals(donor_id, ts DESC);
CREATE INDEX IF NOT EXISTS ix_ds_type_ts  ON donor_signals(signal_type, ts DESC);

-- ─── Transfusion events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfusion_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID REFERENCES patients(id) ON DELETE CASCADE,
    donor_id        UUID REFERENCES donors(id) ON DELETE SET NULL,
    units           INTEGER DEFAULT 1,
    hb_pre          FLOAT,
    hb_post         FLOAT,
    days_since_last INTEGER,
    hospital_id     UUID REFERENCES hospitals(id),
    outcome         VARCHAR(20) DEFAULT 'success'
                    CHECK (outcome IN ('success','delayed','reaction','failed')),
    transfused_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_te_patient_ts ON transfusion_events(patient_id, transfused_at DESC);
CREATE INDEX IF NOT EXISTS ix_te_hospital   ON transfusion_events(hospital_id);

-- ─── Transfusion requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfusion_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id       UUID REFERENCES patients(id) ON DELETE CASCADE,
    hospital_id      UUID REFERENCES hospitals(id),
    urgency          VARCHAR(20) DEFAULT 'normal'
                     CHECK (urgency IN ('normal','urgent','critical')),
    units_needed     INTEGER DEFAULT 1,
    status           VARCHAR(20) DEFAULT 'open'
                     CHECK (status IN ('open','matched','confirmed','completed','failed')),
    matched_donor_id UUID REFERENCES donors(id) ON DELETE SET NULL,
    hb_at_request    FLOAT,
    notes            TEXT,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_patient_status ON transfusion_requests(patient_id, status);
CREATE INDEX IF NOT EXISTS ix_tr_status_urgency ON transfusion_requests(status, urgency);

-- ─── Patient milestones ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_milestones (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id     UUID REFERENCES patients(id) ON DELETE CASCADE,
    milestone_type VARCHAR(40),
    description    TEXT,
    share_consent  BOOLEAN DEFAULT FALSE,
    recorded_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_pm_patient ON patient_milestones(patient_id, share_consent);

-- ─── Blood inventory ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blood_inventory (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE,
    abo         VARCHAR(3) NOT NULL,
    rh_d        BOOLEAN NOT NULL,
    units       INTEGER DEFAULT 0,
    updated_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE (hospital_id, abo, rh_d)
);

-- ─── Seed demo coordinator account ───────────────────────────────────────────
INSERT INTO persons (id, role, name, phone, language, city)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'coordinator',
    'Demo Coordinator',
    '+919876543210',
    'en',
    'mumbai'
) ON CONFLICT (phone) DO NOTHING;

-- ─── Seed demo hospitals ──────────────────────────────────────────────────────
INSERT INTO hospitals (id, name, city, lat, lng, nabh_accredited) VALUES
    ('10000000-0000-0000-0000-000000000001', 'Mumbai Thalassemia Foundation', 'mumbai',    19.0760,  72.8777, TRUE),
    ('10000000-0000-0000-0000-000000000002', 'Delhi Blood Bank Center',       'delhi',     28.6139,  77.2090, TRUE),
    ('10000000-0000-0000-0000-000000000003', 'Bengaluru Thal Care',           'bengaluru', 12.9716,  77.5946, TRUE),
    ('10000000-0000-0000-0000-000000000004', 'Chennai Blood Warriors Hub',    'chennai',   13.0827,  80.2707, TRUE),
    ('10000000-0000-0000-0000-000000000005', 'Hyderabad Thal Center',         'hyderabad', 17.3850,  78.4867, FALSE),
    ('10000000-0000-0000-0000-000000000006', 'Pune Blood Bridge',             'pune',      18.5204,  73.8567, TRUE),
    ('10000000-0000-0000-0000-000000000007', 'Ahmedabad Thal Foundation',     'ahmedabad', 23.0225,  72.5714, FALSE),
    ('10000000-0000-0000-0000-000000000008', 'Kolkata Blood Warriors',        'kolkata',   22.5726,  88.3639, TRUE)
ON CONFLICT DO NOTHING;

-- ─── Trigger: update updated_at on guardian_circles ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trg_gc_updated_at
    BEFORE UPDATE ON guardian_circles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_tr_updated_at
    BEFORE UPDATE ON transfusion_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
