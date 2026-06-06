import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Clock, Droplets, MapPin, Phone } from "lucide-react";
import { demoAPI, matchingAPI } from "../api/client";
import { useNavigate } from "react-router-dom";

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
  if (days <= 2) return { border: "rgba(232,85,78,0.5)",  bg: "rgba(232,85,78,0.07)",  label: "#E8554E", tag: "CRITICAL" };
  if (days <= 4) return { border: "rgba(232,149,42,0.5)", bg: "rgba(232,149,42,0.07)", label: "#E8952A", tag: "URGENT"   };
  return               { border: "rgba(99,102,241,0.4)",  bg: "rgba(99,102,241,0.06)", label: "#6366F1", tag: "THIS WEEK"};
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
    <div style={{ minHeight: "100vh", background: "#08080A", color: "#F0EEE8", fontFamily: "'Syne', sans-serif" }}>

      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(10,10,11,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", cursor: "pointer" }} onClick={() => navigate("/")}>
            <span style={{ color: "#E8554E" }}>Rak</span>Setu
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#444", background: "#18181C", border: "1px solid rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 4 }}>
            urgent-cases
          </span>
        </div>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "#888", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
          ← Dashboard
        </button>
      </header>

      <main style={{ padding: "32px" }}>

        {/* Hero stat */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "rgba(232,85,78,0.06)", border: "1px solid rgba(232,85,78,0.3)", borderRadius: 14, padding: "28px 32px", marginBottom: 32, display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ background: "rgba(232,85,78,0.12)", borderRadius: 12, padding: 16 }}>
            <AlertTriangle size={32} color="#E8554E" />
          </div>
          <div>
            <div style={{ fontSize: 48, fontWeight: 800, color: "#E8554E", lineHeight: 1 }}>
              {loading ? "—" : patients.length}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#888", marginTop: 4 }}>
              patients need transfusion in the next 7 days
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 24 }}>
            {[
              { label: "CRITICAL (≤2d)", value: critical.length, color: "#E8554E" },
              { label: "URGENT (≤4d)",   value: urgent.length,   color: "#E8952A" },
              { label: "THIS WEEK",       value: thisWeek.length, color: "#6366F1" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#555", letterSpacing: "0.08em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Patient cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <AnimatePresence>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ height: 88, background: "#111113", borderRadius: 10, border: "1px solid rgba(255,255,255,0.04)", animation: "pulse 1.5s infinite" }} />
                ))
              : patients.map((p, i) => {
                  const u = urgencyColor(p.days_until_transfusion);
                  const isTriggering = triggering === p.patient_id;
                  return (
                    <motion.div key={p.patient_id}
                      initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      style={{ background: u.bg, border: `1px solid ${u.border}`, borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", gap: 20 }}>

                      {/* Days badge */}
                      <div style={{ minWidth: 56, textAlign: "center" }}>
                        <div style={{ fontSize: 26, fontWeight: 800, color: u.label, lineHeight: 1 }}>{p.days_until_transfusion}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#555" }}>DAYS</div>
                      </div>

                      <div style={{ width: 1, height: 40, background: "rgba(255,255,255,0.06)" }} />

                      {/* Patient info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: u.label, background: `${u.border}33`, border: `1px solid ${u.border}`, padding: "2px 8px", borderRadius: 3 }}>
                            {p.blood_group}
                          </span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: u.label, letterSpacing: "0.1em" }}>{u.tag}</span>
                        </div>
                        <div style={{ display: "flex", gap: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={10} /> {p.city}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={10} /> {p.phone}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={10} /> {p.expected_next_transfusion_date}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Droplets size={10} /> {p.active_donors}/{p.guardian_circle_size} donors active</span>
                        </div>
                      </div>

                      {/* Action */}
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => triggerRequest(p.patient_id)}
                        disabled={isTriggering}
                        style={{ padding: "10px 20px", borderRadius: 7, border: "none", background: isTriggering ? "#1DB88E" : "#C0272D", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne', sans-serif", minWidth: 140, transition: "background 0.2s" }}>
                        {isTriggering ? "✓ Triggered" : "Trigger Cascade →"}
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