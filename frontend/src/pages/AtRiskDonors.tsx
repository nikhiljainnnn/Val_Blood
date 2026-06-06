import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, User, Phone, Calendar, TrendingDown, Zap, ArrowLeft } from "lucide-react";
import { demoAPI, donorAPI } from "../api/client";
import { useNavigate } from "react-router-dom";
import ParticleBackground from "../components/ParticleBackground";
import "../index.css";

interface AtRiskDonor {
  donor_id:            string;
  name:                string;
  phone:               string;
  blood_group:         string;
  city:                string;
  churn_probability:   number;
  days_since_donation: number;
  donations_total:     number;
  patient_name:        string;
  inactive_reason:     string;
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
  if (prob >= 0.8) return { color: "#E8554E", bg: "rgba(232,85,78,0.08)",  border: "rgba(232,85,78,0.4)",  glow: "rgba(232,85,78,0.2)" };
  if (prob >= 0.6) return { color: "#E8952A", bg: "rgba(232,149,42,0.08)", border: "rgba(232,149,42,0.4)", glow: "rgba(232,149,42,0.2)" };
  return               { color: "#6366F1", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.4)", glow: "rgba(99,102,241,0.15)" };
}

export default function AtRiskDonors() {
  const navigate = useNavigate();
  const [donors, setDonors]     = useState<AtRiskDonor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [cascading, setCascading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    demoAPI.getAtRiskBridge()
      .then(r => setDonors(r.data.donors || r.data))
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
    <div style={{ minHeight: "100vh", background: "#08080A", color: "#F0EEE8", fontFamily: "'DM Sans', sans-serif" }}>
      <ParticleBackground />

      {/* Header */}
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <motion.button whileHover={{ x: -2 }} whileTap={{ scale: 0.95 }} onClick={() => navigate("/")}
            style={{ background: "none", border: "none", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <ArrowLeft size={16} /> Dashboard
          </motion.button>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700 }}>
            At-Risk Donors
          </span>
        </div>
      </header>

      <main style={{ padding: "32px", maxWidth: 1000, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Hero stat */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{
            background: "linear-gradient(135deg, rgba(232,149,42,0.1) 0%, rgba(14,14,20,0.8) 100%)",
            border: "1px solid rgba(232,149,42,0.3)", borderRadius: 20, padding: "36px 40px",
            marginBottom: 32, display: "flex", alignItems: "center", gap: 32,
            backdropFilter: "blur(16px)", boxShadow: "0 16px 48px rgba(232,149,42,0.1)"
          }}>
          <div style={{ background: "rgba(232,149,42,0.15)", borderRadius: 16, padding: 20, border: "1px solid rgba(232,149,42,0.3)", boxShadow: "0 0 24px rgba(232,149,42,0.2)" }}>
            <TrendingDown size={40} color="#E8952A" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 56, fontWeight: 800, color: "#E8952A", lineHeight: 1, letterSpacing: "-0.02em" }}>
              {loading ? "—" : donors.length}
            </div>
            <div style={{ fontSize: 15, color: "#F0EEE8", marginTop: 8, fontWeight: 500 }}>
              matched bridge donors at risk of dropping out
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#888", marginTop: 6 }}>
              18.6% of all bridge donors · each has an assigned patient depending on them
            </div>
          </div>
          <div>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={triggerAll}
              className="btn-crimson"
              style={{ padding: "14px 28px", fontSize: 15 }}>
              <Zap size={16} />
              Activate Top 3 Now
            </motion.button>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#888", textAlign: "center", marginTop: 10, letterSpacing: "0.05em" }}>
              triggers WhatsApp → SMS → Voice
            </div>
          </div>
        </motion.div>

        <div className="section-label">RISK POOL</div>

        {/* Donor cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <AnimatePresence>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 110, border: "1px solid rgba(255,255,255,0.04)" }} />
                ))
              : donors.map((d, i) => {
                  const c = churnColor(d.churn_probability);
                  const isRunning = cascading[d.donor_id];
                  const isDone    = d.cascade_status === "done";
                  return (
                    <motion.div key={d.donor_id}
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      whileHover={{ y: -2, boxShadow: `0 8px 32px ${c.glow}` }}
                      style={{
                        background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: "20px 24px",
                        display: "flex", alignItems: "center", gap: 24, backdropFilter: "blur(12px)",
                        transition: "all 0.3s ease",
                      }}>

                      {/* Churn score */}
                      <div style={{ minWidth: 72, textAlign: "center" }}>
                        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 800, color: c.color, lineHeight: 1 }}>
                          {Math.round(d.churn_probability * 100)}%
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#888", marginTop: 4, letterSpacing: "0.1em" }}>CHURN</div>
                        {/* Churn bar */}
                        <div className="progress-track" style={{ marginTop: 8, height: 4 }}>
                          <div style={{ height: "100%", width: `${d.churn_probability * 100}%`, background: c.color, borderRadius: 2, boxShadow: `0 0 8px ${c.color}` }} />
                        </div>
                      </div>

                      <div style={{ width: 1, height: 56, background: "rgba(255,255,255,0.08)" }} />

                      {/* Donor info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: "#F0EEE8" }}>{d.name}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: c.color, background: `${c.border}33`, border: `1px solid ${c.border}`, padding: "2px 10px", borderRadius: 4, fontWeight: 600 }}>
                            {d.blood_group}
                          </span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#888" }}>{d.city}</span>
                        </div>
                        <div style={{ display: "flex", gap: 20, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#888", marginBottom: 10 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Phone size={12} color={c.color} /> {d.phone}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Calendar size={12} color={c.color} /> {d.days_since_donation}d since last donation</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><User size={12} color={c.color} /> matched to {d.patient_name}</span>
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#E8952A", background: "rgba(232,149,42,0.12)", border: "1px solid rgba(232,149,42,0.3)", borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
                          ⚠ {d.inactive_reason}
                        </div>
                      </div>

                      {/* Cascade button */}
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => triggerCascade(d.donor_id)}
                        disabled={isRunning || isDone}
                        className={isDone || isRunning ? "" : "btn-crimson"}
                        style={{
                          padding: "12px 24px", borderRadius: 10, fontSize: 14, minWidth: 170,
                          background: isDone ? "#1DB88E" : isRunning ? "#333" : undefined,
                          border: isDone || isRunning ? "none" : undefined, color: "#fff",
                          cursor: isRunning || isDone ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif", fontWeight: 700
                        }}>
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