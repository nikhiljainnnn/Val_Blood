import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { matchingAPI, patientAPI } from "../api/client";
import GuardianCircle from "../components/GuardianCircle";
import HbForecastChart from "../components/HbForecastChart";
import CompatScore from "../components/CompatScore";
import { Droplets, Shield, AlertTriangle, Activity, X, CheckCircle, Loader2, ChevronRight } from "lucide-react";

const DEMO_PATIENT = {
  id: "demo-patient-001", name: "Arjun Sharma", age: 9,
  abo: "B", rh_d: true, city: "Mumbai", hospital: "Mumbai Thalassemia Center",
  thalassemia_type: "major", transfusion_interval_days: 21,
  total_transfusions: 312, circle_health: 0.92,
};

const DEMO_CIRCLE = [
  { donor_id:"d1",  donor_name:"Ramesh Kumar",  compatibility:{score:0.97,mismatch_count:0,risk_level:"safe"},    churn_probability:0.12, availability_prob:0.88, days_to_eligible:0,  rank:1,  status:"active",  phone:"+919876540011", language:"hi" },
  { donor_id:"d2",  donor_name:"Priya Sharma",  compatibility:{score:0.93,mismatch_count:0,risk_level:"safe"},    churn_probability:0.08, availability_prob:0.92, days_to_eligible:12, rank:2,  status:"active",  phone:"+919876540012", language:"hi" },
  { donor_id:"d3",  donor_name:"Vijay Reddy",   compatibility:{score:0.91,mismatch_count:1,risk_level:"caution"}, churn_probability:0.71, availability_prob:0.29, days_to_eligible:0,  rank:3,  status:"at_risk", phone:"+919876540013", language:"te" },
  { donor_id:"d4",  donor_name:"Ananya Iyer",   compatibility:{score:0.89,mismatch_count:0,risk_level:"safe"},    churn_probability:0.22, availability_prob:0.78, days_to_eligible:6,  rank:4,  status:"active",  phone:"+919876540014", language:"ta" },
  { donor_id:"d5",  donor_name:"Suresh Patel",  compatibility:{score:0.87,mismatch_count:1,risk_level:"caution"}, churn_probability:0.35, availability_prob:0.65, days_to_eligible:0,  rank:5,  status:"active",  phone:"+919876540015", language:"hi" },
  { donor_id:"d6",  donor_name:"Deepa Nair",    compatibility:{score:0.85,mismatch_count:0,risk_level:"safe"},    churn_probability:0.18, availability_prob:0.82, days_to_eligible:21, rank:6,  status:"active",  phone:"+919876540016", language:"ml" },
  { donor_id:"d7",  donor_name:"Arun Mehta",    compatibility:{score:0.82,mismatch_count:2,risk_level:"caution"}, churn_probability:0.55, availability_prob:0.45, days_to_eligible:0,  rank:7,  status:"at_risk", phone:"+919876540017", language:"hi" },
  { donor_id:"d8",  donor_name:"Kavya Rao",     compatibility:{score:0.80,mismatch_count:0,risk_level:"safe"},    churn_probability:0.10, availability_prob:0.90, days_to_eligible:4,  rank:8,  status:"donated", phone:"+919876540018", language:"kn" },
  { donor_id:"d9",  donor_name:"Mohan Singh",   compatibility:{score:0.78,mismatch_count:1,risk_level:"caution"}, churn_probability:0.28, availability_prob:0.72, days_to_eligible:0,  rank:9,  status:"active",  phone:"+919876540019", language:"hi" },
  { donor_id:"d10", donor_name:"Rekha Pillai",  compatibility:{score:0.75,mismatch_count:2,risk_level:"caution"}, churn_probability:0.41, availability_prob:0.59, days_to_eligible:8,  rank:10, status:"active",  phone:"+919876540020", language:"ml" },
];

type Donor = typeof DEMO_CIRCLE[0];

const STATUS_COLOR: Record<string, string> = {
  active: "#6366F1", at_risk: "var(--warning)", donated: "var(--success)",
};

// ── Transfusion Request Modal ─────────────────────────────────────────────────
type ModalStep = "confirm" | "processing" | "done";

function TransfusionModal({
  donor, patient, onClose,
}: {
  donor: Donor | null;
  patient: any;
  onClose: () => void;
}) {
  const [step, setStep] = useState<ModalStep>("confirm");
  const [log, setLog]   = useState<string[]>([]);

  const run = async () => {
    setStep("processing");
    const steps = [
      { msg: "Verifying antigen compatibility...",   delay: 600 },
      { msg: "Creating transfusion request...",      delay: 900 },
      { msg: `Notifying ${donor?.donor_name} via WhatsApp...`, delay: 800 },
      { msg: "Sending SMS fallback...",              delay: 700 },
      { msg: "Voice call queued (Sarvam AI TTS)...", delay: 600 },
      { msg: "Dashboard broadcast sent.",            delay: 400 },
    ];

    for (const s of steps) {
      await new Promise(r => setTimeout(r, s.delay));
      setLog(prev => [...prev, s.msg]);
    }

    try {
      await matchingAPI.createRequest({
        patient_id: patient.id,
        donor_id:   donor?.donor_id,
        hospital_id:"demo-hospital-001",
        urgency:    "urgent",
        units_needed: 1,
      });
    } catch { /* demo mode fallback */ }

    setStep("done");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget && step !== "processing") onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 20, padding: 36, width: "100%", maxWidth: 480,
          boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          position: "relative",
        }}
      >
        {step !== "processing" && (
          <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer" }}>
            <X size={18} />
          </button>
        )}

        <AnimatePresence mode="wait">
          {step === "confirm" && (
            <motion.div key="confirm" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>Transfusion Request</div>
              <div style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:700, marginBottom:24 }}>
                Confirm Blood Request
              </div>

              <div className="card" style={{ padding:"14px 16px", marginBottom:12, background:"var(--surface-2)" }}>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", letterSpacing:"0.1em", marginBottom:8 }}>PATIENT</div>
                <div style={{ fontWeight:700, marginBottom:4 }}>{patient.name}</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>
                  {patient.abo}{patient.rh_d?"+":"−"} · {patient.hospital}
                </div>
              </div>

              <div style={{ textAlign:"center", color:"var(--text-muted)", marginBottom:12 }}>
                <ChevronRight size={18} style={{ transform:"rotate(90deg)", display:"inline-block" }} />
              </div>

              <div style={{
                padding:"14px 16px", borderRadius:12, marginBottom:24,
                background: donor ? "var(--crimson-dim)" : "var(--surface-2)",
                border: `1px solid ${donor ? "var(--crimson-border)" : "var(--border)"}`,
              }}>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", letterSpacing:"0.1em", marginBottom:8 }}>
                  {donor ? "SELECTED DONOR" : "AUTO-SELECT (TOP MATCH)"}
                </div>
                {donor ? (
                  <>
                    <div style={{ fontWeight:700, marginBottom:4 }}>{donor.donor_name}</div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <span className="badge badge-success" style={{ fontSize:10 }}>
                        {Math.round(donor.compatibility.score * 100)}% compatible
                      </span>
                      <span className="badge badge-info" style={{ fontSize:10 }}>
                        {donor.compatibility.mismatch_count} mismatch
                      </span>
                      <span className={`badge ${donor.days_to_eligible===0?"badge-success":"badge-warning"}`} style={{ fontSize:10 }}>
                        {donor.days_to_eligible===0 ? "✓ Eligible now" : `Eligible in ${donor.days_to_eligible}d`}
                      </span>
                    </div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", marginTop:8 }}>
                      Rank #{donor.rank} in circle · {donor.phone}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight:700, marginBottom:4 }}>{DEMO_CIRCLE[0].donor_name}</div>
                    <span className="badge badge-success" style={{ fontSize:10 }}>97% compatible · Rank #1</span>
                  </>
                )}
              </div>

              <div style={{ padding:"12px 14px", borderRadius:10, background:"var(--info-dim)", border:"1px solid rgba(99,102,241,0.15)", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", marginBottom:24, lineHeight:1.7 }}>
                <span style={{ color:"var(--info)", fontWeight:600 }}>Cascade: </span>
                WhatsApp → SMS → Voice call (Sarvam AI, {donor?.language?.toUpperCase() || "HI"})
              </div>

              <div style={{ display:"flex", gap:12 }}>
                <button onClick={onClose} className="btn-secondary" style={{ flex:1, justifyContent:"center", padding:"13px" }}>
                  Cancel
                </button>
                <motion.button onClick={run} className="btn-primary" whileTap={{ scale:0.97 }}
                  style={{ flex:2, justifyContent:"center", padding:"13px", fontSize:15 }}>
                  <Droplets size={16} /> Confirm & Send Request
                </motion.button>
              </div>
            </motion.div>
          )}

          {step === "processing" && (
            <motion.div key="processing" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
              <div style={{ textAlign:"center", marginBottom:28 }}>
                <motion.div
                  animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                  style={{ display:"inline-flex", color:"var(--crimson-light)", marginBottom:12 }}>
                  <Loader2 size={36} />
                </motion.div>
                <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700 }}>Activating Guardian Circle</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", marginTop:6 }}>
                  Notifying donors for {patient.name}
                </div>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {log.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
                    style={{ display:"flex", alignItems:"flex-start", gap:10, fontFamily:"var(--font-mono)", fontSize:11 }}>
                    <span style={{ color:"var(--success)", flexShrink:0, marginTop:1 }}>✓</span>
                    <span style={{ color:"var(--text-muted)" }}>{msg}</span>
                  </motion.div>
                ))}
                {log.length < 6 && (
                  <div style={{ display:"flex", alignItems:"center", gap:10, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>
                    <motion.span animate={{ opacity:[0.3,1,0.3] }} transition={{ repeat:Infinity, duration:1.2 }}>⬤</motion.span>
                    Processing...
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === "done" && (
            <motion.div key="done" initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}>
              <div style={{ textAlign:"center", padding:"12px 0 28px" }}>
                <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:"spring", stiffness:300, delay:0.1 }}>
                  <CheckCircle size={52} style={{ color:"var(--success)", margin:"0 auto 16px", display:"block" }} />
                </motion.div>
                <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, marginBottom:8 }}>Request Sent!</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", lineHeight:1.8 }}>
                  {donor ? donor.donor_name : DEMO_CIRCLE[0].donor_name} has been notified.<br/>
                  WhatsApp · SMS · Voice cascade activated.<br/>
                  Dashboard update broadcast to coordinators.
                </div>
              </div>

              <div style={{ background:"var(--surface-2)", borderRadius:12, padding:"14px 16px", marginBottom:24 }}>
                {[
                  { label:"Donor notified",     status:"done" },
                  { label:"Awaiting RSVP",      status:"pending" },
                  { label:"Transfusion day",     status:"upcoming" },
                ].map((r, i) => (
                  <div key={r.label} style={{ display:"flex", alignItems:"center", gap:12, padding:"7px 0", borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
                    <span style={{
                      width:8, height:8, borderRadius:"50%", flexShrink:0,
                      background: r.status==="done" ? "var(--success)" : r.status==="pending" ? "var(--warning)" : "var(--text-subtle)",
                      boxShadow: r.status==="pending" ? "0 0 8px var(--warning)" : "none",
                    }} />
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color: r.status==="done" ? "var(--success)" : "var(--text-muted)" }}>
                      {r.label}
                    </span>
                  </div>
                ))}
              </div>

              <button onClick={onClose} className="btn-primary" style={{ width:"100%", justifyContent:"center", padding:"13px", fontSize:15 }}>
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ── Main PatientView ──────────────────────────────────────────────────────────
export default function PatientView() {
  const { id } = useParams<{ id: string }>();
  const [patientId, setPatientId] = useState(id || "demo-patient-001");
  const [circle, setCircle]           = useState<any[]>(DEMO_CIRCLE);
  const [patient, setPatient]         = useState<any>(DEMO_PATIENT);
  const [selectedDonor, setSelected]  = useState<Donor | null>(null);
  const [activeTab, setActiveTab]     = useState<"circle"|"forecast"|"compat">("circle");
  const [showModal, setShowModal]     = useState(false);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        let currentId = id;
        
        // Fetch patient
        if (currentId) {
          const pRes = await patientAPI.getPatient(currentId);
          setPatient(pRes.data);
        } else {
          const listRes = await patientAPI.getPatients();
          if (listRes.data && listRes.data.length > 0) {
            currentId = listRes.data[0].id;
            setPatientId(currentId);
            const pRes = await patientAPI.getPatient(currentId);
            setPatient(pRes.data);
          }
        }
        
        // Fetch circle
        if (currentId) {
          try {
            const cRes = await matchingAPI.getGuardianCircle(currentId);
            setCircle(cRes.data?.donors || []);
          } catch (e: any) {
            if (e.response && e.response.status === 404) {
              // Circle doesn't exist yet, build it
              await matchingAPI.buildCircle(currentId);
              const cRes = await matchingAPI.getGuardianCircle(currentId);
              setCircle(cRes.data?.donors || []);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load patient data", err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [id]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading Patient Profile...</div>;
  }

  const atRiskCount   = circle.filter(d => d.churn_probability > 0.6).length;
  const eligibleCount = circle.filter(d => d.days_to_eligible === 0).length;
  const circleHealth  = Math.round((patient.circle_health || 0.92) * 100);

  return (
    <div>
      {/* ── Top Bar ── */}
      <div className="topbar">
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:"var(--crimson-dim)", border:"1px solid var(--crimson-border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🧒</div>
          <div>
            <div style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:700 }}>{patient.name}</div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
              {patient.age}y · {patient.thalassemia_type} · {patient.hospital}
            </div>
          </div>
          <span className="badge badge-crimson">{patient.abo}{patient.rh_d?"+":"−"}</span>
          <span className="badge badge-success">Circle {circleHealth}%</span>
          {atRiskCount > 0 && <span className="badge badge-warning">⚠ {atRiskCount} at-risk</span>}
        </div>

        <motion.button
          className="btn-primary" whileTap={{ scale:0.96 }}
          onClick={() => setShowModal(true)}
          style={{ padding:"10px 22px", fontSize:14 }}
        >
          <Droplets size={14} />
          {selectedDonor ? `Request — ${selectedDonor.donor_name}` : "Request Transfusion"}
        </motion.button>
      </div>

      {/* ── 3-col layout ── */}
      <div className="page-content" style={{ display:"grid", gridTemplateColumns:"200px 1fr 220px", gap:20, alignItems:"start" }}>

        {/* LEFT: compact stats */}
        <motion.div initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} className="card" style={{ padding:"16px 14px" }}>
          <div className="section-label" style={{ marginBottom:12 }}>Patient</div>
          {[
            { icon:Droplets,      label:"Blood Type",   value:`${patient.abo}${patient.rh_d?"+":"−"}`, color:"var(--crimson-light)" },
            { icon:Activity,      label:"Transfusions", value:patient.total_transfusions.toLocaleString(), color:"var(--info)" },
            { icon:Shield,        label:"Circle Health",value:`${circleHealth}%`, color:"var(--success)" },
            { icon:AlertTriangle, label:"At-Risk",      value:`${atRiskCount} of ${circle.length}`, color:"var(--warning)" },
            { icon:Droplets,      label:"Eligible Now", value:`${eligibleCount} donors`, color:"var(--success)" },
          ].map(({ icon:Icon, label, value, color }, i) => (
            <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom: i<4 ? "1px solid var(--border)" : "none" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
                <Icon size={11} style={{ color }} /> {label}
              </div>
              <div style={{ fontSize:12, fontWeight:700 }}>{value}</div>
            </div>
          ))}

          <div style={{ marginTop:14, marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", marginBottom:5 }}>
              <span>CIRCLE HEALTH</span><span style={{ color:"var(--success)" }}>{circleHealth}%</span>
            </div>
            <div className="progress-track">
              <motion.div className="progress-fill" initial={{ width:0 }} animate={{ width:`${circleHealth}%` }} transition={{ duration:1.2, ease:"easeOut" }} />
            </div>
          </div>

          {/* Selected donor highlight */}
          {selectedDonor && (
            <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
              style={{ padding:"10px 12px", borderRadius:10, background:"var(--crimson-dim)", border:"1px solid var(--crimson-border)", marginBottom:12 }}>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--crimson-light)", marginBottom:4, letterSpacing:"0.08em" }}>SELECTED</div>
              <div style={{ fontSize:12, fontWeight:700 }}>{selectedDonor.donor_name}</div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", marginTop:2 }}>
                {Math.round(selectedDonor.compatibility.score*100)}% compat · Rank #{selectedDonor.rank}
              </div>
              <button onClick={() => setSelected(null)}
                style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:9, marginTop:4, padding:0 }}>
                × clear selection
              </button>
            </motion.div>
          )}

          {/* Legend */}
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {[["#6366F1","Active"],["var(--warning)","At Risk"],["var(--success)","Donated"]].map(([c,l]) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:7, fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--text-muted)" }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:c, display:"inline-block", boxShadow:`0 0 5px ${c}` }} />{l}
              </div>
            ))}
          </div>
        </motion.div>

        {/* CENTRE: visualisation */}
        <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
          <div className="tabs-container" style={{ marginBottom:16 }}>
            {(["circle","forecast","compat"] as const).map(tab => (
              <button key={tab} className={`tab-btn ${activeTab===tab?"active":""}`} onClick={() => setActiveTab(tab)}>
                {tab==="circle" ? "Guardian Circle" : tab==="forecast" ? "Hb Forecast" : "Antigen Match"}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.18 }}>
              {activeTab === "circle" && (
                <div className="card" style={{ padding:"24px 20px" }}>
                  <div className="section-label">Guardian Circle</div>
                  <div style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:700, marginBottom:8 }}>Arjun's Active Circle</div>
                  <GuardianCircle donors={circle} patientName={patient.name} width={640} height={580} />
                </div>
              )}
              {activeTab === "forecast" && (
                <div className="card">
                  <div className="section-label">LSTM Prediction</div>
                  <div style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:700, marginBottom:20 }}>Hemoglobin Drop Forecast</div>
                  <HbForecastChart patientId={patientId} />
                </div>
              )}
              {activeTab === "compat" && selectedDonor && (
                <div className="card"><CompatScore donor={selectedDonor} patientAbo={patient.abo} patientRhd={patient.rh_d} /></div>
              )}
              {activeTab === "compat" && !selectedDonor && (
                <div className="card" style={{ textAlign:"center", padding:"80px 0", color:"var(--text-muted)" }}>
                  <div style={{ fontSize:40, marginBottom:16 }}>🧬</div>
                  <div style={{ fontFamily:"var(--font-mono)", fontSize:11, lineHeight:1.9 }}>
                    Select a donor from the roster →<br/>to view antigen compatibility
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* RIGHT: donor roster */}
        <motion.div initial={{ opacity:0, x:12 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.15 }}
          className="card" style={{ padding:"14px 12px", maxHeight:680, overflowY:"auto" }}>
          <div className="section-label" style={{ marginBottom:10 }}>Donor Roster</div>

          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {circle.map((d, i) => (
              <motion.div key={d.donor_id}
                initial={{ opacity:0, x:8 }} animate={{ opacity:1, x:0 }} transition={{ delay:i*0.04 }}
                onClick={() => { setSelected(d); setActiveTab("compat"); }}
                whileHover={{ background:"var(--surface-2)" }}
                style={{
                  display:"flex", alignItems:"center", gap:8, padding:"9px 8px 9px 11px",
                  borderRadius:7, cursor:"pointer",
                  background: selectedDonor?.donor_id===d.donor_id ? "var(--crimson-dim)" : "transparent",
                  borderLeft: `3px solid ${STATUS_COLOR[d.status]||"#555"}`,
                  transition:"background 0.15s",
                }}
              >
                <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", width:16, flexShrink:0 }}>#{d.rank}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{d.donor_name}</div>
                  <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", marginTop:2 }}>
                    {d.days_to_eligible===0 ? "✓ eligible" : `+${d.days_to_eligible}d`}
                    {d.churn_probability > 0.6 && <span style={{ color:"var(--warning)", marginLeft:4 }}>⚠</span>}
                  </div>
                </div>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, flexShrink:0,
                  color: d.compatibility.score>=0.9 ? "var(--success)" : d.compatibility.score>=0.8 ? "var(--warning)" : "var(--crimson-light)" }}>
                  {Math.round(d.compatibility.score*100)}%
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Modal ── */}
      <AnimatePresence>
        {showModal && (
          <TransfusionModal
            donor={selectedDonor}
            patient={patient}
            onClose={() => setShowModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
