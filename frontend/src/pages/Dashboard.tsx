import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Users, Heart, AlertTriangle, Droplets,
  TrendingUp, Zap, Shield, Bell, LogOut, ChevronRight,
} from "lucide-react";
import { useDashboardStore, useAuthStore } from "../store";
import AlertBanner from "../components/AlertBanner";
import GuardianCircle from "../components/GuardianCircle";
import HbForecastChart from "../components/HbForecastChart";
import ParticleBackground from "../components/ParticleBackground";
import { useNavigate } from "react-router-dom";
import "../index.css";

const EVENT_LABEL: Record<string, string> = {
  new_request: "New transfusion request",
  donor_confirmed: "Donor confirmed",
  churn_alert: "Churn risk detected",
  inventory_update: "Inventory updated",
  circle_replaced: "Circle donor replaced",
};

// Animated counter hook
function useCounter(target: number, duration = 1200, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const start = Date.now();
      const tick = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
        setValue(Math.round(eased * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timer);
  }, [target]);
  return value;
}

// Individual animated stat card
function StatCard({
  label, value, icon: Icon, color, bg, delay = 0, suffix = "",
}: {
  label: string; value: number; icon: any; color: string;
  bg: string; delay?: number; suffix?: string;
}) {
  const animated = useCounter(value, 1200, delay);
  return (
    <motion.div
      className="stat-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -3 }}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Icon */}
      <div style={{
        width: 36, height: 36,
        borderRadius: 10,
        background: bg,
        border: `1px solid ${color}25`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 14,
      }}>
        <Icon size={16} style={{ color }} />
      </div>

      {/* Value */}
      <div style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: 28,
        fontWeight: 800,
        letterSpacing: "-0.02em",
        color: "#F0EEE8",
        lineHeight: 1,
        marginBottom: 6,
      }}>
        {animated.toLocaleString()}{suffix}
      </div>

      {/* Label */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        color: "#555562",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}>
        {label}
      </div>

      {/* Bottom accent */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        height: 2,
        background: `linear-gradient(90deg, ${color}60, transparent)`,
        borderRadius: "0 0 14px 14px",
      }} />
    </motion.div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { events, connected } = useDashboardStore();
  const { name, role, logout } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [statsData, setStatsData] = useState({
    active_patients: 0, active_donors: 0, guardian_circles: 0,
    at_risk_donors: 0, open_requests: 0, transfusions_this_month: 0,
  });

  const DEMO_CIRCLE = [
    { donor_id: "d1", donor_name: "Ramesh Kumar", compatibility: { score: 0.97, mismatch_count: 0, risk_level: "safe" }, churn_probability: 0.12, availability_prob: 0.88, days_to_eligible: 0, rank: 1, status: "active", phone: "+919xxx", language: "hi" },
    { donor_id: "d2", donor_name: "Priya Sharma", compatibility: { score: 0.93, mismatch_count: 0, risk_level: "safe" }, churn_probability: 0.08, availability_prob: 0.92, days_to_eligible: 12, rank: 2, status: "active", phone: "+919xxx", language: "hi" },
    { donor_id: "d3", donor_name: "Vijay Reddy", compatibility: { score: 0.91, mismatch_count: 1, risk_level: "caution" }, churn_probability: 0.71, availability_prob: 0.29, days_to_eligible: 0, rank: 3, status: "at_risk", phone: "+919xxx", language: "te" },
    { donor_id: "d4", donor_name: "Ananya Iyer", compatibility: { score: 0.89, mismatch_count: 0, risk_level: "safe" }, churn_probability: 0.22, availability_prob: 0.78, days_to_eligible: 6, rank: 4, status: "active", phone: "+919xxx", language: "ta" },
    { donor_id: "d5", donor_name: "Suresh Patel", compatibility: { score: 0.87, mismatch_count: 1, risk_level: "caution" }, churn_probability: 0.35, availability_prob: 0.65, days_to_eligible: 0, rank: 5, status: "active", phone: "+919xxx", language: "hi" },
    { donor_id: "d6", donor_name: "Deepa Nair", compatibility: { score: 0.85, mismatch_count: 0, risk_level: "safe" }, churn_probability: 0.18, availability_prob: 0.82, days_to_eligible: 21, rank: 6, status: "active", phone: "+919xxx", language: "ml" },
    { donor_id: "d7", donor_name: "Arun Mehta", compatibility: { score: 0.82, mismatch_count: 2, risk_level: "caution" }, churn_probability: 0.55, availability_prob: 0.45, days_to_eligible: 0, rank: 7, status: "at_risk", phone: "+919xxx", language: "hi" },
    { donor_id: "d8", donor_name: "Kavya Rao", compatibility: { score: 0.80, mismatch_count: 0, risk_level: "safe" }, churn_probability: 0.10, availability_prob: 0.90, days_to_eligible: 4, rank: 8, status: "donated", phone: "+919xxx", language: "kn" },
  ];

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
            transfusions_this_month: 892,
          });
        })
        .catch(() => {
          setStatsData({
            active_patients: 487, active_donors: 4218,
            guardian_circles: 487, at_risk_donors: 143,
            open_requests: 12, transfusions_this_month: 892,
          });
        })
        .finally(() => setLoading(false));
    });
  }, []);

  const statCards = [
    { label: "Active Patients", value: statsData.active_patients, icon: Heart, color: "#E8554E", bg: "rgba(232,85,78,0.1)", delay: 0 },
    { label: "Verified Donors", value: statsData.active_donors, icon: Users, color: "#6366F1", bg: "rgba(99,102,241,0.1)", delay: 80 },
    { label: "Guardian Circles", value: statsData.guardian_circles, icon: Shield, color: "#1DB88E", bg: "rgba(29,184,142,0.1)", delay: 160 },
    { label: "At-Risk Donors", value: statsData.at_risk_donors, icon: AlertTriangle, color: "#E8952A", bg: "rgba(232,149,42,0.1)", delay: 240 },
    { label: "Open Requests", value: statsData.open_requests, icon: Droplets, color: "#8B5CF6", bg: "rgba(139,92,246,0.1)", delay: 320 },
    { label: "Transfusions / Month", value: statsData.transfusions_this_month, icon: TrendingUp, color: "#10B981", bg: "rgba(16,185,129,0.1)", delay: 400 },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#08080A", color: "#F0EEE8", fontFamily: "'DM Sans', sans-serif" }}>
      <ParticleBackground />

      {/* ── HEADER ── */}
      <header className="app-header" style={{ position: "sticky", top: 0, zIndex: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg,#C0272D,#8B0000)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, boxShadow: "0 0 16px rgba(192,39,45,0.4)",
            animation: "heartbeat 2.5s ease-in-out infinite",
          }}>
            💗
          </div>
          <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
            <span style={{ color: "#E8554E" }}>Rak</span>Setu
          </span>
          <span style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#444",
            background: "#14141A", border: "1px solid rgba(255,255,255,0.06)",
            padding: "3px 8px", borderRadius: 5, letterSpacing: "0.08em",
          }}>
            {role || "coordinator"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* WS indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: connected ? "#1DB88E" : "#555" }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: connected ? "#1DB88E" : "#555",
              boxShadow: connected ? "0 0 8px #1DB88E" : "none",
            }} />
            {connected ? "LIVE" : "OFFLINE"}
          </div>

          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)" }} />

          {/* Urgent Cases button */}
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/urgent")}
            style={{
              background: "rgba(232,85,78,0.08)", border: "1px solid rgba(232,85,78,0.25)",
              color: "#E8554E", borderRadius: 8, padding: "7px 14px", cursor: "pointer",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <Zap size={12} />⚡ 67 Urgent
          </motion.button>

          {/* At-Risk Donors button */}
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/at-risk")}
            style={{
              background: "rgba(232,149,42,0.08)", border: "1px solid rgba(232,149,42,0.25)",
              color: "#E8952A", borderRadius: 8, padding: "7px 14px", cursor: "pointer",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <AlertTriangle size={12} />⚠ 143 At-Risk
          </motion.button>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main style={{ padding: "28px 32px", position: "relative", zIndex: 1 }}>

        {/* Welcome row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <div>
            <div className="section-label">COMMAND CENTER</div>
            <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: "#F0EEE8", margin: 0 }}>
              Good evening, {name || "Coordinator"} 👋
            </h1>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#444", marginTop: 4 }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/patient/demo-patient-001")}
            className="btn-crimson"
            style={{ gap: 8 }}
          >
            <Droplets size={14} /> View Patient
          </motion.button>
        </motion.div>

        {/* ── STATS GRID ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 28 }}>
          {statCards.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>

        {/* ── TWO-COLUMN LAYOUT ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>

          {/* LEFT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Guardian Circle card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              style={{
                background: "rgba(14,14,20,0.7)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16,
                padding: "22px 24px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Background accent */}
              <div style={{
                position: "absolute", top: -60, right: -60,
                width: 200, height: 200, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div className="section-label">GUARDIAN CIRCLE</div>
                  <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, margin: 0 }}>
                    Patient Arjun — Active Circle
                  </h2>
                </div>
                <div style={{
                  background: "rgba(29,184,142,0.08)", border: "1px solid rgba(29,184,142,0.2)",
                  color: "#1DB88E", fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
                  padding: "4px 12px", borderRadius: 6,
                }}>
                  avg 92% compat
                </div>
              </div>

              <GuardianCircle donors={DEMO_CIRCLE} patientName="Arjun" />

              <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
                {[["#6366F1", "Active"], ["#E8952A", "At Risk"], ["#1DB88E", "Donated"]].map(([c, l]) => (
                  <span key={l} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#555", display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block", boxShadow: `0 0 6px ${c}` }} />
                    {l}
                  </span>
                ))}
                <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#555" }}>
                  Circle: {DEMO_CIRCLE.length}/10 donors
                </span>
              </div>
            </motion.div>

            {/* Hb Forecast card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              style={{
                background: "rgba(14,14,20,0.7)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16,
                padding: "22px 24px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{
                position: "absolute", bottom: -40, left: -40,
                width: 160, height: 160, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(192,39,45,0.07) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />

              <div style={{ marginBottom: 16 }}>
                <div className="section-label">AI PREDICTION</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, margin: 0 }}>
                    Hb Drop Forecast — Arjun
                  </h2>
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                    color: "#8B5CF6", background: "rgba(139,92,246,0.08)",
                    border: "1px solid rgba(139,92,246,0.2)", padding: "3px 10px", borderRadius: 5,
                  }}>
                    BiLSTM · ±2.8d MAE
                  </span>
                </div>
              </div>
              <HbForecastChart patientId="demo-patient-001" />
            </motion.div>
          </div>

          {/* RIGHT COLUMN — Live events */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            style={{
              background: "rgba(14,14,20,0.7)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16,
              padding: "20px",
              position: "sticky",
              top: 80,
              maxHeight: "calc(100vh - 100px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
              <div>
                <div className="section-label" style={{ marginBottom: 4 }}>LIVE FEED</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, margin: 0 }}>
                    Real-time Events
                  </h2>
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: connected ? "#1DB88E" : "#444",
                    boxShadow: connected ? "0 0 8px #1DB88E" : "none",
                    animation: connected ? "ripple 2s ease-out infinite" : "none",
                  }} />
                </div>
              </div>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#444" }}>
                {events.length} events
              </span>
            </div>

            {/* Events list */}
            <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
              <AnimatePresence initial={false}>
                {events.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ textAlign: "center", padding: "48px 0", color: "#333" }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🩸</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.7 }}>
                      Waiting for events...<br />
                      <span style={{ fontSize: 9, color: "#222" }}>
                        System will broadcast requests, confirmations & alerts here
                      </span>
                    </div>
                  </motion.div>
                ) : (
                  events.map((ev, i) => (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, x: 20, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      style={{
                        marginBottom: 8,
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1px solid",
                        borderColor: ev.urgency === "critical"
                          ? "rgba(232,85,78,0.35)"
                          : ev.urgency === "urgent"
                            ? "rgba(232,149,42,0.3)"
                            : "rgba(255,255,255,0.06)",
                        background: ev.urgency === "critical"
                          ? "rgba(232,85,78,0.06)"
                          : ev.urgency === "urgent"
                            ? "rgba(232,149,42,0.05)"
                            : "rgba(255,255,255,0.02)",
                        borderLeft: ev.urgency === "critical"
                          ? "2px solid #E8554E"
                          : ev.urgency === "urgent"
                            ? "2px solid #E8952A"
                            : "2px solid transparent",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#F0EEE8" }}>
                          {EVENT_LABEL[ev.event] || ev.event}
                        </span>
                        {ev.urgency !== "normal" && (
                          <span style={{
                            fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
                            color: ev.urgency === "critical" ? "#E8554E" : "#E8952A",
                            background: ev.urgency === "critical" ? "rgba(232,85,78,0.12)" : "rgba(232,149,42,0.1)",
                            padding: "2px 8px", borderRadius: 4, letterSpacing: "0.08em",
                          }}>
                            {ev.urgency.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#444" }}>
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Demo inject */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
              <AlertBanner />
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
