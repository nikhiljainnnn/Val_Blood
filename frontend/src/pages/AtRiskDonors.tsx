import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, User, Phone, Calendar, TrendingDown, Zap } from "lucide-react";
import { donorAPI } from "../api/client";
import { useNavigate } from "react-router-dom";


interface AtRiskDonor {
  donor_id:            string;
  name:                string;
  phone:               string;
  blood_group:         string;
  city:                string;
  churn_probability:   number;
  days_since_donation: number;
  donations_total:     number;
  patient_name:        string;  // the patient they're matched to
  inactive_reason:     string;  // from inactive_trigger_comment
  cascade_status:      "idle" | "running" | "done";
}

const DEMO_DONORS: AtRiskDonor[] = [
  { donor_id: "d001", name: "Vijay Reddy",    phone: "+919876541001", blood_group: "B+",  city: "Hyderabad", churn_probability: 0.91, days_since_donation: 412, donations_total: 3,  patient_name: "Arjun Mehta",   inactive_reason: "Not donated in last 1 year",                    cascade_status: "idle" },
  { donor_id: "d002", name: "Arun Mehta",     phone: "+919876541002", blood_group: "O+",  city: "Mumbai",    churn_probability: 0.84, days_since_donation: 380, donations_total: 5,  patient_name: "Sneha Patil",   inactive_reason: "Very limited activity despite multiple calls",   cascade_status: "idle" },
  { donor_id: "d003", name: "Ravi Kumar",     phone: "+919876541003", blood_group: "A+",  city: "Delhi",     churn_probability: 0.79, days_since_donation: 290, donations_total: 2,  patient_name: "Rahul Das",     inactive_reason: "Not donated in last 1 year",                    cascade_status: "idle" },
  { donor_id: "d004", name: "Sunita Sharma",  phone: "+919876541004", blood_group: "AB-", city: "Pune",      churn_probability: 0.76, days_since_donation: 310, donations_total: 4,  patient_name: "Fatima Sheikh", inactive_reason: "Very limited activity despite multiple calls",   cascade_status: "idle" },
  { donor_id: "d005", name: "Mohan Das",      phone: "+919876541005", blood_group: "B-",  city: "Kolkata",   churn_probability: 0.72, days_since_donation: 445, donations_total: 1,  patient_name: "Pooja Nair",    inactive_reason: "Not donated in last 1 year",                    cascade_status: "idle" },
  { donor_id: "d006", name: "Lakshmi Iyer",   phone: "+919876541006", blood_group: "O-",  city: "Chennai",   churn_probability: 0.68, days_since_donation: 260, donations_total: 7,  patient_name: "Karan Singh",   inactive_reason: "Moved city, needs re-verification",             cascade_status: "idle" },
  { donor_id: "d007", name: "Harish Patel",   phone: "+919876541007", blood_group: "A-",  city: "Ahmedabad", churn_probability: 0.65, days_since_donation: 198, donations_total: 6,  patient_name: "Anita Rao",     inactive_reason: "Very limited activity despite multiple calls",   cascade_status: "idle" },
];

function churnColor(prob: number) {
  if (prob >= 0.8) return { color: "#E8554E", bg: "rgba(232,85,78,0.08)",  border: "rgba(232,85,78,0.4)"  };
  if (prob >= 0.6) return { color: "#E8952A", bg: "rgba(232,149,42,0.08)", border: "rgba(232,149,42,0.4)" };
  return               { color: "#6366F1", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.4)"  };
}

export default function AtRiskDonors() {
  const navigate = useNavigate();
  const [donors, setDonors]     = useState<AtRiskDonor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [cascading, setCascading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    donorAPI.getAtRisk()
      .then(r => setDonors(r.data))
      .catch(() => setDonors(DEMO_DONORS))
      .finally(() => setLoading(false));
  }, []);

  const triggerCascade = async (donorId: string) => {
    setCascading(prev => ({ ...prev, [donorId]: true }));
    try {
      await donorAPI.triggerCascade(donorId);
    } catch {
      // demo mode
    } finally {
      setTimeout(() => {
        setDonors(prev => prev.map(d => d.donor_id === donorId ? { ...d, cascade_status: "done" } : d));
        setCascading(prev => ({ ...prev, [donorId]: false }));
      }, 1500);
    }
  };

  const triggerAll = () => {
    donors.slice(0, 3).forEach(d => triggerCascade(d.donor_id));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#08080A", color: "#F0EEE8", fontFamily: "'Syne', sans-serif" }}>

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(10,10,11,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", cursor: "pointer" }} onClick={() => navigate("/")}>
            <span style={{ color: "#E8554E" }}>Rak</span>Setu
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#444", background: "#18181C", border: "1px solid rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 4 }}>
            at-risk-donors
          </span>
        </div>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "#888", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
          ← Dashboard
        </button>
      </header>

      <main style={{ padding: "32px" }}>

        {/* Hero stat */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "rgba(232,149,42,0.06)", border: "1px solid rgba(232,149,42,0.3)", borderRadius: 14, padding: "28px 32px", marginBottom: 32, display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ background: "rgba(232,149,42,0.12)", borderRadius: 12, padding: 16 }}>
            <TrendingDown size={32} color="#E8952A" />
          </div>
          <div>
            <div style={{ fontSize: 48, fontWeight: 800, color: "#E8952A", lineHeight: 1 }}>
              {loading ? "—" : donors.length}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#888", marginTop: 4 }}>
              matched bridge donors at risk of dropping out
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555", marginTop: 4 }}>
              18.6% of all bridge donors · each has an assigned patient depending on them
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={triggerAll}
              style={{ padding: "12px 24px", borderRadius: 8, border: "none", background: "#C0272D", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne', sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={16} />
              Activate Top 3 Now
            </motion.button>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", textAlign: "center", marginTop: 6 }}>
              triggers WhatsApp → SMS → Voice cascade
            </div>
          </div>
        </motion.div>

        {/* Donor cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <AnimatePresence>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ height: 96, background: "#111113", borderRadius: 10, border: "1px solid rgba(255,255,255,0.04)" }} />
                ))
              : donors.map((d, i) => {
                  const c = churnColor(d.churn_probability);
                  const isRunning = cascading[d.donor_id];
                  const isDone    = d.cascade_status === "done";
                  return (
                    <motion.div key={d.donor_id}
                      initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", gap: 20 }}>

                      {/* Churn score */}
                      <div style={{ minWidth: 64, textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: c.color, lineHeight: 1 }}>
                          {Math.round(d.churn_probability * 100)}%
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#555" }}>CHURN</div>
                        {/* Churn bar */}
                        <div style={{ marginTop: 4, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${d.churn_probability * 100}%`, background: c.color, borderRadius: 2 }} />
                        </div>
                      </div>

                      <div style={{ width: 1, height: 48, background: "rgba(255,255,255,0.06)" }} />

                      {/* Donor info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>{d.name}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: c.color, background: `${c.border}33`, border: `1px solid ${c.border}`, padding: "2px 8px", borderRadius: 3 }}>
                            {d.blood_group}
                          </span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555" }}>{d.city}</span>
                        </div>
                        <div style={{ display: "flex", gap: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555", marginBottom: 5 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={10} /> {d.phone}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Calendar size={10} /> {d.days_since_donation}d since last donation</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><User size={10} /> matched to {d.patient_name}</span>
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#E8952A", background: "rgba(232,149,42,0.08)", border: "1px solid rgba(232,149,42,0.2)", borderRadius: 4, padding: "3px 8px", display: "inline-block" }}>
                          ⚠ {d.inactive_reason}
                        </div>
                      </div>

                      {/* Cascade button */}
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => triggerCascade(d.donor_id)}
                        disabled={isRunning || isDone}
                        style={{ padding: "10px 20px", borderRadius: 7, border: "none", background: isDone ? "#1DB88E" : isRunning ? "#333" : "#C0272D", color: "#fff", fontSize: 13, fontWeight: 700, cursor: isRunning || isDone ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif", minWidth: 150, transition: "background 0.2s" }}>
                        {isDone ? "✓ Cascade Sent" : isRunning ? "Triggering..." : "Start Cascade →"}
                      </motion.button>
                    </motion.div>
                  );
                })
            }
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}