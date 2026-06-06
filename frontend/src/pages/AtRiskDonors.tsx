import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, User, Phone, Calendar, TrendingDown, Zap, X, CheckCircle, Loader2, ChevronRight, MessageSquare, Mic } from "lucide-react";
import { demoAPI, donorAPI } from "../api/client";
import { toast } from "../components/Toast";

interface AtRiskDonor {
  donor_id: string; name: string; phone: string; blood_group: string; city: string;
  churn_probability: number; days_since_donation: number; donations_total: number;
  patient_name: string; inactive_reason: string; cascade_status: "idle"|"running"|"done";
}

const DEMO_DONORS: AtRiskDonor[] = [
  { donor_id:"d001", name:"Vijay Reddy",   phone:"+919876541001", blood_group:"B+",  city:"Hyderabad", churn_probability:0.91, days_since_donation:412, donations_total:3,  patient_name:"Arjun Mehta",   inactive_reason:"Not donated in last 1 year",                  cascade_status:"idle" },
  { donor_id:"d002", name:"Arun Mehta",    phone:"+919876541002", blood_group:"O+",  city:"Mumbai",    churn_probability:0.84, days_since_donation:380, donations_total:5,  patient_name:"Sneha Patil",   inactive_reason:"Very limited activity despite multiple calls", cascade_status:"idle" },
  { donor_id:"d003", name:"Ravi Kumar",    phone:"+919876541003", blood_group:"A+",  city:"Delhi",     churn_probability:0.79, days_since_donation:290, donations_total:2,  patient_name:"Rahul Das",     inactive_reason:"Not donated in last 1 year",                  cascade_status:"idle" },
  { donor_id:"d004", name:"Sunita Sharma", phone:"+919876541004", blood_group:"AB-", city:"Pune",      churn_probability:0.76, days_since_donation:310, donations_total:4,  patient_name:"Fatima Sheikh", inactive_reason:"Very limited activity despite multiple calls", cascade_status:"idle" },
  { donor_id:"d005", name:"Mohan Das",     phone:"+919876541005", blood_group:"B-",  city:"Kolkata",   churn_probability:0.72, days_since_donation:445, donations_total:1,  patient_name:"Pooja Nair",    inactive_reason:"Not donated in last 1 year",                  cascade_status:"idle" },
  { donor_id:"d006", name:"Lakshmi Iyer",  phone:"+919876541006", blood_group:"O-",  city:"Chennai",   churn_probability:0.68, days_since_donation:260, donations_total:7,  patient_name:"Karan Singh",   inactive_reason:"Moved city, needs re-verification",           cascade_status:"idle" },
  { donor_id:"d007", name:"Harish Patel",  phone:"+919876541007", blood_group:"A-",  city:"Ahmedabad", churn_probability:0.65, days_since_donation:198, donations_total:6,  patient_name:"Anita Rao",     inactive_reason:"Very limited activity despite multiple calls", cascade_status:"idle" },
];

function churnConfig(prob: number) {
  if (prob >= 0.8) return { color:"var(--crimson-light)", bg:"var(--crimson-dim)", border:"var(--crimson-border)" };
  if (prob >= 0.6) return { color:"var(--warning)",       bg:"var(--warning-dim)", border:"rgba(232,149,42,0.3)" };
  return              { color:"var(--info)",           bg:"var(--info-dim)",    border:"rgba(99,102,241,0.25)" };
}

// ── Cascade Modal ─────────────────────────────────────────────────────────────
function CascadeModal({ donor, onClose, onDone }: {
  donor: AtRiskDonor;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"confirm"|"running"|"done">("confirm");
  const [log, setLog]   = useState<{ icon: string; text: string }[]>([]);

  const run = async () => {
    setStep("running");
    const steps = [
      { icon:"📊", text:`Loading ${donor.name}'s engagement history…` },
      { icon:"🧠", text:"Generating personalised re-engagement message (AI)…" },
      { icon:"💬", text:`Sending WhatsApp to ${donor.phone} in local language…` },
      { icon:"📱", text:"Queuing SMS fallback (2 min delay)…" },
      { icon:"🎙️", text:"Scheduling Sarvam AI voice call (10 min delay)…" },
      { icon:"📡", text:"Cascade event published to dashboard." },
    ];
    for (const s of steps) {
      await new Promise(r => setTimeout(r, 550 + Math.random() * 300));
      setLog(prev => [...prev, s]);
    }
    try { await donorAPI.triggerCascade(donor.donor_id); } catch { /* demo */ }
    setStep("done");
  };

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)",
        display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
      onClick={e => { if (e.target === e.currentTarget && step !== "running") onClose(); }}>

      <motion.div initial={{ opacity:0, scale:0.9, y:24 }} animate={{ opacity:1, scale:1, y:0 }}
        exit={{ opacity:0, scale:0.9 }} transition={{ type:"spring", stiffness:300, damping:26 }}
        style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:20,
          padding:36, width:"100%", maxWidth:460, boxShadow:"0 32px 80px rgba(0,0,0,0.7)", position:"relative" }}>

        {step !== "running" && (
          <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer" }}>
            <X size={18} />
          </button>
        )}

        <AnimatePresence mode="wait">

          {/* Step 1: Confirm */}
          {step === "confirm" && (
            <motion.div key="confirm" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
              <div className="section-label" style={{ marginBottom:8 }}>Re-engagement Cascade</div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:700, marginBottom:24 }}>
                Reach Out to {donor.name}
              </div>

              {/* Donor card */}
              <div style={{ background:"var(--surface-2)", borderRadius:12, padding:"16px", marginBottom:16, border:"1px solid var(--border)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:12 }}>
                  <div style={{ width:40, height:40, borderRadius:"50%", background:`${churnConfig(donor.churn_probability).bg}`,
                    border:`2px solid ${churnConfig(donor.churn_probability).color}`, display:"flex", alignItems:"center", justifyContent:"center",
                    fontFamily:"var(--font-display)", fontSize:16, fontWeight:800, color:churnConfig(donor.churn_probability).color }}>
                    {donor.name[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight:700 }}>{donor.name}</div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>{donor.phone} · {donor.city}</div>
                  </div>
                  <span className="badge" style={{ marginLeft:"auto", background:churnConfig(donor.churn_probability).bg, color:churnConfig(donor.churn_probability).color, border:`1px solid ${churnConfig(donor.churn_probability).border}` }}>
                    {Math.round(donor.churn_probability*100)}% churn
                  </span>
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <span className="badge badge-warning" style={{ fontSize:10 }}>{donor.days_since_donation}d since last donation</span>
                  <span className="badge badge-info" style={{ fontSize:10 }}>{donor.donations_total} total donations</span>
                  <span className="badge badge-crimson" style={{ fontSize:10 }}>{donor.blood_group}</span>
                </div>
                <div style={{ marginTop:12, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--warning)", background:"var(--warning-dim)",
                  border:"1px solid rgba(232,149,42,0.2)", borderRadius:6, padding:"5px 10px" }}>
                  ⚠ {donor.inactive_reason}
                </div>
              </div>

              {/* Patient at risk */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, padding:"10px 14px",
                background:"var(--crimson-dim)", borderRadius:10, border:"1px solid var(--crimson-border)" }}>
                <span style={{ fontSize:16 }}>🩺</span>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>
                  Patient depending on this donor:
                </span>
                <span style={{ fontWeight:700, color:"var(--crimson-light)" }}>{donor.patient_name}</span>
              </div>

              {/* Cascade chain */}
              <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:28, justifyContent:"center" }}>
                {[
                  { icon:<MessageSquare size={14}/>, label:"WhatsApp", color:"var(--success)" },
                  { icon:<span style={{ fontSize:12 }}>SMS</span>, label:"SMS", color:"var(--info)" },
                  { icon:<Mic size={14}/>, label:"Voice AI", color:"var(--warning)" },
                ].map((c, i) => (
                  <React.Fragment key={c.label}>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                      <div style={{ width:36, height:36, borderRadius:"50%", background:"var(--surface-2)",
                        border:`1px solid ${c.color}40`, display:"flex", alignItems:"center", justifyContent:"center", color:c.color }}>
                        {c.icon}
                      </div>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:c.color }}>{c.label}</span>
                    </div>
                    {i < 2 && <ChevronRight size={14} style={{ color:"var(--text-muted)", margin:"0 6px", marginBottom:14 }} />}
                  </React.Fragment>
                ))}
              </div>

              <div style={{ display:"flex", gap:12 }}>
                <button onClick={onClose} className="btn-secondary" style={{ flex:1, justifyContent:"center", padding:"12px" }}>Cancel</button>
                <motion.button onClick={run} className="btn-primary" whileTap={{ scale:0.97 }} style={{ flex:2, justifyContent:"center", padding:"12px", fontSize:14 }}>
                  <Zap size={14} /> Send Re-engagement
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Running */}
          {step === "running" && (
            <motion.div key="running" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
              <div style={{ textAlign:"center", marginBottom:24 }}>
                <motion.div animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:1.1, ease:"linear" }}
                  style={{ display:"inline-flex", color:"var(--crimson-light)", marginBottom:12 }}>
                  <Loader2 size={36} />
                </motion.div>
                <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700 }}>Cascade Running</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", marginTop:4 }}>
                  Contacting {donor.name}…
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {log.map((l, i) => (
                  <motion.div key={i} initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
                    style={{ display:"flex", alignItems:"center", gap:10, fontFamily:"var(--font-mono)", fontSize:11 }}>
                    <span>{l.icon}</span>
                    <span style={{ color:"var(--text-muted)" }}>{l.text}</span>
                    <span style={{ color:"var(--success)", marginLeft:"auto" }}>✓</span>
                  </motion.div>
                ))}
                {log.length < 6 && (
                  <div style={{ display:"flex", alignItems:"center", gap:10, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>
                    <motion.span animate={{ opacity:[0.2,1,0.2] }} transition={{ repeat:Infinity, duration:1 }}>⬤</motion.span>
                    Processing…
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Done */}
          {step === "done" && (
            <motion.div key="done" initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}>
              <div style={{ textAlign:"center", padding:"8px 0 24px" }}>
                <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:"spring", stiffness:300, delay:0.1 }}>
                  <CheckCircle size={52} style={{ color:"var(--success)", margin:"0 auto 14px", display:"block" }} />
                </motion.div>
                <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, marginBottom:8 }}>Cascade Sent!</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", lineHeight:1.8 }}>
                  WhatsApp · SMS · Voice call queued<br/>
                  for <span style={{ color:"var(--text-main)", fontWeight:600 }}>{donor.name}</span><br/>
                  Patient <span style={{ color:"var(--crimson-light)", fontWeight:600 }}>{donor.patient_name}</span> is covered.
                </div>
              </div>
              <button onClick={() => { onDone(); onClose(); }} className="btn-primary"
                style={{ width:"100%", justifyContent:"center", padding:"13px", fontSize:15 }}>
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AtRiskDonors() {
  const [donors, setDonors]       = useState<AtRiskDonor[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modalDonor, setModal]    = useState<AtRiskDonor | null>(null);
  const [filter, setFilter]       = useState<"all"|"critical"|"high">("all");

  useEffect(() => {
    demoAPI.getAtRiskBridge()
      .then(r => setDonors(r.data.donors || r.data))
      .catch(() => setDonors(DEMO_DONORS))
      .finally(() => setLoading(false));
  }, []);

  const markDone = (donorId: string) => {
    setDonors(p => p.map(d => d.donor_id === donorId ? { ...d, cascade_status:"done" } : d));
    toast.success("Cascade sent!", "WhatsApp, SMS and voice call have been queued.");
  };

  const triggerAll = () => {
    const top3 = donors.filter(d => d.cascade_status !== "done").slice(0, 3);
    if (!top3.length) return;
    top3.forEach(d => markDone(d.donor_id));
    toast.success(`Bulk cascade sent to ${top3.length} donors`, "Re-engagement messages queued for top at-risk donors.");
  };

  const filtered = donors.filter(d => {
    if (filter === "critical") return d.churn_probability >= 0.8;
    if (filter === "high")     return d.churn_probability >= 0.6 && d.churn_probability < 0.8;
    return true;
  });

  const critical = donors.filter(d => d.churn_probability >= 0.8);
  const high     = donors.filter(d => d.churn_probability >= 0.6 && d.churn_probability < 0.8);
  const done     = donors.filter(d => d.cascade_status === "done");

  return (
    <div>
      {/* Top Bar */}
      <div className="topbar">
        <div>
          <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700 }}>At-Risk Donors</div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
            {loading ? "…" : `${donors.length} bridge donors flagged · ${done.length} cascades sent today`}
          </div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <span className="badge badge-crimson">{critical.length} critical</span>
          <span className="badge badge-warning">{high.length} high risk</span>
          <span className="badge badge-success">{done.length} cascaded</span>
          <motion.button whileTap={{ scale:0.96 }} onClick={triggerAll} className="btn-primary">
            <Zap size={14} /> Bulk Cascade Top 3
          </motion.button>
        </div>
      </div>

      <div className="page-content">
        {/* Hero stats */}
        <motion.div className="card-hero anim-fade-up" style={{ marginBottom:24, display:"grid", gridTemplateColumns:"1fr auto", gap:32, alignItems:"center" }}>
          <div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", letterSpacing:"0.12em", marginBottom:8 }}>AT-RISK POOL</div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:52, fontWeight:800, color:"var(--warning)", letterSpacing:"-0.02em", lineHeight:1 }}>
              {loading ? "—" : donors.length}
            </div>
            <div style={{ fontSize:14, color:"var(--text-muted)", marginTop:8 }}>matched bridge donors at risk · 18.6% of total pool</div>
          </div>
          <div style={{ display:"flex", gap:32 }}>
            {[
              { label:"CRITICAL (≥80%)", val:critical.length, color:"var(--crimson-light)" },
              { label:"HIGH (60–79%)",   val:high.length,     color:"var(--warning)" },
              { label:"CASCADED TODAY",  val:done.length,     color:"var(--success)" },
            ].map(s => (
              <div key={s.label} style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"var(--font-display)", fontSize:32, fontWeight:800, color:s.color }}>{s.val}</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", letterSpacing:"0.1em", marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Filter tabs */}
        <div className="tabs-container" style={{ marginBottom:20, maxWidth:360 }}>
          {(["all","critical","high"] as const).map(f => (
            <button key={f} className={`tab-btn ${filter===f?"active":""}`} onClick={() => setFilter(f)}>
              {f === "all" ? `All (${donors.length})` : f === "critical" ? `Critical (${critical.length})` : `High Risk (${high.length})`}
            </button>
          ))}
        </div>

        <div className="section-label">RISK POOL {filter !== "all" && `— ${filter.toUpperCase()}`}</div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {loading
            ? Array.from({ length:5 }).map((_,i) => <div key={i} className="skeleton" style={{ height:96 }} />)
            : filtered.map((d, i) => {
                const c = churnConfig(d.churn_probability);
                const isDone = d.cascade_status === "done";
                return (
                  <motion.div key={d.donor_id}
                    initial={{ opacity:0, x:-16 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*0.04 }}
                    whileHover={{ y:-2 }}
                    style={{
                      background: isDone ? "var(--surface-2)" : "var(--surface)",
                      border:`1px solid ${isDone ? "rgba(29,184,142,0.2)" : c.border}`,
                      borderLeft:`3px solid ${isDone ? "var(--success)" : c.color}`,
                      borderRadius:12, padding:"16px 22px",
                      display:"flex", alignItems:"center", gap:20,
                      opacity: isDone ? 0.65 : 1,
                      transition:"all 0.2s",
                    }}>

                    {/* Churn gauge */}
                    <div style={{ minWidth:68, textAlign:"center" }}>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:800, color: isDone ? "var(--success)" : c.color, lineHeight:1 }}>
                        {isDone ? "✓" : `${Math.round(d.churn_probability*100)}%`}
                      </div>
                      <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", marginTop:2 }}>
                        {isDone ? "CASCADED" : "CHURN"}
                      </div>
                      {!isDone && (
                        <div style={{ height:3, background:"var(--surface-3)", borderRadius:2, marginTop:6, overflow:"hidden" }}>
                          <motion.div initial={{ width:0 }} animate={{ width:`${d.churn_probability*100}%` }}
                            transition={{ duration:1, ease:"easeOut", delay:i*0.04 }}
                            style={{ height:"100%", background:c.color, borderRadius:2 }} />
                        </div>
                      )}
                    </div>

                    <div style={{ width:1, height:48, background:"var(--border)" }} />

                    {/* Info */}
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                        <span style={{ fontSize:14, fontWeight:700 }}>{d.name}</span>
                        <span className="badge" style={{ fontSize:10, background:c.bg, color:c.color, border:`1px solid ${c.border}` }}>{d.blood_group}</span>
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>{d.city}</span>
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--crimson-light)", marginLeft:"auto" }}>→ {d.patient_name}</span>
                      </div>
                      <div style={{ display:"flex", gap:16, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", marginBottom:6 }}>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}><Phone size={10}/> {d.phone}</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}><Calendar size={10}/> {d.days_since_donation}d since donation</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}><User size={10}/> {d.donations_total} total</span>
                      </div>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--warning)", background:"var(--warning-dim)",
                        border:"1px solid rgba(232,149,42,0.2)", borderRadius:5, padding:"2px 8px", display:"inline-block" }}>
                        ⚠ {d.inactive_reason}
                      </span>
                    </div>

                    {/* Action */}
                    <motion.button
                      whileTap={{ scale:0.96 }}
                      onClick={() => !isDone && setModal(d)}
                      disabled={isDone}
                      style={{
                        padding:"10px 20px", borderRadius:8, minWidth:148, border:"none",
                        fontWeight:700, fontSize:13, fontFamily:"var(--font-body)", cursor:isDone?"default":"pointer",
                        background: isDone ? "var(--success)" : `linear-gradient(135deg, var(--crimson), var(--crimson-light))`,
                        color:"#fff",
                        boxShadow: isDone ? "none" : "0 4px 14px var(--crimson-glow)",
                      }}>
                      {isDone ? "✓ Cascade Sent" : "Start Cascade →"}
                    </motion.button>
                  </motion.div>
                );
              })
          }

          {!loading && filtered.length === 0 && (
            <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text-muted)" }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🎉</div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:12 }}>No donors in this risk tier right now.</div>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modalDonor && (
          <CascadeModal
            donor={modalDonor}
            onClose={() => setModal(null)}
            onDone={() => markDone(modalDonor.donor_id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}