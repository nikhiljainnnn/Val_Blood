import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Users, Heart, AlertTriangle, Droplets,
  TrendingUp, Shield, Zap, ChevronRight,
} from "lucide-react";
import { useDashboardStore, useAuthStore } from "../store";
import AlertBanner from "../components/AlertBanner";
import GuardianCircle from "../components/GuardianCircle";
import HbForecastChart from "../components/HbForecastChart";
import AgentModal from "../components/AgentModal";
import { useNavigate } from "react-router-dom";

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
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timer);
  }, [target]);
  return value;
}

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
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: bg,
        border: `1px solid ${color}25`,
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
      }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800,
        letterSpacing: "-0.02em", color: "var(--text-main)", lineHeight: 1, marginBottom: 6,
      }}>
        {animated.toLocaleString()}{suffix}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
        letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${color}60, transparent)`,
        borderRadius: "0 0 14px 14px",
      }} />
    </motion.div>
  );
}

const DEMO_CIRCLE = [
  { donor_id:"d1", donor_name:"Ramesh Kumar", compatibility:{score:0.97,mismatch_count:0,risk_level:"safe"}, churn_probability:0.12, availability_prob:0.88, days_to_eligible:0,  rank:1, status:"active",  phone:"+919xxx", language:"hi" },
  { donor_id:"d2", donor_name:"Priya Sharma", compatibility:{score:0.93,mismatch_count:0,risk_level:"safe"}, churn_probability:0.08, availability_prob:0.92, days_to_eligible:12, rank:2, status:"active",  phone:"+919xxx", language:"hi" },
  { donor_id:"d3", donor_name:"Vijay Reddy",  compatibility:{score:0.91,mismatch_count:1,risk_level:"caution"}, churn_probability:0.71, availability_prob:0.29, days_to_eligible:0, rank:3, status:"at_risk", phone:"+919xxx", language:"te" },
  { donor_id:"d4", donor_name:"Ananya Iyer",  compatibility:{score:0.89,mismatch_count:0,risk_level:"safe"}, churn_probability:0.22, availability_prob:0.78, days_to_eligible:6,  rank:4, status:"active",  phone:"+919xxx", language:"ta" },
  { donor_id:"d5", donor_name:"Suresh Patel", compatibility:{score:0.87,mismatch_count:1,risk_level:"caution"}, churn_probability:0.35, availability_prob:0.65, days_to_eligible:0, rank:5, status:"active",  phone:"+919xxx", language:"hi" },
  { donor_id:"d6", donor_name:"Deepa Nair",   compatibility:{score:0.85,mismatch_count:0,risk_level:"safe"}, churn_probability:0.18, availability_prob:0.82, days_to_eligible:21, rank:6, status:"active",  phone:"+919xxx", language:"ml" },
  { donor_id:"d7", donor_name:"Arun Mehta",   compatibility:{score:0.82,mismatch_count:2,risk_level:"caution"}, churn_probability:0.55, availability_prob:0.45, days_to_eligible:0, rank:7, status:"at_risk", phone:"+919xxx", language:"hi" },
  { donor_id:"d8", donor_name:"Kavya Rao",    compatibility:{score:0.80,mismatch_count:0,risk_level:"safe"}, churn_probability:0.10, availability_prob:0.90, days_to_eligible:4,  rank:8, status:"donated", phone:"+919xxx", language:"kn" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { events, connected } = useDashboardStore();
  const { name } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [circle, setCircle] = useState<any[]>([]);
  const [statsData, setStatsData] = useState({
    active_patients: 0, active_donors: 0, guardian_circles: 0,
    at_risk_donors: 0, open_requests: 0, transfusions_this_month: 0,
  });

  useEffect(() => {
    import("../api/client").then(({ matchingAPI, demoAPI }) => {
      // Fetch guardian circle donors
      matchingAPI.getGuardianCircle("demo-patient-001")
        .then(res => setCircle(res.data?.donors || []))
        .catch(console.error);

      // Fetch live dashboard stats
      demoAPI.getDemoSummary()
        .then(r => {
          const data = r.data || {};
          setStatsData({
            active_patients: data.total_patients || 487,
            active_donors: data.total_donors || 4218,
            guardian_circles: data.total_patients || 487,
            at_risk_donors: data.at_risk_bridge_donors || 0,
            open_requests: data.urgent_patients || 0,
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
    { label: "Active Patients",    value: statsData.active_patients,          icon: Heart,         color: "#E8554E", bg: "rgba(232,85,78,0.1)",   delay: 0 },
    { label: "Verified Donors",    value: statsData.active_donors,            icon: Users,         color: "#6366F1", bg: "rgba(99,102,241,0.1)",  delay: 80 },
    { label: "Guardian Circles",   value: statsData.guardian_circles,         icon: Shield,        color: "#1DB88E", bg: "rgba(29,184,142,0.1)",  delay: 160 },
    { label: "At-Risk Donors",     value: statsData.at_risk_donors,           icon: AlertTriangle, color: "#E8952A", bg: "rgba(232,149,42,0.1)",  delay: 240 },
    { label: "Open Requests",      value: statsData.open_requests,            icon: Droplets,      color: "#8B5CF6", bg: "rgba(139,92,246,0.1)",  delay: 320 },
    { label: "Transfusions / Mo",  value: statsData.transfusions_this_month,  icon: TrendingUp,    color: "#10B981", bg: "rgba(16,185,129,0.1)",  delay: 400 },
  ];

  return (
    <div>
      {/* ── Topbar ── */}
      <div className="topbar">
        <div>
          <div className="section-label">COMMAND CENTER</div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, letterSpacing:"-0.02em", margin:0 }}>
            Good evening, {name || "Coordinator"} 👋
          </h1>
          <p style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", marginTop:2 }}>
            {new Date().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
          </p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* WS indicator */}
          <div style={{ display:"flex", alignItems:"center", gap:6, fontFamily:"var(--font-mono)", fontSize:10, color: connected ? "var(--success)" : "var(--text-muted)" }}>
            <span style={{
              width:6, height:6, borderRadius:"50%",
              background: connected ? "var(--success)" : "var(--text-muted)",
              boxShadow: connected ? "0 0 8px var(--success)" : "none",
            }} />
            {connected ? "LIVE" : "OFFLINE"}
          </div>
          <motion.button whileTap={{ scale:0.97 }} onClick={() => navigate("/urgent")}
            className="badge badge-crimson" style={{ cursor:"pointer", padding:"7px 14px", border:"1px solid var(--crimson-border)" }}>
            <Zap size={11} /> {statsData.open_requests} Urgent
          </motion.button>
          <motion.button whileTap={{ scale:0.97 }} onClick={() => navigate("/at-risk")}
            className="badge badge-warning" style={{ cursor:"pointer", padding:"7px 14px", border:"1px solid rgba(232,149,42,0.3)" }}>
            <AlertTriangle size={11} /> {statsData.at_risk_donors} At-Risk
          </motion.button>
          <motion.button whileTap={{ scale:0.97 }} onClick={() => setAgentOpen(true)}
            className="btn-primary" style={{ padding:"9px 18px", background: "var(--navy-3)", border: "1px solid var(--border-light)" }}>
            <Activity size={14} /> Run Agent
          </motion.button>
          <motion.button whileTap={{ scale:0.97 }} onClick={() => navigate("/patient/demo-patient-001")}
            className="btn-primary" style={{ padding:"9px 18px" }}>
            <Droplets size={14} /> View Patient
          </motion.button>
        </div>
      </div>

      <div className="page-content">
        {/* ── Stats Grid ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:14, marginBottom:28 }}>
          {statCards.map(s => <StatCard key={s.label} {...s} />)}
        </div>

        {/* ── Two-column layout ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20, alignItems:"start" }}>

          {/* LEFT */}
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {/* Guardian Circle */}
            <div className="card" style={{ padding:"28px 28px",
              background:"linear-gradient(135deg, rgba(99,102,241,0.04) 0%, var(--navy-3) 60%)",
              border:"1px solid rgba(99,102,241,0.18)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
                <div>
                  <div className="section-label">GUARDIAN CIRCLE · AI-MATCHED DONORS</div>
                  <h2 style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, margin:0,
                    letterSpacing:"-0.01em" }}>
                    Patient Arjun
                  </h2>
                  <p style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", marginTop:4 }}>
                    {circle.length || DEMO_CIRCLE.length} guardian donors · dual-orbit network view
                  </p>
                </div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>
                  <span className="badge badge-success">92% avg compat</span>
                  <span className="badge badge-info">12-antigen matched</span>
                </div>
              </div>

              <GuardianCircle donors={circle.length > 0 ? circle : DEMO_CIRCLE} patientName="Arjun" width={680} height={540} />
            </div>

            {/* Hb Forecast */}
            <div className="card" style={{ padding:"22px 24px" }}>
              <div style={{ marginBottom:16 }}>
                <div className="section-label">AI PREDICTION</div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <h2 style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:700, margin:0 }}>
                    Hb Drop Forecast — Arjun
                  </h2>
                  <span className="badge badge-info">BiLSTM · ±2.8d MAE</span>
                </div>
              </div>
              <HbForecastChart patientId="demo-patient-001" />
            </div>
          </div>

          {/* RIGHT — Live events */}
          <div className="card" style={{
            position:"sticky", top:80, maxHeight:"calc(100vh - 100px)",
            display:"flex", flexDirection:"column", overflow:"hidden",
            padding:"20px",
          }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexShrink:0 }}>
              <div>
                <div className="section-label" style={{ marginBottom:4 }}>LIVE FEED</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <h2 style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:700, margin:0 }}>
                    Real-time Events
                  </h2>
                  <div style={{
                    width:7, height:7, borderRadius:"50%",
                    background: connected ? "var(--success)" : "var(--text-muted)",
                    boxShadow: connected ? "0 0 8px var(--success)" : "none",
                    animation: connected ? "ripple 2s ease-out infinite" : "none",
                  }} />
                </div>
              </div>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
                {events.length} events
              </span>
            </div>

            <div style={{ flex:1, overflowY:"auto", paddingRight:4 }}>
              <AnimatePresence initial={false}>
                {events.length === 0 ? (
                  <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
                    style={{ textAlign:"center", padding:"48px 0", color:"var(--text-subtle)" }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>🩸</div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:11, lineHeight:1.7 }}>
                      Waiting for events...<br />
                      <span style={{ fontSize:9, color:"var(--text-subtle)" }}>
                        System will broadcast requests, confirmations & alerts here
                      </span>
                    </div>
                  </motion.div>
                ) : (
                  events.map(ev => {
                    const color = ev.urgency === "critical" ? "var(--crimson-light)"
                      : ev.urgency === "urgent" ? "var(--warning)" : "var(--text-muted)";
                    return (
                      <motion.div key={ev.id}
                        initial={{ opacity:0, x:20, height:0 }}
                        animate={{ opacity:1, x:0, height:"auto" }}
                        exit={{ opacity:0, height:0 }}
                        transition={{ duration:0.25 }}
                        style={{
                          marginBottom:8, padding:"12px 14px", borderRadius:10,
                          border:`1px solid ${ev.urgency !== "normal" ? `${color}40` : "var(--border)"}`,
                          background: ev.urgency !== "normal" ? `${color}08` : "var(--surface)",
                          borderLeft: ev.urgency !== "normal" ? `2px solid ${color}` : "2px solid transparent",
                        }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:12, fontWeight:600 }}>
                            {EVENT_LABEL[ev.event] || ev.event}
                          </span>
                          {ev.urgency !== "normal" && (
                            <span className={`badge ${ev.urgency === "critical" ? "badge-crimson" : "badge-warning"}`}>
                              {ev.urgency.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>

            {/* Demo inject */}
            <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid var(--border)", flexShrink:0 }}>
              <AlertBanner />
            </div>
          </div>
        </div>
      </div>

      <AgentModal isOpen={agentOpen} onClose={() => setAgentOpen(false)} />
    </div>
  );
}
