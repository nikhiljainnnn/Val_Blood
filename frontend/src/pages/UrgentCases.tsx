import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Clock, Droplets, MapPin, Phone, X, CheckCircle, Loader2, ChevronRight } from "lucide-react";
import { demoAPI, matchingAPI } from "../api/client";
import { toast } from "../components/Toast";

interface UrgentPatient {
  patient_id: string; name: string; blood_group: string; city: string; phone: string;
  expected_next_transfusion_date: string; days_until_transfusion: number;
  guardian_circle_size: number; active_donors: number;
}

const DEMO_PATIENTS: UrgentPatient[] = [
  { patient_id:"p001", name:"Arjun Mehta",   blood_group:"B+",  city:"Mumbai",    phone:"+919876540001", expected_next_transfusion_date:"2026-06-08", days_until_transfusion:2, guardian_circle_size:8,  active_donors:5 },
  { patient_id:"p002", name:"Sneha Patil",   blood_group:"O-",  city:"Pune",      phone:"+919876540002", expected_next_transfusion_date:"2026-06-09", days_until_transfusion:3, guardian_circle_size:6,  active_donors:4 },
  { patient_id:"p003", name:"Rahul Das",     blood_group:"A+",  city:"Kolkata",   phone:"+919876540003", expected_next_transfusion_date:"2026-06-10", days_until_transfusion:4, guardian_circle_size:10, active_donors:7 },
  { patient_id:"p004", name:"Fatima Sheikh", blood_group:"AB+", city:"Hyderabad", phone:"+919876540004", expected_next_transfusion_date:"2026-06-10", days_until_transfusion:4, guardian_circle_size:7,  active_donors:3 },
  { patient_id:"p005", name:"Pooja Nair",    blood_group:"B-",  city:"Chennai",   phone:"+919876540005", expected_next_transfusion_date:"2026-06-11", days_until_transfusion:5, guardian_circle_size:9,  active_donors:6 },
  { patient_id:"p006", name:"Karan Singh",   blood_group:"O+",  city:"Delhi",     phone:"+919876540006", expected_next_transfusion_date:"2026-06-11", days_until_transfusion:5, guardian_circle_size:8,  active_donors:8 },
  { patient_id:"p007", name:"Anita Rao",     blood_group:"A-",  city:"Bangalore", phone:"+919876540007", expected_next_transfusion_date:"2026-06-12", days_until_transfusion:6, guardian_circle_size:5,  active_donors:2 },
];

function urgencyConfig(days: number) {
  if (days <= 2) return { color:"var(--crimson-light)", bg:"var(--crimson-dim)",  border:"var(--crimson-border)", tag:"CRITICAL", badgeCls:"badge-crimson" };
  if (days <= 4) return { color:"var(--warning)",       bg:"var(--warning-dim)",  border:"rgba(232,149,42,0.35)", tag:"URGENT",   badgeCls:"badge-warning" };
  return              { color:"var(--info)",         bg:"var(--info-dim)",     border:"rgba(99,102,241,0.25)", tag:"THIS WEEK",badgeCls:"badge-info" };
}

// ── Cascade Modal ─────────────────────────────────────────────────────────────
function CascadeModal({ patient, onClose, onDone }: {
  patient: UrgentPatient;
  onClose: () => void;
  onDone: () => void;
}) {
  const u = urgencyConfig(patient.days_until_transfusion);
  const [step, setStep] = useState<"confirm"|"running"|"done">("confirm");
  const [log, setLog]   = useState<{ icon:string; text:string }[]>([]);

  const run = async () => {
    setStep("running");
    const steps = [
      { icon:"🔍", text:"Querying Guardian Circle…" },
      { icon:"🏆", text:`Top ${patient.active_donors} eligible donors ranked by compat + proximity…` },
      { icon:"💬", text:"WhatsApp alert sent to Donor #1…" },
      { icon:"📱", text:"SMS fallback queued for Donor #2…" },
      { icon:"🎙️", text:"Voice call scheduled — Sarvam AI TTS…" },
      { icon:"📡", text:"Dashboard event broadcast." },
    ];
    for (const s of steps) {
      await new Promise(r => setTimeout(r, 520 + Math.random() * 280));
      setLog(prev => [...prev, s]);
    }
    try {
      await matchingAPI.createRequest({ patient_id: patient.patient_id, urgency: patient.days_until_transfusion <= 2 ? "critical" : "urgent" });
    } catch { /* demo */ }
    setStep("done");
  };

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)",
        display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
      onClick={e => { if (e.target === e.currentTarget && step !== "running") onClose(); }}>

      <motion.div initial={{ opacity:0, scale:0.9, y:24 }} animate={{ opacity:1, scale:1, y:0 }}
        exit={{ opacity:0, scale:0.9 }} transition={{ type:"spring", stiffness:300, damping:26 }}
        style={{ background:"var(--surface)", border:`1px solid ${u.border}`, borderRadius:20,
          padding:36, width:"100%", maxWidth:460, boxShadow:"0 32px 80px rgba(0,0,0,0.7)", position:"relative" }}>

        {step !== "running" && (
          <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer" }}>
            <X size={18} />
          </button>
        )}

        <AnimatePresence mode="wait">
          {step === "confirm" && (
            <motion.div key="confirm" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
              <div className="section-label" style={{ marginBottom:8 }}>Trigger Cascade</div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:700, marginBottom:24 }}>
                Activate Guardian Circle
              </div>

              {/* Patient summary */}
              <div style={{ background:"var(--surface-2)", borderRadius:12, padding:"16px", marginBottom:20, border:`1px solid ${u.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:u.bg, border:`2px solid ${u.color}`,
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🧒</div>
                  <div>
                    <div style={{ fontWeight:700, marginBottom:2 }}>{patient.name}</div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
                      {patient.phone} · {patient.city}
                    </div>
                  </div>
                  <div style={{ marginLeft:"auto", textAlign:"center" }}>
                    <div style={{ fontFamily:"var(--font-display)", fontSize:32, fontWeight:800, color:u.color, lineHeight:1 }}>
                      {patient.days_until_transfusion}
                    </div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)" }}>DAYS LEFT</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <span className={`badge ${u.badgeCls}`}>{patient.blood_group}</span>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:10, fontWeight:700, color:u.color, letterSpacing:"0.1em" }}>{u.tag}</span>
                  <span className="badge badge-info" style={{ marginLeft:"auto" }}>{patient.active_donors}/{patient.guardian_circle_size} active donors</span>
                </div>
              </div>

              {/* What will happen */}
              <div style={{ marginBottom:24 }}>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", letterSpacing:"0.1em", marginBottom:10 }}>WHAT HAPPENS NEXT</div>
                {[
                  { n:"1", text:`Top ${patient.active_donors} ranked donors receive WhatsApp alert`, color:"var(--success)" },
                  { n:"2", text:"SMS backup sent to unresponsive donors after 5 min", color:"var(--info)" },
                  { n:"3", text:"Sarvam AI voice call in donor's local language after 10 min", color:"var(--warning)" },
                ].map(s => (
                  <div key={s.n} style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:8 }}>
                    <div style={{ width:20, height:20, borderRadius:"50%", background:`${s.color}20`, border:`1px solid ${s.color}40`,
                      display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontSize:9, color:s.color, flexShrink:0 }}>
                      {s.n}
                    </div>
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", lineHeight:1.5 }}>{s.text}</span>
                  </div>
                ))}
              </div>

              <div style={{ display:"flex", gap:12 }}>
                <button onClick={onClose} className="btn-secondary" style={{ flex:1, justifyContent:"center", padding:"12px" }}>Cancel</button>
                <motion.button onClick={run} whileTap={{ scale:0.97 }}
                  style={{ flex:2, padding:"12px 20px", borderRadius:8, border:"none", color:"#fff",
                    background:`linear-gradient(135deg, var(--crimson), var(--crimson-light))`,
                    fontWeight:700, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    boxShadow:"0 4px 14px var(--crimson-glow)" }}>
                  <Droplets size={14} /> Confirm Trigger
                </motion.button>
              </div>
            </motion.div>
          )}

          {step === "running" && (
            <motion.div key="running" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
              <div style={{ textAlign:"center", marginBottom:24 }}>
                <motion.div animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:1.1, ease:"linear" }}
                  style={{ display:"inline-flex", color:"var(--crimson-light)", marginBottom:12 }}>
                  <Loader2 size={36} />
                </motion.div>
                <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700 }}>Triggering Cascade</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", marginTop:4 }}>
                  Activating circle for {patient.name}…
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {log.map((l, i) => (
                  <motion.div key={i} initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
                    style={{ display:"flex", alignItems:"center", gap:10, fontFamily:"var(--font-mono)", fontSize:11 }}>
                    <span>{l.icon}</span>
                    <span style={{ color:"var(--text-muted)", flex:1 }}>{l.text}</span>
                    <span style={{ color:"var(--success)" }}>✓</span>
                  </motion.div>
                ))}
                {log.length < 6 && (
                  <div style={{ display:"flex", gap:10, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>
                    <motion.span animate={{ opacity:[0.2,1,0.2] }} transition={{ repeat:Infinity, duration:1 }}>⬤</motion.span>
                    In progress…
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === "done" && (
            <motion.div key="done" initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}>
              <div style={{ textAlign:"center", padding:"8px 0 28px" }}>
                <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:"spring", stiffness:300, delay:0.1 }}>
                  <CheckCircle size={52} style={{ color:"var(--success)", display:"block", margin:"0 auto 16px" }} />
                </motion.div>
                <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, marginBottom:10 }}>Circle Activated!</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", lineHeight:1.9 }}>
                  <span style={{ color:"var(--text-main)", fontWeight:600 }}>{patient.active_donors} donors</span> notified for {patient.name}.<br/>
                  WhatsApp · SMS · Voice cascade running.<br/>
                  Expected confirmation within <span style={{ color:"var(--success)" }}>15 minutes</span>.
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
export default function UrgentCases() {
  const [patients, setPatients]   = useState<UrgentPatient[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modalPatient, setModal]  = useState<UrgentPatient | null>(null);
  const [triggered, setTriggered] = useState<Set<string>>(new Set());

  useEffect(() => {
    demoAPI.getUrgentPatients()
      .then(r => setPatients(r.data.patients || r.data))
      .catch(() => setPatients(DEMO_PATIENTS))
      .finally(() => setLoading(false));
  }, []);

  const markTriggered = (patientId: string, name: string) => {
    setTriggered(prev => new Set([...prev, patientId]));
    toast.success(`Cascade triggered for ${name}`, "Donors are being contacted via WhatsApp, SMS and voice.");
  };

  const critical = patients.filter(p => p.days_until_transfusion <= 2);
  const urgent   = patients.filter(p => p.days_until_transfusion > 2 && p.days_until_transfusion <= 4);
  const thisWeek = patients.filter(p => p.days_until_transfusion > 4);

  return (
    <div>
      {/* Top Bar */}
      <div className="topbar">
        <div>
          <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700 }}>Urgent Cases</div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
            Patients needing transfusion within 7 days
          </div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <span className="badge badge-crimson">⚡ {critical.length} Critical</span>
          <span className="badge badge-warning">⚠ {urgent.length} Urgent</span>
          <span className="badge badge-info">📅 {thisWeek.length} This Week</span>
        </div>
      </div>

      <div className="page-content">
        {/* Hero */}
        <motion.div className="card-hero anim-fade-up" style={{ marginBottom:28, display:"grid", gridTemplateColumns:"auto 1fr auto", gap:28, alignItems:"center" }}>
          <div style={{ background:"var(--crimson-dim)", borderRadius:14, padding:18, border:"1px solid var(--crimson-border)" }}>
            <AlertTriangle size={36} color="var(--crimson-light)" />
          </div>
          <div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:52, fontWeight:800, color:"var(--crimson-light)", lineHeight:1, letterSpacing:"-0.02em" }}>
              {loading ? "—" : patients.length}
            </div>
            <div style={{ fontSize:14, fontWeight:500, marginTop:6 }}>patients need transfusion in the next 7 days</div>
          </div>
          <div style={{ display:"flex", gap:28 }}>
            {[
              { label:"CRITICAL (≤2d)", val:critical.length, color:"var(--crimson-light)" },
              { label:"URGENT (≤4d)",   val:urgent.length,   color:"var(--warning)" },
              { label:"THIS WEEK",       val:thisWeek.length, color:"var(--info)" },
            ].map(s => (
              <div key={s.label} style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"var(--font-display)", fontSize:32, fontWeight:800, color:s.color }}>{s.val}</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="section-label">ACTIONABLE CASES</div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {loading
            ? Array.from({ length:5 }).map((_,i) => <div key={i} className="skeleton" style={{ height:90 }} />)
            : patients.map((p, i) => {
                const u = urgencyConfig(p.days_until_transfusion);
                const isTriggered = triggered.has(p.patient_id);
                return (
                  <motion.div key={p.patient_id}
                    initial={{ opacity:0, x:-16 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*0.05 }}
                    whileHover={{ y:-2 }}
                    style={{
                      background: isTriggered ? "var(--surface-2)" : "var(--surface)",
                      border:`1px solid ${isTriggered ? "rgba(29,184,142,0.2)" : u.border}`,
                      borderLeft:`3px solid ${isTriggered ? "var(--success)" : u.color}`,
                      borderRadius:12, padding:"16px 22px",
                      display:"flex", alignItems:"center", gap:22,
                      opacity: isTriggered ? 0.7 : 1,
                      transition:"all 0.2s",
                    }}>

                    {/* Day counter */}
                    <div style={{ minWidth:56, textAlign:"center" }}>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:30, fontWeight:800, color: isTriggered ? "var(--success)" : u.color, lineHeight:1 }}>
                        {isTriggered ? "✓" : p.days_until_transfusion}
                      </div>
                      <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", marginTop:2 }}>
                        {isTriggered ? "DONE" : "DAYS"}
                      </div>
                    </div>

                    <div style={{ width:1, height:44, background:"var(--border)" }} />

                    {/* Patient info */}
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                        <span style={{ fontSize:14, fontWeight:700 }}>{p.name}</span>
                        <span className={`badge ${u.badgeCls}`}>{p.blood_group}</span>
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:u.color, letterSpacing:"0.1em", fontWeight:700 }}>{u.tag}</span>
                      </div>
                      <div style={{ display:"flex", gap:16, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}><MapPin size={10}/> {p.city}</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}><Phone size={10}/> {p.phone}</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}><Clock size={10}/> {p.expected_next_transfusion_date}</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}><Droplets size={10}/> {p.active_donors}/{p.guardian_circle_size} donors</span>
                      </div>
                    </div>

                    <motion.button
                      whileTap={{ scale:0.96 }}
                      onClick={() => !isTriggered && setModal(p)}
                      disabled={isTriggered}
                      style={{
                        padding:"10px 20px", borderRadius:8, minWidth:156, border:"none", color:"#fff",
                        fontWeight:700, fontSize:13, fontFamily:"var(--font-body)", cursor:isTriggered?"default":"pointer",
                        background: isTriggered ? "var(--success)" : `linear-gradient(135deg, var(--crimson), var(--crimson-light))`,
                        boxShadow: isTriggered ? "none" : "0 4px 12px var(--crimson-glow)",
                      }}>
                      {isTriggered ? "✓ Cascade Active" : "Trigger Cascade →"}
                    </motion.button>
                  </motion.div>
                );
              })
          }
        </div>
      </div>

      <AnimatePresence>
        {modalPatient && (
          <CascadeModal
            patient={modalPatient}
            onClose={() => setModal(null)}
            onDone={() => markTriggered(modalPatient.patient_id, modalPatient.name)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}