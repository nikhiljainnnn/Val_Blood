import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Plus, Zap, AlertTriangle, RefreshCw } from "lucide-react";
import { useDashboardStore, useAuthStore } from "../store";
import GuardianCircle  from "../components/GuardianCircle";
import HbForecastChart from "../components/HbForecastChart";
import AlertBanner     from "../components/AlertBanner";
import { useNavigate } from "react-router-dom";

// ── Animated counter ──────────────────────────────────────
function Counter({ target, duration = 1400, prefix = "", suffix = "" }:
  { target: number; duration?: number; prefix?: string; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - t0) / duration, 1);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return <>{prefix}{v.toLocaleString()}{suffix}</>;
}

// ── Mini inline sparkbar ──────────────────────────────────
function Sparks({ data, color }: { data: number[]; color: string }) {
  const mx = Math.max(...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 28 }}>
      {data.map((v, i) => (
        <motion.div key={i}
          initial={{ height: 0 }}
          animate={{ height: `${(v / mx) * 100}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: i * 0.07 }}
          style={{ flex: 1, background: color, borderRadius: "2px 2px 0 0", opacity: 0.75 + (i / data.length) * 0.25 }}
        />
      ))}
    </div>
  );
}

const DEMO_CIRCLE = [
  { donor_id:"d1",  donor_name:"Ramesh Kumar",  compatibility:{score:0.97,mismatch_count:0,risk_level:"safe"},    churn_probability:0.12, availability_prob:0.88, days_to_eligible:0,  rank:1, status:"active",  phone:"",language:"hi" },
  { donor_id:"d2",  donor_name:"Priya Sharma",  compatibility:{score:0.93,mismatch_count:0,risk_level:"safe"},    churn_probability:0.08, availability_prob:0.92, days_to_eligible:12, rank:2, status:"active",  phone:"",language:"hi" },
  { donor_id:"d3",  donor_name:"Vijay Reddy",   compatibility:{score:0.91,mismatch_count:1,risk_level:"caution"}, churn_probability:0.71, availability_prob:0.29, days_to_eligible:0,  rank:3, status:"at_risk", phone:"",language:"te" },
  { donor_id:"d4",  donor_name:"Ananya Iyer",   compatibility:{score:0.89,mismatch_count:0,risk_level:"safe"},    churn_probability:0.22, availability_prob:0.78, days_to_eligible:6,  rank:4, status:"active",  phone:"",language:"ta" },
  { donor_id:"d5",  donor_name:"Suresh Patel",  compatibility:{score:0.87,mismatch_count:1,risk_level:"caution"}, churn_probability:0.35, availability_prob:0.65, days_to_eligible:0,  rank:5, status:"active",  phone:"",language:"hi" },
  { donor_id:"d6",  donor_name:"Deepa Nair",    compatibility:{score:0.85,mismatch_count:0,risk_level:"safe"},    churn_probability:0.18, availability_prob:0.82, days_to_eligible:21, rank:6, status:"active",  phone:"",language:"ml" },
  { donor_id:"d7",  donor_name:"Arun Mehta",    compatibility:{score:0.82,mismatch_count:2,risk_level:"caution"}, churn_probability:0.55, availability_prob:0.45, days_to_eligible:0,  rank:7, status:"at_risk", phone:"",language:"hi" },
  { donor_id:"d8",  donor_name:"Kavya Rao",     compatibility:{score:0.80,mismatch_count:0,risk_level:"safe"},    churn_probability:0.10, availability_prob:0.90, days_to_eligible:4,  rank:8, status:"donated", phone:"",language:"kn" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { events, connected } = useDashboardStore();
  const { name } = useAuthStore();

  const stats = {
    patients: 487, donors: 4218, circles: 487,
    atRisk: 143, urgent: 67, transfusions: 892,
  };

  const kpiCards = [
    { label: "Monthly Donations", val: 248000,  valFmt: "$248K", sparks: [4,6,5,8,7,10,12], color: "var(--crimson-light)", badge: "+22%", badgeCls: "badge-success" },
    { label: "Recurring Donors",  val: 1240,    valFmt: "1,240", sparks: [6,7,8,8,9,10,11], color: "#6366F1",             badge: "+31%", badgeCls: "badge-info" },
    { label: "New Donors (MTD)",  val: 284,     valFmt: "284",   sparks: [3,4,3,5,4,6,7],   color: "#1DB88E",             badge: "+18%", badgeCls: "badge-success" },
    { label: "Avg Compatibility", val: 89,      valFmt: "89%",   sparks: [7,8,8,9,8,9,9],   color: "#E8952A",             badge: "▲ vs Q1", badgeCls: "badge-warning" },
    { label: "At-Risk Donors",    val: 143,     valFmt: "143",   sparks: [10,9,8,7,7,6,5],  color: "#E8554E",             badge: "-28%", badgeCls: "badge-success" },
    { label: "Transfusions/Mo",   val: 892,     valFmt: "892",   sparks: [6,7,8,9,10,11,12],color: "var(--success)",      badge: "+15%", badgeCls: "badge-success" },
  ];

  return (
    <div>
      {/* ── Top Bar ── */}
      <div className="topbar">
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>
            Donation Tracker
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            FY 2026 · January – April 29 · 119 days
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Live total */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="live-dot" />
            <span className="badge badge-success">Live Total</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--success)" }}>
              $2,418,340
            </span>
          </div>

          {/* Period selector */}
          <div style={{ display: "flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 20, padding: 2 }}>
            {["MTD","QTD","YTD","All Time"].map(t => (
              <button key={t} style={{
                padding: "4px 12px", background: t === "YTD" ? "var(--surface-3)" : "transparent",
                border: "none", borderRadius: 18, fontSize: 12,
                color: t === "YTD" ? "var(--text-main)" : "var(--text-muted)", cursor: "pointer",
                fontFamily: "var(--font-body)", fontWeight: t === "YTD" ? 600 : 400,
              }}>{t}</button>
            ))}
          </div>

          <input placeholder="Search..." className="input-field" style={{ width: 180, borderRadius: 20, padding: "7px 16px" }} />
          <button className="btn-secondary"><Download size={14} /> Export</button>
          <button className="btn-primary" onClick={() => navigate("/urgent")}><Plus size={14} /> Record Request</button>
        </div>
      </div>

      {/* ── Page Content ── */}
      <div className="page-content">

        {/* ── HERO CARD ── */}
        <motion.div className="card-hero anim-fade-up" style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 12 }}>
            — YEAR TO DATE — APRIL 2026
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>
            <span style={{ fontSize: 28, verticalAlign: "top", marginTop: 8, display: "inline-block", color: "var(--crimson-light)" }}>$</span>
            <Counter target={2418340} duration={1800} />
          </div>
          <div style={{ fontSize: 15, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 28, maxWidth: 360, lineHeight: 1.6 }}>
            Every blood match a story. Every donor a guardian<br/>in building a stronger lifeline network.
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 36 }}>
            <span className="badge badge-success">▲ +34% vs 2025</span>
            <span className="badge badge-crimson">✓ 81% of annual goal</span>
            <span className="badge badge-info">6 active campaigns</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
            {[
              { label:"Total Patients",  val: stats.patients, sub: "+32 this month",    color: "var(--crimson-light)" },
              { label:"Active Donors",   val: stats.donors,   sub: "+812 over the year",color: "var(--info)" },
              { label:"Avg Compat Score",val: 89,             sub: "12-antigen match",  color: "var(--warning)", suffix: "%" },
              { label:"Retention Rate",  val: 71,             sub: "+6pp improvement",  color: "var(--success)", suffix: "%" },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>{s.label}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                  <Counter target={s.val} suffix={s.suffix} duration={1200} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: s.color, marginTop: 6, opacity: 0.8 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── KPI CARD ROW ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, marginBottom: 28 }}>
          {kpiCards.map((k, i) => (
            <motion.div
              key={k.label}
              className="card anim-fade-up"
              style={{ animationDelay: `${i * 0.06}s`, padding: "16px" }}
              whileHover={{ y: -3 }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                {k.label}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
                {k.valFmt}
              </div>
              <Sparks data={k.sparks} color={k.color} />
              <div style={{ marginTop: 10 }}>
                <span className={`badge ${k.badgeCls}`} style={{ fontSize: 10 }}>{k.badge}</span>
              </div>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${k.color}80, transparent)`, borderRadius: "0 0 14px 14px" }} />
            </motion.div>
          ))}
        </div>

        {/* ── TWO COLUMN: Circle + Feed ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, marginBottom: 28 }}>

          {/* Guardian Circle */}
          <motion.div className="card anim-fade-up anim-d2">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div className="section-label">Guardian Circle</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>
                  Patient Arjun — Active Circle
                </div>
              </div>
              <span className="badge badge-success">avg 92% compat</span>
            </div>
            <GuardianCircle donors={DEMO_CIRCLE} patientName="Arjun" />
            <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              {[["#6366F1","Active"],["#E8952A","At Risk"],["#1DB88E","Donated"]].map(([c,l]) => (
                <span key={l} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block", boxShadow: `0 0 6px ${c}` }} />{l}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Live Event Feed */}
          <motion.div className="card anim-fade-up anim-d3" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div className="section-label">Live Feed</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700 }}>Real-time Events</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: connected ? "var(--success)" : "var(--text-muted)" }}>
                <span className="live-dot" style={!connected ? { background: "var(--text-muted)", boxShadow: "none", animation: "none" } : {}} />
                {connected ? "LIVE" : "OFFLINE"}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              <AnimatePresence initial={false}>
                {events.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
                    <RefreshCw size={28} style={{ margin: "0 auto 12px", display: "block", opacity: 0.4 }} />
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.7 }}>
                      Waiting for events...
                    </div>
                  </div>
                ) : events.map(ev => (
                  <motion.div key={ev.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{
                      padding: "12px", borderRadius: 8, marginBottom: 8,
                      background: ev.urgency === "critical" ? "rgba(232,85,78,0.07)" : "var(--surface-2)",
                      border: `1px solid ${ev.urgency === "critical" ? "rgba(232,85,78,0.3)" : "var(--border)"}`,
                      borderLeft: `3px solid ${ev.urgency === "critical" ? "var(--crimson-light)" : ev.urgency === "urgent" ? "var(--warning)" : "transparent"}`,
                    }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{ev.event}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <AlertBanner />
            </div>
          </motion.div>
        </div>

        {/* ── Hb Forecast ── */}
        <motion.div className="card anim-fade-up anim-d4">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div className="section-label">AI Prediction</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>
                Hemoglobin Drop Forecast — Arjun
              </div>
            </div>
            <span className="badge badge-info">BiLSTM · ±2.8d MAE</span>
          </div>
          <HbForecastChart patientId="demo-patient-001" />
        </motion.div>

      </div>
    </div>
  );
}
