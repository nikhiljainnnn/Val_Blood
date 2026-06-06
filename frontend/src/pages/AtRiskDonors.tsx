import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, User, Phone, Calendar, TrendingDown, Zap } from "lucide-react";
import { demoAPI, donorAPI } from "../api/client";

interface AtRiskDonor {
  donor_id: string; name: string; phone: string; blood_group: string; city: string;
  churn_probability: number; days_since_donation: number; donations_total: number;
  patient_name: string; inactive_reason: string; cascade_status: "idle"|"running"|"done";
}

const DEMO_DONORS: AtRiskDonor[] = [
  { donor_id:"d001", name:"Vijay Reddy",   phone:"+919876541001", blood_group:"B+",  city:"Hyderabad", churn_probability:0.91, days_since_donation:412, donations_total:3, patient_name:"Arjun Mehta",   inactive_reason:"Not donated in last 1 year",                  cascade_status:"idle" },
  { donor_id:"d002", name:"Arun Mehta",    phone:"+919876541002", blood_group:"O+",  city:"Mumbai",    churn_probability:0.84, days_since_donation:380, donations_total:5, patient_name:"Sneha Patil",   inactive_reason:"Very limited activity despite multiple calls", cascade_status:"idle" },
  { donor_id:"d003", name:"Ravi Kumar",    phone:"+919876541003", blood_group:"A+",  city:"Delhi",     churn_probability:0.79, days_since_donation:290, donations_total:2, patient_name:"Rahul Das",     inactive_reason:"Not donated in last 1 year",                  cascade_status:"idle" },
  { donor_id:"d004", name:"Sunita Sharma", phone:"+919876541004", blood_group:"AB-", city:"Pune",      churn_probability:0.76, days_since_donation:310, donations_total:4, patient_name:"Fatima Sheikh", inactive_reason:"Very limited activity despite multiple calls", cascade_status:"idle" },
  { donor_id:"d005", name:"Mohan Das",     phone:"+919876541005", blood_group:"B-",  city:"Kolkata",   churn_probability:0.72, days_since_donation:445, donations_total:1, patient_name:"Pooja Nair",    inactive_reason:"Not donated in last 1 year",                  cascade_status:"idle" },
  { donor_id:"d006", name:"Lakshmi Iyer",  phone:"+919876541006", blood_group:"O-",  city:"Chennai",   churn_probability:0.68, days_since_donation:260, donations_total:7, patient_name:"Karan Singh",   inactive_reason:"Moved city, needs re-verification",           cascade_status:"idle" },
  { donor_id:"d007", name:"Harish Patel",  phone:"+919876541007", blood_group:"A-",  city:"Ahmedabad", churn_probability:0.65, days_since_donation:198, donations_total:6, patient_name:"Anita Rao",     inactive_reason:"Very limited activity despite multiple calls", cascade_status:"idle" },
];

function churnConfig(prob: number) {
  if (prob >= 0.8) return { color:"var(--crimson-light)", bg:"var(--crimson-dim)", border:"var(--crimson-border)" };
  if (prob >= 0.6) return { color:"var(--warning)",       bg:"var(--warning-dim)", border:"rgba(232,149,42,0.3)" };
  return              { color:"var(--info)",          bg:"var(--info-dim)",    border:"rgba(99,102,241,0.25)" };
}

export default function AtRiskDonors() {
  const [donors, setDonors]       = useState<AtRiskDonor[]>([]);
  const [loading, setLoading]     = useState(true);
  const [cascading, setCascading] = useState<Record<string,boolean>>({});

  useEffect(() => {
    demoAPI.getAtRiskBridge().then(r => setDonors(r.data.donors||r.data))
      .catch(() => setDonors(DEMO_DONORS)).finally(() => setLoading(false));
  }, []);

  const triggerCascade = async (donorId: string) => {
    setCascading(p => ({ ...p, [donorId]:true }));
    try { await donorAPI.triggerCascade(donorId); } catch {}
    finally {
      setTimeout(() => {
        setDonors(p => p.map(d => d.donor_id===donorId ? { ...d, cascade_status:"done" } : d));
        setCascading(p => ({ ...p, [donorId]:false }));
      }, 1500);
    }
  };

  const triggerAll = () => donors.slice(0,3).forEach(d => triggerCascade(d.donor_id));

  return (
    <div>
      {/* Top Bar */}
      <div className="topbar">
        <div>
          <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700 }}>At-Risk Donors</div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
            {loading ? "..." : donors.length} matched bridge donors at risk of churning
          </div>
        </div>
        <motion.button whileTap={{ scale:0.96 }} onClick={triggerAll} className="btn-primary" style={{ padding:"10px 20px" }}>
          <Zap size={14} /> Activate Top 3 Now
        </motion.button>
      </div>

      <div className="page-content">
        {/* Hero */}
        <motion.div className="card-hero anim-fade-up" style={{ marginBottom:28, display:"flex", alignItems:"center", gap:32 }}>
          <div style={{ background:"var(--warning-dim)", borderRadius:14, padding:18, border:"1px solid rgba(232,149,42,0.3)" }}>
            <TrendingDown size={36} color="var(--warning)" />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"var(--font-display)", fontSize:48, fontWeight:800, color:"var(--warning)", lineHeight:1, letterSpacing:"-0.02em" }}>
              {loading ? "—" : donors.length}
            </div>
            <div style={{ color:"var(--text-main)", fontSize:15, fontWeight:500, marginTop:6 }}>matched bridge donors at risk of dropping out</div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", marginTop:4 }}>
              18.6% of all bridge donors · each has an assigned patient depending on them
            </div>
          </div>
          <div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", textAlign:"center", marginBottom:8, letterSpacing:"0.05em" }}>
              triggers WhatsApp → SMS → Voice
            </div>
          </div>
        </motion.div>

        <div className="section-label">RISK POOL</div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {loading
            ? Array.from({ length:5 }).map((_,i) => <div key={i} className="skeleton" style={{ height:100 }} />)
            : donors.map((d, i) => {
                const c = churnConfig(d.churn_probability);
                const isRunning = cascading[d.donor_id];
                const isDone    = d.cascade_status === "done";
                return (
                  <motion.div key={d.donor_id}
                    initial={{ opacity:0,x:-16 }} animate={{ opacity:1,x:0 }} transition={{ delay:i*0.05 }}
                    whileHover={{ y:-2 }}
                    style={{
                      background:"var(--surface)", border:`1px solid ${c.border}`,
                      borderRadius:12, padding:"18px 22px",
                      display:"flex", alignItems:"center", gap:22,
                      borderLeft:`3px solid ${c.color}`,
                      transition:"all 0.2s",
                    }}>
                    <div style={{ minWidth:72, textAlign:"center" }}>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:28, fontWeight:800, color:c.color, lineHeight:1 }}>
                        {Math.round(d.churn_probability * 100)}%
                      </div>
                      <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", marginTop:3 }}>CHURN</div>
                      <div className="progress-track" style={{ marginTop:8, height:4 }}>
                        <div style={{ height:"100%", width:`${d.churn_probability*100}%`, background:c.color, borderRadius:2 }} />
                      </div>
                    </div>
                    <div style={{ width:1, height:52, background:"var(--border)" }} />
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                        <span style={{ fontSize:15, fontWeight:700 }}>{d.name}</span>
                        <span className="badge badge-crimson" style={{ background:c.bg, color:c.color }}>{d.blood_group}</span>
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>{d.city}</span>
                      </div>
                      <div style={{ display:"flex", gap:18, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", marginBottom:8 }}>
                        <span style={{ display:"flex", alignItems:"center", gap:5 }}><Phone size={11} /> {d.phone}</span>
                        <span style={{ display:"flex", alignItems:"center", gap:5 }}><Calendar size={11} /> {d.days_since_donation}d since donation</span>
                        <span style={{ display:"flex", alignItems:"center", gap:5 }}><User size={11} /> matched to {d.patient_name}</span>
                      </div>
                      <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--warning)", background:"var(--warning-dim)", border:"1px solid rgba(232,149,42,0.25)", borderRadius:5, padding:"3px 10px", display:"inline-block" }}>
                        ⚠ {d.inactive_reason}
                      </div>
                    </div>
                    <motion.button whileTap={{ scale:0.96 }} onClick={() => triggerCascade(d.donor_id)} disabled={isRunning||isDone}
                      className={isDone||isRunning ? "" : "btn-primary"}
                      style={{ padding:"10px 22px", borderRadius:8, minWidth:160, border:"none", color:"#fff", fontWeight:700, fontSize:13, fontFamily:"var(--font-body)", cursor:isRunning||isDone ? "default" : "pointer",
                        background: isDone ? "var(--success)" : isRunning ? "var(--surface-3)" : undefined }}>
                      {isDone ? "✓ Cascade Sent" : isRunning ? "Triggering..." : "Start Cascade →"}
                    </motion.button>
                  </motion.div>
                );
              })
          }
        </div>
      </div>
    </div>
  );
}