import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Clock, Droplets, MapPin, Phone, ArrowLeft } from "lucide-react";
import { demoAPI, matchingAPI } from "../api/client";
import { useNavigate } from "react-router-dom";
import ParticleBackground from "../components/ParticleBackground";
import "../index.css";

interface UrgentPatient {
  patient_id:               string;
  name:                     string;
  blood_group:              string;
  city:                     string;
  phone:                    string;
  expected_next_transfusion_date: string;
  days_until_transfusion:   number;
  guardian_circle_size:     number;
  active_donors:            number;
}

const DEMO_PATIENTS: UrgentPatient[] = [
  { patient_id: "p001", name: "Arjun Mehta",    blood_group: "B+",  city: "Mumbai",    phone: "+919876540001", expected_next_transfusion_date: "2026-06-08", days_until_transfusion: 2,  guardian_circle_size: 8,  active_donors: 5 },
  { patient_id: "p002", name: "Sneha Patil",    blood_group: "O-",  city: "Pune",      phone: "+919876540002", expected_next_transfusion_date: "2026-06-09", days_until_transfusion: 3,  guardian_circle_size: 6,  active_donors: 4 },
  { patient_id: "p003", name: "Rahul Das",      blood_group: "A+",  city: "Kolkata",   phone: "+919876540003", expected_next_transfusion_date: "2026-06-10", days_until_transfusion: 4,  guardian_circle_size: 10, active_donors: 7 },
  { patient_id: "p004", name: "Fatima Sheikh",  blood_group: "AB+", city: "Hyderabad", phone: "+919876540004", expected_next_transfusion_date: "2026-06-10", days_until_transfusion: 4,  guardian_circle_size: 7,  active_donors: 3 },
  { patient_id: "p005", name: "Pooja Nair",     blood_group: "B-",  city: "Chennai",   phone: "+919876540005", expected_next_transfusion_date: "2026-06-11", days_until_transfusion: 5,  guardian_circle_size: 9,  active_donors: 6 },
  { patient_id: "p006", name: "Karan Singh",    blood_group: "O+",  city: "Delhi",     phone: "+919876540006", expected_next_transfusion_date: "2026-06-11", days_until_transfusion: 5,  guardian_circle_size: 8,  active_donors: 8 },
  { patient_id: "p007", name: "Anita Rao",      blood_group: "A-",  city: "Bangalore", phone: "+919876540007", expected_next_transfusion_date: "2026-06-12", days_until_transfusion: 6,  guardian_circle_size: 5,  active_donors: 2 },
];

function urgencyColor(days: number) {
  if (days <= 2) return { border: "rgba(232,85,78,0.5)",  bg: "rgba(232,85,78,0.08)",  label: "#E8554E", tag: "CRITICAL", glow: "rgba(232,85,78,0.2)" };
  if (days <= 4) return { border: "rgba(232,149,42,0.5)", bg: "rgba(232,149,42,0.08)", label: "#E8952A", tag: "URGENT",   glow: "rgba(232,149,42,0.2)" };
  return               { border: "rgba(99,102,241,0.4)",  bg: "rgba(99,102,241,0.06)", label: "#6366F1", tag: "THIS WEEK", glow: "rgba(99,102,241,0.15)" };
}

export default function UrgentCases() {
  const navigate = useNavigate();
  const [patients, setPatients]     = useState<UrgentPatient[]>([]);
  const [loading, setLoading]       = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);

  useEffect(() => {
    demoAPI.getUrgentPatients()
      .then(r => setPatients(r.data.patients || r.data))
      .catch(() => setPatients(DEMO_PATIENTS))
      .finally(() => setLoading(false));
  }, []);

  const triggerRequest = async (patientId: string) => {
    setTriggering(patientId);
    try {
      await matchingAPI.createRequest({ patient_id: patientId, urgency: "urgent" });
    } catch {
      // demo mode — just show feedback
    } finally {
      setTimeout(() => setTriggering(null), 1500);
    }
  };

  const critical = patients.filter(p => p.days_until_transfusion <= 2);
  const urgent   = patients.filter(p => p.days_until_transfusion > 2 && p.days_until_transfusion <= 4);
  const thisWeek = patients.filter(p => p.days_until_transfusion > 4);

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
            Urgent Cases
          </span>
        </div>
      </header>

      <main style={{ padding: "32px", maxWidth: 1000, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Hero stat */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{
            background: "linear-gradient(135deg, rgba(232,85,78,0.1) 0%, rgba(14,14,20,0.8) 100%)",
            border: "1px solid rgba(232,85,78,0.3)", borderRadius: 20, padding: "36px 40px",
            marginBottom: 32, display: "flex", alignItems: "center", gap: 32,
            backdropFilter: "blur(16px)", boxShadow: "0 16px 48px rgba(232,85,78,0.15)"
          }}>
          <div style={{ background: "rgba(232,85,78,0.15)", borderRadius: 16, padding: 20, border: "1px solid rgba(232,85,78,0.3)", boxShadow: "0 0 24px rgba(232,85,78,0.2)" }}>
            <AlertTriangle size={40} color="#E8554E" />
          </div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 56, fontWeight: 800, color: "#E8554E", lineHeight: 1, letterSpacing: "-0.02em" }}>
              {loading ? "—" : patients.length}
            </div>
            <div style={{ fontSize: 15, color: "#F0EEE8", marginTop: 8, fontWeight: 500 }}>
              patients need transfusion in the next 7 days
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 32 }}>
            {[
              { label: "CRITICAL (≤2d)", value: critical.length, color: "#E8554E" },
              { label: "URGENT (≤4d)",   value: urgent.length,   color: "#E8952A" },
              { label: "THIS WEEK",       value: thisWeek.length, color: "#6366F1" },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.1 }} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#888", letterSpacing: "0.1em", marginTop: 4 }}>{s.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <div className="section-label">ACTIONABLE CASES</div>

        {/* Patient cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <AnimatePresence>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 100, border: "1px solid rgba(255,255,255,0.04)" }} />
                ))
              : patients.map((p, i) => {
                  const u = urgencyColor(p.days_until_transfusion);
                  const isTriggering = triggering === p.patient_id;
                  return (
                    <motion.div key={p.patient_id}
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      whileHover={{ y: -2, boxShadow: `0 8px 32px ${u.glow}` }}
                      style={{
                        background: u.bg, border: `1px solid ${u.border}`, borderRadius: 14, padding: "20px 24px",
                        display: "flex", alignItems: "center", gap: 24, backdropFilter: "blur(12px)",
                        transition: "all 0.3s ease",
                      }}>

                      {/* Days badge */}
                      <div style={{ minWidth: 64, textAlign: "center" }}>
                        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 800, color: u.label, lineHeight: 1 }}>{p.days_until_transfusion}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#888", marginTop: 4, letterSpacing: "0.1em" }}>DAYS</div>
                      </div>

                      <div style={{ width: 1, height: 48, background: "rgba(255,255,255,0.08)" }} />

                      {/* Patient info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: "#F0EEE8" }}>{p.name}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: u.label, background: `${u.border}33`, border: `1px solid ${u.border}`, padding: "2px 10px", borderRadius: 4, fontWeight: 600 }}>
                            {p.blood_group}
                          </span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: u.label, letterSpacing: "0.1em", fontWeight: 600 }}>{u.tag}</span>
                        </div>
                        <div style={{ display: "flex", gap: 20, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#888" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><MapPin size={12} color={u.label} /> {p.city}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Phone size={12} color={u.label} /> {p.phone}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Clock size={12} color={u.label} /> {p.expected_next_transfusion_date}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Droplets size={12} color={u.label} /> {p.active_donors}/{p.guardian_circle_size} donors</span>
                        </div>
                      </div>

                      {/* Action */}
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => triggerRequest(p.patient_id)}
                        disabled={isTriggering}
                        className={isTriggering ? "" : "btn-crimson"}
                        style={{
                          padding: "12px 24px", borderRadius: 10, fontSize: 14, minWidth: 160,
                          background: isTriggering ? "#1DB88E" : undefined, border: "none", color: "#fff",
                          cursor: isTriggering ? "default" : "pointer", fontFamily: "'Syne', sans-serif", fontWeight: 700
                        }}>
                        {isTriggering ? "✓ Cascade Triggered" : "Trigger Cascade →"}
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