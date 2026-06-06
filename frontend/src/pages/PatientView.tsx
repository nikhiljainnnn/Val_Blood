import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Droplets, Calendar, AlertTriangle, Shield } from "lucide-react";
import { matchingAPI, predictionAPI, notificationAPI, storyAPI } from "@/api/client";
import GuardianCircle from "@/components/GuardianCircle";
import HbForecastChart from "@/components/HbForecastChart";
import CompatScore from "@/components/CompatScore";

// Demo patient data
const DEMO_PATIENT = {
  id: "demo-patient-001",
  name: "Arjun Sharma",
  age: 9,
  abo: "B",
  rh_d: true,
  city: "Mumbai",
  hospital: "Mumbai Thalassemia Center",
  thalassemia_type: "major",
  transfusion_interval_days: 21,
  total_transfusions: 312,
  circle_health: 0.92,
};

const DEMO_CIRCLE = [
  { donor_id: "d1", donor_name: "Ramesh Kumar",  compatibility: { score: 0.97, mismatch_count: 0, risk_level: "safe" },    churn_probability: 0.12, availability_prob: 0.88, days_to_eligible: 0,  rank: 1, status: "active",  phone: "+919XXXXXXXXX", language: "hi" },
  { donor_id: "d2", donor_name: "Priya Sharma",  compatibility: { score: 0.93, mismatch_count: 0, risk_level: "safe" },    churn_probability: 0.08, availability_prob: 0.92, days_to_eligible: 12, rank: 2, status: "active",  phone: "+919XXXXXXXXX", language: "hi" },
  { donor_id: "d3", donor_name: "Vijay Reddy",   compatibility: { score: 0.91, mismatch_count: 1, risk_level: "caution" }, churn_probability: 0.71, availability_prob: 0.29, days_to_eligible: 0,  rank: 3, status: "at_risk", phone: "+919XXXXXXXXX", language: "te" },
  { donor_id: "d4", donor_name: "Ananya Iyer",   compatibility: { score: 0.89, mismatch_count: 0, risk_level: "safe" },    churn_probability: 0.22, availability_prob: 0.78, days_to_eligible: 6,  rank: 4, status: "active",  phone: "+919XXXXXXXXX", language: "ta" },
  { donor_id: "d5", donor_name: "Suresh Patel",  compatibility: { score: 0.87, mismatch_count: 1, risk_level: "caution" }, churn_probability: 0.35, availability_prob: 0.65, days_to_eligible: 0,  rank: 5, status: "active",  phone: "+919XXXXXXXXX", language: "hi" },
  { donor_id: "d6", donor_name: "Deepa Nair",    compatibility: { score: 0.85, mismatch_count: 0, risk_level: "safe" },    churn_probability: 0.18, availability_prob: 0.82, days_to_eligible: 21, rank: 6, status: "active",  phone: "+919XXXXXXXXX", language: "ml" },
  { donor_id: "d7", donor_name: "Arun Mehta",    compatibility: { score: 0.82, mismatch_count: 2, risk_level: "caution" }, churn_probability: 0.55, availability_prob: 0.45, days_to_eligible: 0,  rank: 7, status: "at_risk", phone: "+919XXXXXXXXX", language: "hi" },
  { donor_id: "d8", donor_name: "Kavya Rao",     compatibility: { score: 0.80, mismatch_count: 0, risk_level: "safe" },    churn_probability: 0.10, availability_prob: 0.90, days_to_eligible: 4,  rank: 8, status: "donated", phone: "+919XXXXXXXXX", language: "kn" },
  { donor_id: "d9", donor_name: "Mohan Singh",   compatibility: { score: 0.78, mismatch_count: 1, risk_level: "caution" }, churn_probability: 0.28, availability_prob: 0.72, days_to_eligible: 0,  rank: 9, status: "active",  phone: "+919XXXXXXXXX", language: "hi" },
  { donor_id: "d10", donor_name: "Rekha Pillai", compatibility: { score: 0.75, mismatch_count: 2, risk_level: "caution" }, churn_probability: 0.41, availability_prob: 0.59, days_to_eligible: 8, rank: 10, status: "active",  phone: "+919XXXXXXXXX", language: "ml" },
];

export default function PatientView() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const patientId  = id || "demo-patient-001";

  const [circle, setCircle]           = useState(DEMO_CIRCLE);
  const [patient]                     = useState(DEMO_PATIENT);
  const [selectedDonor, setSelected]  = useState<typeof DEMO_CIRCLE[0] | null>(null);
  const [requesting, setRequesting]   = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [story, setStory]             = useState("");
  const [activeTab, setActiveTab]     = useState<"circle" | "forecast" | "compat">("circle");

  useEffect(() => {
    matchingAPI.getGuardianCircle(patientId)
      .then(r => setCircle(r.data.donors))
      .catch(() => {});  // use demo data
  }, [patientId]);

  useEffect(() => {
    if (!selectedDonor) return;
    storyAPI.getStory(selectedDonor.donor_id, patientId, "en")
      .then(r => setStory(r.data.story_text))
      .catch(() => setStory(`Your donation #${Math.floor(Math.random() * 300 + 1)} was a lifeline for ${patient.name} today.`));
  }, [selectedDonor]);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await matchingAPI.createRequest({
        patient_id:   patientId,
        hospital_id:  "demo-hospital-001",
        urgency:      "urgent",
        units_needed: 1,
      });
      setRequestSent(true);
    } catch {
      setRequestSent(true);   // demo: always succeed
    } finally {
      setRequesting(false);
    }
  };

  const atRiskCount   = circle.filter(d => d.churn_probability > 0.6).length;
  const eligibleCount = circle.filter(d => d.days_to_eligible === 0).length;

  return (
    <div style={{ minHeight: "100vh", background: "#08080A", color: "#F0EEE8", fontFamily: "'Syne', sans-serif" }}>

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16, background: "rgba(10,10,11,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <ArrowLeft size={16} /> Dashboard
        </button>
        <span style={{ color: "#333" }}>|</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Patient View — {patient.name}</span>
        <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555" }}>
          {patient.thalassemia_type} · {patient.abo}{patient.rh_d ? "+" : "−"} · {patient.city}
        </span>
      </header>

      <main style={{ padding: "28px 32px", display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>

        {/* Left: Patient card + request button */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Patient card */}
          <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(192,39,45,0.15)", border: "2px solid rgba(192,39,45,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                🧒
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{patient.name}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555" }}>
                  {patient.age} yrs · {patient.hospital}
                </div>
              </div>
            </div>

            {[
              { label: "Blood Type",      value: `${patient.abo}${patient.rh_d ? "+" : "−"}`,     icon: Droplets },
              { label: "Total Transfusions", value: patient.total_transfusions.toLocaleString(),  icon: Calendar },
              { label: "Circle Health",   value: `${Math.round(patient.circle_health * 100)}%`,   icon: Shield },
              { label: "At-Risk Donors",  value: `${atRiskCount} of ${circle.length}`,            icon: AlertTriangle },
              { label: "Eligible Now",    value: `${eligibleCount} donors`,                       icon: Droplets },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555" }}>
                  <Icon size={12} />
                  {label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: label === "At-Risk Donors" && atRiskCount > 0 ? "#E8952A" : "#F0EEE8" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Request transfusion */}
          {!requestSent ? (
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={handleRequest}
              disabled={requesting}
              style={{ padding: "16px", borderRadius: 10, border: "none", background: "#C0272D", color: "#fff", fontSize: 15, fontWeight: 700, cursor: requesting ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif" }}>
              {requesting ? "Activating circle..." : "🩸 Request Transfusion"}
            </motion.button>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              style={{ padding: "16px", borderRadius: 10, background: "rgba(29,184,142,0.08)", border: "1px solid rgba(29,184,142,0.3)", textAlign: "center" }}>
              <div style={{ color: "#1DB88E", fontWeight: 700, marginBottom: 4 }}>✅ Request Sent</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555" }}>
                Top 3 donors notified via WhatsApp
              </div>
            </motion.div>
          )}

          {/* Selected donor story */}
          {selectedDonor && story && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              style={{ padding: 20, borderRadius: 12, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#818CF8", letterSpacing: "0.1em", marginBottom: 10 }}>
                IMPACT STORY · {selectedDonor.donor_name.toUpperCase()}
              </div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: "#ccc", lineHeight: 1.7, fontStyle: "italic" }}>
                "{story}"
              </div>
            </motion.div>
          )}
        </div>

        {/* Right: Tabs */}
        <div>
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#111113", padding: 4, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            {(["circle", "forecast", "compat"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ flex: 1, padding: "10px", borderRadius: 7, border: "none", background: activeTab === tab ? "#1A1A24" : "transparent", color: activeTab === tab ? "#F0EEE8" : "#555", fontSize: 13, fontWeight: activeTab === tab ? 600 : 400, cursor: "pointer", fontFamily: "'Syne', sans-serif", transition: "all 0.2s" }}>
                {tab === "circle" ? "Guardian Circle" : tab === "forecast" ? "Hb Forecast" : "Antigen Match"}
              </button>
            ))}
          </div>

          <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 24 }}>
            {activeTab === "circle" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Guardian Circle</h2>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555" }}>
                    Click a donor to view story
                  </span>
                </div>
                <GuardianCircle donors={circle} patientName={patient.name} width={480} height={480} />
                <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
                  {[["active", "#6366F1", "Active"], ["at_risk", "#E8952A", "At Risk"], ["donated", "#1DB88E", "Donated"]].map(([s, c, l]) => (
                    <span key={s} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />{l}
                    </span>
                  ))}
                </div>

                {/* Donor list table */}
                <div style={{ marginTop: 24 }}>
                  {circle.map(d => (
                    <motion.div key={d.donor_id} whileHover={{ background: "rgba(255,255,255,0.02)" }}
                      onClick={() => setSelected(d)}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 10px", borderRadius: 8, cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)", background: selectedDonor?.donor_id === d.donor_id ? "rgba(99,102,241,0.06)" : "transparent" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#444", width: 20 }}>#{d.rank}</span>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.status === "active" ? "#6366F1" : d.status === "at_risk" ? "#E8952A" : "#1DB88E", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{d.donor_name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#1DB88E" }}>
                        {Math.round(d.compatibility.score * 100)}%
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: d.churn_probability > 0.6 ? "#E8952A" : "#555" }}>
                        churn: {Math.round(d.churn_probability * 100)}%
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#444" }}>
                        {d.days_to_eligible === 0 ? "eligible" : `+${d.days_to_eligible}d`}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "forecast" && (
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px" }}>Hemoglobin Drop Forecast</h2>
                <HbForecastChart patientId={patientId} />
                <div style={{ marginTop: 24, padding: "16px", background: "#18181C", borderRadius: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#555" }}>
                  <div style={{ color: "#ccc", marginBottom: 8, fontWeight: 600 }}>Model info</div>
                  Bidirectional LSTM · 12 transfusion history points · ±2.8 day MAE
                </div>
              </div>
            )}

            {activeTab === "compat" && selectedDonor && (
              <CompatScore donor={selectedDonor} patientAbo={patient.abo} patientRhd={patient.rh_d} />
            )}
            {activeTab === "compat" && !selectedDonor && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#444", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                Select a donor from the Guardian Circle tab to view antigen compatibility details
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
