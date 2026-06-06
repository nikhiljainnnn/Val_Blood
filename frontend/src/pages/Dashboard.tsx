import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Users, Heart, AlertTriangle, Droplets, TrendingUp } from "lucide-react";
import { useDashboardStore, useAuthStore } from "../store";
import { dashboardAPI } from "../api/client";
import AlertBanner     from "../components/AlertBanner";
import GuardianCircle  from "../components/GuardianCircle";
import HbForecastChart from "../components/HbForecastChart";
import { useNavigate } from "react-router-dom";



const URGENCY_COLOR = {
  normal:   "border-blue-500/40 bg-blue-500/5",
  urgent:   "border-amber-500/40 bg-amber-500/5",
  critical: "border-red-500/40 bg-red-500/5",
};

const EVENT_LABEL: Record<string, string> = {
  new_request:      "New transfusion request",
  donor_confirmed:  "Donor confirmed",
  churn_alert:      "Churn risk detected",
  inventory_update: "Inventory updated",
  circle_replaced:  "Circle donor replaced",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { events, connected, stats } = useDashboardStore();
  const { name, role }               = useAuthStore();
  const [loading, setLoading]        = useState(true);
  const [statsData, setStatsData]    = useState({
    active_patients: 0, active_donors: 0, guardian_circles: 0,
    at_risk_donors: 0, open_requests: 0, units_available: 0,
    transfusions_this_month: 0, avg_circle_health: 0,
  });

  // Demo patient IDs for Guardian Circle showcase
  const [demoPatientId] = useState("demo-patient-001");
  const [demoCircle]    = useState([
    { donor_id: "d1", donor_name: "Ramesh Kumar",   compatibility: { score: 0.97, mismatch_count: 0, risk_level: "safe" }, churn_probability: 0.12, availability_prob: 0.88, days_to_eligible: 0,  rank: 1, status: "active", phone: "+919xxxxxxxxx", language: "hi" },
    { donor_id: "d2", donor_name: "Priya Sharma",   compatibility: { score: 0.93, mismatch_count: 0, risk_level: "safe" }, churn_probability: 0.08, availability_prob: 0.92, days_to_eligible: 12, rank: 2, status: "active", phone: "+919xxxxxxxxx", language: "hi" },
    { donor_id: "d3", donor_name: "Vijay Reddy",    compatibility: { score: 0.91, mismatch_count: 1, risk_level: "caution" }, churn_probability: 0.71, availability_prob: 0.29, days_to_eligible: 0, rank: 3, status: "at_risk", phone: "+919xxxxxxxxx", language: "te" },
    { donor_id: "d4", donor_name: "Ananya Iyer",    compatibility: { score: 0.89, mismatch_count: 0, risk_level: "safe" }, churn_probability: 0.22, availability_prob: 0.78, days_to_eligible: 6, rank: 4, status: "active", phone: "+919xxxxxxxxx", language: "ta" },
    { donor_id: "d5", donor_name: "Suresh Patel",   compatibility: { score: 0.87, mismatch_count: 1, risk_level: "caution" }, churn_probability: 0.35, availability_prob: 0.65, days_to_eligible: 0, rank: 5, status: "active", phone: "+919xxxxxxxxx", language: "hi" },
    { donor_id: "d6", donor_name: "Deepa Nair",     compatibility: { score: 0.85, mismatch_count: 0, risk_level: "safe" }, churn_probability: 0.18, availability_prob: 0.82, days_to_eligible: 21, rank: 6, status: "active", phone: "+919xxxxxxxxx", language: "ml" },
    { donor_id: "d7", donor_name: "Arun Mehta",     compatibility: { score: 0.82, mismatch_count: 2, risk_level: "caution" }, churn_probability: 0.55, availability_prob: 0.45, days_to_eligible: 0, rank: 7, status: "at_risk", phone: "+919xxxxxxxxx", language: "hi" },
    { donor_id: "d8", donor_name: "Kavya Rao",      compatibility: { score: 0.80, mismatch_count: 0, risk_level: "safe" }, churn_probability: 0.10, availability_prob: 0.90, days_to_eligible: 4,  rank: 8, status: "donated", phone: "+919xxxxxxxxx", language: "kn" },
  ]);

  useEffect(() => {
    import("../api/client").then(({ demoAPI }) => {
      demoAPI.getDemoSummary()
        .then(r => {
          const hl = r.data?.headline_numbers || {};
          setStatsData({
            active_patients: hl.total_patients || 487,
            active_donors: hl.active_bridge_donors || 4218,
            guardian_circles: hl.total_patients || 487,
            at_risk_donors: hl.at_risk_bridge_donors || 143,
            open_requests: hl.urgent_patients_7d || 12,
            units_available: 834,
            transfusions_this_month: 892,
            avg_circle_health: 0.87,
          });
        })
        .catch((err) => {
          console.warn("Failed to load demo summary, using defaults", err);
        })
        .finally(() => setLoading(false));
    });
  }, []);

  const statCards = [
    { label: "Active Patients",        value: statsData.active_patients,        icon: Heart,          color: "text-red-400",    bg: "bg-red-500/8" },
    { label: "Verified Donors",         value: statsData.active_donors,          icon: Users,          color: "text-blue-400",   bg: "bg-blue-500/8" },
    { label: "Guardian Circles",        value: statsData.guardian_circles,       icon: Activity,       color: "text-teal-400",   bg: "bg-teal-500/8" },
    { label: "At-Risk Donors",          value: statsData.at_risk_donors,         icon: AlertTriangle,  color: "text-amber-400",  bg: "bg-amber-500/8" },
    { label: "Open Requests",           value: statsData.open_requests,          icon: Droplets,       color: "text-purple-400", bg: "bg-purple-500/8" },
    { label: "Transfusions This Month", value: statsData.transfusions_this_month, icon: TrendingUp,    color: "text-green-400",  bg: "bg-green-500/8" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#08080A", color: "#F0EEE8", fontFamily: "'Syne', sans-serif" }}>

      {/* Top bar */}
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(10,10,11,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            <span style={{ color: "#E8554E" }}>Rak</span>Setu
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#444", background: "#18181C", border: "1px solid rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 4 }}>
            coordinator
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>

          <button onClick={() => navigate("/urgent")} style={{ background: "rgba(232,85,78,0.1)", border: "1px solid rgba(232,85,78,0.3)", color: "#E8554E", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
            ⚡ 67 Urgent Cases
          </button>
          <button onClick={() => navigate("/at-risk")} style={{ background: "rgba(232,149,42,0.1)", border: "1px solid rgba(232,149,42,0.3)", color: "#E8952A", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
            ⚠ 146 At-Risk Donors
          </button>
        </div>
      </header>

      <main style={{ padding: "32px 32px" }}>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 32 }}>
          {statCards.map((s, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ padding: 8, borderRadius: 8, background: s.bg }}>
                  <s.icon size={16} className={s.color} style={{ color: s.color.replace("text-", "") }} />
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", letterSpacing: "0.1em" }}>
                  {s.label.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {loading ? "—" : s.value.toLocaleString()}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Two-column main area */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>

          {/* Left: Guardian Circle + Hb Chart */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Circle health bar */}
            <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Guardian Circle — Patient Arjun</h2>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#1DB88E", background: "rgba(29,184,142,0.1)", border: "1px solid rgba(29,184,142,0.2)", padding: "3px 10px", borderRadius: 4 }}>
                  avg 92% compatible
                </span>
              </div>
              <GuardianCircle donors={demoCircle} patientName="Arjun" />
              <div style={{ display: "flex", gap: 20, marginTop: 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#666" }}>
                <span><span style={{ color: "#6366F1" }}>●</span> Active</span>
                <span><span style={{ color: "#E8952A" }}>●</span> At Risk</span>
                <span><span style={{ color: "#1DB88E" }}>●</span> Donated</span>
                <span style={{ marginLeft: "auto" }}>Circle size: {demoCircle.length}/10</span>
              </div>
            </div>

            {/* Hb Forecast */}
            <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "20px 24px" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Hb Drop Forecast — Arjun</h2>
              <HbForecastChart patientId={demoPatientId} />
            </div>
          </div>

          {/* Right: Live event feed */}
          <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Live Events</h2>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555" }}>
                {events.length} events
              </span>
            </div>

            <div style={{ maxHeight: 600, overflowY: "auto" }}>
              <AnimatePresence initial={false}>
                {events.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 0", color: "#444", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                    Waiting for events...<br/>
                    <span style={{ fontSize: 10 }}>System will broadcast new requests, confirmations, and alerts here</span>
                  </div>
                ) : (
                  events.map((ev) => (
                    <motion.div key={ev.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      style={{
                        marginBottom: 8, padding: "12px 14px",
                        borderRadius: 8, border: "1px solid",
                        borderColor: ev.urgency === "critical" ? "rgba(232,85,78,0.4)" : ev.urgency === "urgent" ? "rgba(232,149,42,0.4)" : "rgba(255,255,255,0.06)",
                        background: ev.urgency === "critical" ? "rgba(232,85,78,0.06)" : ev.urgency === "urgent" ? "rgba(232,149,42,0.06)" : "rgba(255,255,255,0.02)",
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          {EVENT_LABEL[ev.event] || ev.event}
                        </span>
                        {ev.urgency !== "normal" && (
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: ev.urgency === "critical" ? "#E8554E" : "#E8952A", background: ev.urgency === "critical" ? "rgba(232,85,78,0.12)" : "rgba(232,149,42,0.12)", padding: "2px 8px", borderRadius: 3 }}>
                            {ev.urgency.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555" }}>
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Demo: inject events */}
            <AlertBanner />
          </div>
        </div>
      </main>
    </div>
  );
}
