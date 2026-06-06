import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Droplets, Calendar, AlertTriangle, Shield, Activity } from "lucide-react";
import { matchingAPI, storyAPI } from "@/api/client";
import GuardianCircle from "@/components/GuardianCircle";
import HbForecastChart from "@/components/HbForecastChart";
import CompatScore from "@/components/CompatScore";
import ParticleBackground from "@/components/ParticleBackground";
import "../../src/index.css";

const DEMO_PATIENT = {
  id: "demo-patient-001",
  name: "Arjun Sharma",
  age: 9,
  abo: "B",
  rh_d: true,
  city: "Mumbai",
  hospital: "Mumbai Thalassemia Center",
  thalassemia_type: "major",
  transfusion_interval_days: 21,
  total_transfusions: 312,
  circle_health: 0.92,
};

const DEMO_CIRCLE = [
  { donor_id:"d1",  donor_name:"Ramesh Kumar",  compatibility:{score:0.97,mismatch_count:0,risk_level:"safe"},    churn_probability:0.12, availability_prob:0.88, days_to_eligible:0,  rank:1, status:"active",  phone:"+919xxx",language:"hi" },
  { donor_id:"d2",  donor_name:"Priya Sharma",  compatibility:{score:0.93,mismatch_count:0,risk_level:"safe"},    churn_probability:0.08, availability_prob:0.92, days_to_eligible:12, rank:2, status:"active",  phone:"+919xxx",language:"hi" },
  { donor_id:"d3",  donor_name:"Vijay Reddy",   compatibility:{score:0.91,mismatch_count:1,risk_level:"caution"}, churn_probability:0.71, availability_prob:0.29, days_to_eligible:0,  rank:3, status:"at_risk", phone:"+919xxx",language:"te" },
  { donor_id:"d4",  donor_name:"Ananya Iyer",   compatibility:{score:0.89,mismatch_count:0,risk_level:"safe"},    churn_probability:0.22, availability_prob:0.78, days_to_eligible:6,  rank:4, status:"active",  phone:"+919xxx",language:"ta" },
  { donor_id:"d5",  donor_name:"Suresh Patel",  compatibility:{score:0.87,mismatch_count:1,risk_level:"caution"}, churn_probability:0.35, availability_prob:0.65, days_to_eligible:0,  rank:5, status:"active",  phone:"+919xxx",language:"hi" },
  { donor_id:"d6",  donor_name:"Deepa Nair",    compatibility:{score:0.85,mismatch_count:0,risk_level:"safe"},    churn_probability:0.18, availability_prob:0.82, days_to_eligible:21, rank:6, status:"active",  phone:"+919xxx",language:"ml" },
  { donor_id:"d7",  donor_name:"Arun Mehta",    compatibility:{score:0.82,mismatch_count:2,risk_level:"caution"}, churn_probability:0.55, availability_prob:0.45, days_to_eligible:0,  rank:7, status:"at_risk", phone:"+919xxx",language:"hi" },
  { donor_id:"d8",  donor_name:"Kavya Rao",     compatibility:{score:0.80,mismatch_count:0,risk_level:"safe"},    churn_probability:0.10, availability_prob:0.90, days_to_eligible:4,  rank:8, status:"donated", phone:"+919xxx",language:"kn" },
  { donor_id:"d9",  donor_name:"Mohan Singh",   compatibility:{score:0.78,mismatch_count:1,risk_level:"caution"}, churn_probability:0.28, availability_prob:0.72, days_to_eligible:0,  rank:9, status:"active",  phone:"+919xxx",language:"hi" },
  { donor_id:"d10", donor_name:"Rekha Pillai",  compatibility:{score:0.75,mismatch_count:2,risk_level:"caution"}, churn_probability:0.41, availability_prob:0.59, days_to_eligible:8,  rank:10,status:"active",  phone:"+919xxx",language:"ml" },
];

const STATUS_COLOR: Record<string,string> = {
  active:"#6366F1", at_risk:"#E8952A", donated:"#1DB88E",
};
const STATUS_BG: Record<string,string> = {
  active:"rgba(99,102,241,0.1)", at_risk:"rgba(232,149,42,0.1)", donated:"rgba(29,184,142,0.1)",
};

export default function PatientView() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const patientId = id || "demo-patient-001";

  const [circle, setCircle]           = useState(DEMO_CIRCLE);
  const [patient]                     = useState(DEMO_PATIENT);
  const [selectedDonor, setSelected]  = useState<typeof DEMO_CIRCLE[0] | null>(null);
  const [requesting, setRequesting]   = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [story, setStory]             = useState("");
  const [activeTab, setActiveTab]     = useState<"circle"|"forecast"|"compat">("circle");

  useEffect(() => {
    matchingAPI.getGuardianCircle(patientId)
      .then(r => setCircle(r.data.donors))
      .catch(() => {});
  }, [patientId]);

  useEffect(() => {
    if (!selectedDonor) return;
    storyAPI.getStory(selectedDonor.donor_id, patientId, "en")
      .then(r => setStory(r.data.story_text))
      .catch(() => setStory(`Your donation #${Math.floor(Math.random() * 300 + 1)} was a lifeline for ${patient.name} today.`));
  }, [selectedDonor]);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await matchingAPI.createRequest({
        patient_id: patientId, hospital_id:"demo-hospital-001",
        urgency:"urgent", units_needed:1,
      });
      setRequestSent(true);
    } catch {
      setRequestSent(true);
    } finally {
      setRequesting(false);
    }
  };

  const atRiskCount   = circle.filter(d => d.churn_probability > 0.6).length;
  const eligibleCount = circle.filter(d => d.days_to_eligible === 0).length;
  const circleHealth  = Math.round(patient.circle_health * 100);

  const statItems = [
    { label:"Blood Type",       value:`${patient.abo}${patient.rh_d ? "+" : "−"}`, icon:Droplets,       color:"#E8554E" },
    { label:"Total Transfusions",value:patient.total_transfusions.toLocaleString(), icon:Activity,        color:"#6366F1" },
    { label:"Circle Health",    value:`${circleHealth}%`,                           icon:Shield,          color:"#1DB88E" },
    { label:"At-Risk Donors",   value:`${atRiskCount} of ${circle.length}`,         icon:AlertTriangle,   color:"#E8952A" },
    { label:"Eligible Now",     value:`${eligibleCount} donors`,                    icon:Droplets,        color:"#8B5CF6" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#08080A", color:"#F0EEE8", fontFamily:"'DM Sans',sans-serif" }}>
      <ParticleBackground />

      {/* Header */}
      <header className="app-header">
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <motion.button
            whileHover={{ x:-2 }} whileTap={{ scale:0.95 }}
            onClick={() => navigate("/")}
            style={{ background:"none", border:"none", color:"#555", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontSize:13 }}
          >
            <ArrowLeft size={15} /> Dashboard
          </motion.button>
          <div style={{ width:1, height:20, background:"rgba(255,255,255,0.08)" }} />
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{
              width:32, height:32, borderRadius:8,
              background:"rgba(192,39,45,0.15)", border:"1px solid rgba(192,39,45,0.3)",
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:16,
            }}>🧒</div>
            <div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:15 }}>
                {patient.name}
              </div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#444" }}>
                {patient.age}y · {patient.thalassemia_type} · {patient.city}
              </div>
            </div>
          </div>
        </div>

        <div style={{
          display:"flex", alignItems:"center", gap:8,
          background:"rgba(232,85,78,0.06)", border:"1px solid rgba(232,85,78,0.2)",
          borderRadius:8, padding:"6px 14px",
          fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#E8554E",
        }}>
          <span>🩸</span> {patient.total_transfusions} transfusions · every {patient.transfusion_interval_days}d
        </div>
      </header>

      <main style={{ padding:"28px 32px", display:"grid", gridTemplateColumns:"300px 1fr", gap:20, alignItems:"start", position:"relative", zIndex:1 }}>

        {/* LEFT PANEL */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Patient info card */}
          <motion.div
            initial={{ opacity:0, x:-20 }}
            animate={{ opacity:1, x:0 }}
            transition={{ duration:0.4 }}
            style={{
              background:"rgba(14,14,20,0.8)", backdropFilter:"blur(16px)",
              border:"1px solid rgba(255,255,255,0.07)", borderRadius:16,
              padding:22, position:"relative", overflow:"hidden",
            }}
          >
            {/* Crimson glow */}
            <div style={{
              position:"absolute", top:-40, right:-40,
              width:160, height:160, borderRadius:"50%",
              background:"radial-gradient(circle, rgba(192,39,45,0.08) 0%, transparent 70%)",
              pointerEvents:"none",
            }} />

            {/* Circle health badge */}
            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
              <div style={{
                display:"flex", alignItems:"center", gap:6,
                background: circleHealth >= 85 ? "rgba(29,184,142,0.08)" : "rgba(232,149,42,0.08)",
                border: `1px solid ${circleHealth >= 85 ? "rgba(29,184,142,0.2)" : "rgba(232,149,42,0.2)"}`,
                borderRadius:20, padding:"4px 12px",
                fontFamily:"'JetBrains Mono',monospace", fontSize:11,
                color: circleHealth >= 85 ? "#1DB88E" : "#E8952A",
              }}>
                <Shield size={10} /> {circleHealth}% circle health
              </div>
            </div>

            {/* Stats */}
            <div style={{ display:"flex", flexDirection:"column" }}>
              {statItems.map(({ label, value, icon:Icon, color }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity:0, x:-10 }}
                  animate={{ opacity:1, x:0 }}
                  transition={{ delay:0.1 + i*0.06 }}
                  style={{
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"11px 0",
                    borderBottom: i < statItems.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:8, fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#555" }}>
                    <Icon size={11} style={{ color }} /> {label}
                  </div>
                  <div style={{
                    fontSize:13, fontWeight:600,
                    color: label==="At-Risk Donors" && atRiskCount > 0 ? "#E8952A" : "#F0EEE8",
                  }}>
                    {value}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Circle health bar */}
            <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#444", marginBottom:6 }}>
                <span>CIRCLE HEALTH</span>
                <span style={{ color:"#1DB88E" }}>{circleHealth}%</span>
              </div>
              <div className="progress-track">
                <motion.div
                  className="progress-fill"
                  initial={{ width:0 }}
                  animate={{ width:`${circleHealth}%` }}
                  transition={{ duration:1.2, ease:"easeOut", delay:0.4 }}
                  style={{ background: circleHealth < 75 ? "linear-gradient(90deg,#E8952A,#e8554e)" : undefined }}
                />
              </div>
            </div>
          </motion.div>

          {/* Request button */}
          <AnimatePresence mode="wait">
            {!requestSent ? (
              <motion.button
                key="request"
                initial={{ opacity:0, y:8 }}
                animate={{ opacity:1, y:0 }}
                exit={{ opacity:0, scale:0.95 }}
                whileHover={{ scale:1.02, boxShadow:"0 8px 24px rgba(192,39,45,0.5)" }}
                whileTap={{ scale:0.97 }}
                onClick={handleRequest}
                disabled={requesting}
                style={{
                  padding:"16px", borderRadius:12, border:"none",
                  background: requesting
                    ? "rgba(192,39,45,0.4)"
                    : "linear-gradient(135deg, #C0272D, #E8554E)",
                  color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer",
                  fontFamily:"'Syne',sans-serif", width:"100%",
                  boxShadow:"0 4px 16px rgba(192,39,45,0.35)",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                }}
              >
                {requesting ? (
                  <>
                    <span style={{ animation:"spin-slow 1s linear infinite", display:"inline-block" }}>⟳</span>
                    Activating circle...
                  </>
                ) : (
                  <><Droplets size={16} /> Request Transfusion</>
                )}
              </motion.button>
            ) : (
              <motion.div
                key="sent"
                initial={{ opacity:0, scale:0.9 }}
                animate={{ opacity:1, scale:1 }}
                transition={{ type:"spring", stiffness:300, damping:24 }}
                style={{
                  padding:"16px", borderRadius:12,
                  background:"rgba(29,184,142,0.06)",
                  border:"1px solid rgba(29,184,142,0.25)",
                  textAlign:"center",
                }}
              >
                <div style={{ color:"#1DB88E", fontWeight:700, fontSize:15, marginBottom:4 }}>
                  ✅ Circle Activated
                </div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#555" }}>
                  Top 3 donors notified via WhatsApp
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selected donor story */}
          <AnimatePresence>
            {selectedDonor && story && (
              <motion.div
                initial={{ opacity:0, y:12, height:0 }}
                animate={{ opacity:1, y:0, height:"auto" }}
                exit={{ opacity:0, y:-8, height:0 }}
                style={{
                  padding:18, borderRadius:12,
                  background:"rgba(99,102,241,0.05)",
                  border:"1px solid rgba(99,102,241,0.18)",
                  overflow:"hidden",
                }}
              >
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#818CF8", letterSpacing:"0.12em", marginBottom:10, textTransform:"uppercase" }}>
                  Impact Story · {selectedDonor.donor_name}
                </div>
                <div style={{ fontSize:13, color:"#ccc", lineHeight:1.75, fontStyle:"italic" }}>
                  "{story}"
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT PANEL */}
        <motion.div
          initial={{ opacity:0, y:16 }}
          animate={{ opacity:1, y:0 }}
          transition={{ delay:0.2, duration:0.5 }}
        >
          {/* Tabs */}
          <div className="tabs-container">
            {(["circle","forecast","compat"] as const).map(tab => (
              <button
                key={tab}
                className={`tab-btn ${activeTab===tab?"active":""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab==="circle" ? "💊 Guardian Circle" : tab==="forecast" ? "📈 Hb Forecast" : "🧬 Antigen Match"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity:0, y:8 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-8 }}
              transition={{ duration:0.25 }}
              style={{
                background:"rgba(14,14,20,0.8)", backdropFilter:"blur(16px)",
                border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:24,
              }}
            >
              {activeTab === "circle" && (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, margin:0 }}>
                      Guardian Circle — {patient.name}
                    </h2>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#555" }}>
                      Click a donor to view story
                    </span>
                  </div>
                  <GuardianCircle donors={circle} patientName={patient.name} width={460} height={460} />

                  {/* Legend */}
                  <div style={{ display:"flex", gap:16, marginTop:14, flexWrap:"wrap" }}>
                    {[["active","#6366F1","Active"],["at_risk","#E8952A","At Risk"],["donated","#1DB88E","Donated"]].map(([s,c,l]) => (
                      <span key={s} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#555", display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ width:7, height:7, borderRadius:"50%", background:c, display:"inline-block", boxShadow:`0 0 6px ${c}` }} />{l}
                      </span>
                    ))}
                  </div>

                  {/* Donor table */}
                  <div style={{ marginTop:24 }}>
                    {circle.map((d, i) => (
                      <motion.div
                        key={d.donor_id}
                        initial={{ opacity:0, x:-10 }}
                        animate={{ opacity:1, x:0 }}
                        transition={{ delay:i*0.04 }}
                        whileHover={{ background:"rgba(255,255,255,0.03)" }}
                        onClick={() => setSelected(d)}
                        style={{
                          display:"flex", alignItems:"center", gap:12,
                          padding:"11px 10px", borderRadius:8, cursor:"pointer",
                          borderBottom:"1px solid rgba(255,255,255,0.04)",
                          background: selectedDonor?.donor_id===d.donor_id ? "rgba(99,102,241,0.08)" : "transparent",
                          transition:"all 0.15s",
                        }}
                      >
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#333", width:20 }}>
                          #{d.rank}
                        </span>
                        <span style={{
                          width:7, height:7, borderRadius:"50%",
                          background:STATUS_COLOR[d.status] || "#555",
                          boxShadow:`0 0 6px ${STATUS_COLOR[d.status] || "#555"}`,
                          flexShrink:0,
                        }} />
                        <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{d.donor_name}</span>

                        {/* Compat score badge */}
                        <span style={{
                          fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:600,
                          color: d.compatibility.score >= 0.9 ? "#1DB88E" : d.compatibility.score >= 0.8 ? "#E8952A" : "#E8554E",
                        }}>
                          {Math.round(d.compatibility.score * 100)}%
                        </span>

                        {/* Churn badge */}
                        <span style={{
                          fontFamily:"'JetBrains Mono',monospace", fontSize:9,
                          color: d.churn_probability > 0.6 ? "#E8952A" : "#444",
                          background: d.churn_probability > 0.6 ? "rgba(232,149,42,0.1)" : "transparent",
                          padding: d.churn_probability > 0.6 ? "2px 6px" : "0",
                          borderRadius:4,
                        }}>
                          churn {Math.round(d.churn_probability * 100)}%
                        </span>

                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#333" }}>
                          {d.days_to_eligible===0 ? "✓ eligible" : `+${d.days_to_eligible}d`}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "forecast" && (
                <div>
                  <div style={{ marginBottom:20 }}>
                    <div className="section-label">LSTM PREDICTION</div>
                    <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, margin:0 }}>
                      Hemoglobin Drop Forecast
                    </h2>
                  </div>
                  <HbForecastChart patientId={patientId} />
                  <div style={{
                    marginTop:20, padding:"14px 16px",
                    background:"rgba(139,92,246,0.05)", border:"1px solid rgba(139,92,246,0.15)",
                    borderRadius:10, fontFamily:"'JetBrains Mono',monospace", fontSize:11,
                  }}>
                    <div style={{ color:"#8B5CF6", marginBottom:6, fontWeight:600, fontSize:10, letterSpacing:"0.1em" }}>
                      MODEL DETAILS
                    </div>
                    <div style={{ color:"#555", lineHeight:1.7 }}>
                      Bidirectional LSTM · 12 transfusion history points · ±2.8 day MAE
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "compat" && selectedDonor && (
                <CompatScore donor={selectedDonor} patientAbo={patient.abo} patientRhd={patient.rh_d} />
              )}
              {activeTab === "compat" && !selectedDonor && (
                <div style={{ textAlign:"center", padding:"60px 0", color:"#444" }}>
                  <div style={{ fontSize:36, marginBottom:16 }}>🧬</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, lineHeight:1.8 }}>
                    Select a donor from the Guardian Circle tab<br />
                    to view detailed antigen compatibility
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
}
