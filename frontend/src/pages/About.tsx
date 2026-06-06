import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Globe, Dna,
  ShieldCheck, Brain, Mic, Zap,
} from "lucide-react";

// ── Slide data ─────────────────────────────────────────────────────────────────
const SLIDES = [
  { id: "hero",     label: "Overview" },
  { id: "problem",  label: "Problem" },
  { id: "solution", label: "Solution" },
  { id: "antigens", label: "12 Antigens" },
  { id: "guardian", label: "Guardians" },
  { id: "timeline", label: "7-Day Activation" },
  { id: "privacy",  label: "Privacy" },
  { id: "ai",       label: "AI Engine" },
  { id: "market",   label: "Market" },
  { id: "traction", label: "Traction" },
  { id: "stack",    label: "Tech Stack" },
  { id: "roadmap",  label: "Roadmap" },
  { id: "close",    label: "Join Mission" },
];

const ANTIGENS = [
  { name: "ABO",        system: "ABO System",       hi: true },
  { name: "RhD",        system: "Rh System",        hi: true },
  { name: "RhC / Rhc",  system: "Rh System",        hi: false },
  { name: "RhE / Rhe",  system: "Rh System",        hi: false },
  { name: "Kell (K/k)", system: "Kell System",      hi: false },
  { name: "Fy(a)/Fy(b)",system: "Duffy System",     hi: false },
  { name: "Jk(a)/Jk(b)",system: "Kidd System",      hi: false },
  { name: "M / N",      system: "MNS System",       hi: false },
  { name: "S / s",      system: "MNS System",       hi: false },
  { name: "Le(a)/Le(b)",system: "Lewis System",     hi: false },
  { name: "P1",         system: "P1PK System",      hi: false },
  { name: "Lu(a)/Lu(b)",system: "Lutheran System",  hi: false },
];

const BG = {
  gridLines: {
    backgroundImage: [
      "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
      "linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
    ].join(","),
    backgroundSize: "60px 60px",
  } as React.CSSProperties,
};

// ── Shared slide wrapper ───────────────────────────────────────────────────────
function Slide({ children, glow = "left" }: { children: React.ReactNode; glow?: "left" | "right" | "both" }) {
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* grid bg */}
      <div style={{ position: "absolute", inset: 0, ...BG.gridLines, pointerEvents: "none", zIndex: 0 }} />
      {/* glow left */}
      {(glow === "left" || glow === "both") && (
        <div style={{ position:"absolute", bottom:-100, left:-100, width:500, height:500, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(192,57,43,0.12) 0%, transparent 70%)", pointerEvents:"none", zIndex:0 }} />
      )}
      {/* glow right */}
      {(glow === "right" || glow === "both") && (
        <div style={{ position:"absolute", top:-100, right:-100, width:400, height:400, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(192,57,43,0.07) 0%, transparent 70%)", pointerEvents:"none", zIndex:0 }} />
      )}
      <div style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "36px 40px" }}>
        {children}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, fontFamily:"var(--font-mono)", fontSize:10,
      letterSpacing:"0.15em", textTransform:"uppercase", color:"var(--crimson-light)", marginBottom:20 }}>
      <span style={{ width:24, height:2, background:"var(--crimson-light)", display:"inline-block", flexShrink:0 }} />
      {children}
    </div>
  );
}

function SlideHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:"clamp(28px, 3vw, 48px)",
      color:"var(--text-main)", lineHeight:1.05, marginBottom:14 }}>
      {children}
    </h2>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Individual slides
// ═══════════════════════════════════════════════════════════════════════════════

function HeroSlide() {
  const statCards = [
    { icon:"🧬", val:"12", label:"Antigens Matched" },
    { icon:"🛡️", val:"Federated", label:"Zero PII Risk" },
    { icon:"🤖", val:"GenAI", label:"Bedrock Retention" },
    { icon:"📞", val:"Voice IVR", label:"Offline Accessible" },
  ];
  return (
    <Slide glow="both">
      <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", minHeight:"100%" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:32 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"var(--crimson)", display:"flex",
              alignItems:"center", justifyContent:"center", fontSize:22, boxShadow:"0 4px 20px rgba(192,39,45,0.4)",
              animation:"heartbeat 2.5s ease-in-out infinite" }}>💗</div>
            <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:22 }}>RakSetu</span>
          </div>
          <span className="badge badge-crimson" style={{ fontSize:12, padding:"6px 14px" }}>🏆 Hackathon Solution</span>
        </div>

        <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center" }}>
          <motion.h1 initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}
            style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:"clamp(42px, 5vw, 80px)",
              lineHeight:1, letterSpacing:"-0.02em", color:"var(--text-main)", marginBottom:20 }}>
            RakSetu —
            <span style={{ display:"block", color:"var(--crimson-light)" }}>Lifeline Bridge</span>
          </motion.h1>
          <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }}
            style={{ fontSize:17, color:"rgba(240,238,232,0.7)", maxWidth:580, lineHeight:1.7, marginBottom:32 }}>
            Every Thalassemia patient needs the same compatible blood, <strong style={{ color:"var(--text-main)" }}>hundreds of times</strong>, for their entire life. We built the system that makes that possible.
          </motion.p>
          <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
            {statCards.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
                transition={{ delay:0.25 + i*0.08 }} whileHover={{ y:-2, borderColor:"rgba(192,39,45,0.4)" }}
                style={{ flex:"1 1 160px", minWidth:140, background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)",
                  borderRadius:16, padding:"16px 18px", display:"flex", alignItems:"center", gap:14,
                  transition:"border-color 0.2s" }}>
                <div style={{ width:38, height:38, borderRadius:10, background:"rgba(192,39,45,0.2)",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                  {s.icon}
                </div>
                <div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:"var(--text-main)", lineHeight:1 }}>{s.val}</div>
                  <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:3 }}>{s.label}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:24, marginTop:32 }}>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text-muted)" }}>
            A hackathon AI solution for Blood Warriors 🩸
          </div>
        </div>
      </div>
    </Slide>
  );
}

function ProblemSlide() {
  const probs = [
    {
      num:"01", icon:"🧪", title:"Alloimmunization",
      lines:[
        "When mismatched blood is transfused repeatedly, the patient's immune system builds antibodies against foreign antigens — eventually making transfusions <b>ineffective or fatal.</b>",
        "Current apps match on <b>2 antigens</b> (ABO + RhD). The correct answer is <b>12</b>. International guidelines already say so. India's platforms ignore it.",
      ]
    },
    {
      num:"02", icon:"🚶", title:"Silent Donor Churn",
      lines:[
        "A patient's molecularly-compatible donor pool is tiny by definition. If even <b>2–3 guardians drop out silently,</b> the next transfusion cycle is in jeopardy.",
        "No existing system predicts this. Families find out when it's already an emergency — at 2am, 3 hours before a transfusion.",
      ]
    },
  ];
  return (
    <Slide glow="left">
      <SectionLabel>The Problem</SectionLabel>
      <SlideHeading>Existing blood apps treat Thalassemia<br /><span style={{ color:"var(--crimson-light)" }}>like Uber.</span> It doesn't work.</SlideHeading>
      <p style={{ fontSize:15, color:"rgba(255,255,255,0.6)", maxWidth:660, lineHeight:1.65, marginBottom:24 }}>
        A Thalassemia patient needs the same compatible donor, hundreds of times, for their entire life. One-shot matching isn't just inadequate — it's dangerous.
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
        {probs.map((p, i) => (
          <motion.div key={p.num} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 + i*0.1 }}
            style={{ background:"rgba(192,57,43,0.07)", border:"1px solid rgba(192,57,43,0.2)", borderRadius:18,
              padding:24, position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:12, right:16, fontFamily:"var(--font-display)", fontWeight:800,
              fontSize:48, color:"var(--crimson-light)", opacity:0.12, lineHeight:1 }}>{p.num}</div>
            <div style={{ width:38, height:38, borderRadius:10, background:"rgba(192,57,43,0.2)",
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, marginBottom:12 }}>{p.icon}</div>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:18, color:"var(--text-main)", marginBottom:10 }}>{p.title}</div>
            {p.lines.map((l, j) => (
              <p key={j} style={{ fontSize:13, color:"rgba(255,255,255,0.65)", lineHeight:1.65, marginBottom:8 }}
                dangerouslySetInnerHTML={{ __html: l.replace(/<b>/g,'<strong style="color:#F0EEE8">').replace(/<\/b>/g,'</strong>') }} />
            ))}
          </motion.div>
        ))}
      </div>
    </Slide>
  );
}

function SolutionSlide() {
  const features = [
    { icon:"🧬", name:"Guardian Circles (12-Antigen Match)", desc:"Deep phenotype matching prevents alloimmunization in chronic patients." },
    { icon:"🛡️", name:"Federated Learning (Privacy First)", desc:"Train models at edge hospitals securely without moving patient data." },
    { icon:"✍️", name:"GenAI Story Engine (AWS Bedrock)", desc:"Writes personalised regional language stories to psychologically retain donors." },
    { icon:"📞", name:"App-less Rural Reach (Amazon Lex)", desc:"Voice IVR allows offline village donors to participate with zero internet." },
  ];
  const steps = [
    { n:"01", t:"Patient registers", d:"with 12-antigen phenotype report" },
    { n:"02", t:"AI finds compatible Guardian Donors", d:"in the pool" },
    { n:"03", t:"LSTM Network predicts Hb drop", d:"& needs" },
    { n:"04", t:"AWS Bedrock generates stories", d:"to re-engage" },
    { n:"05", t:"Federated Learning", d:"keeps data siloed safely" },
  ];
  return (
    <Slide glow="right">
      <SectionLabel>The Solution</SectionLabel>
      <div style={{ display:"flex", gap:48, alignItems:"flex-start" }}>
        <div style={{ flex:1 }}>
          <SlideHeading>RakSetu builds<br /><span style={{ color:"var(--crimson-light)" }}>lifelong bonds,</span><br />not one-time matches.</SlideHeading>
          <p style={{ fontSize:14, color:"rgba(255,255,255,0.65)", lineHeight:1.7, marginBottom:24 }}>
            A permanent bridge between patient and Guardian Donors — molecularly matched, proactively managed, privacy-first.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {features.map(f => (
              <motion.div key={f.name} whileHover={{ borderColor:"rgba(192,39,45,0.35)" }}
                style={{ display:"flex", gap:12, alignItems:"flex-start", background:"rgba(255,255,255,0.04)",
                  border:"1px solid var(--border)", borderRadius:12, padding:"13px 15px", transition:"border-color 0.2s" }}>
                <div style={{ width:32, height:32, borderRadius:8, background:"rgba(192,39,45,0.2)",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>{f.icon}</div>
                <div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, color:"var(--text-main)", marginBottom:2 }}>{f.name}</div>
                  <div style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.5 }}>{f.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        <div style={{ width:320, flexShrink:0 }}>
          <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)", borderRadius:18, padding:26 }}>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, color:"var(--text-main)", marginBottom:18 }}>How It Works</div>
            {steps.map((s, i) => (
              <div key={s.n} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 0",
                borderBottom: i < steps.length-1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ width:26, height:26, borderRadius:"50%", background:"rgba(192,39,45,0.15)",
                  border:"1px solid rgba(192,39,45,0.35)", display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:"var(--font-mono)", fontSize:9, color:"var(--crimson-light)", flexShrink:0, marginTop:1 }}>{s.n}</div>
                <div style={{ fontSize:12.5, color:"rgba(255,255,255,0.75)", lineHeight:1.5 }}>
                  <strong style={{ color:"var(--text-main)" }}>{s.t}</strong> {s.d}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Slide>
  );
}

function AntigenSlide() {
  return (
    <Slide glow="left">
      <SectionLabel>Deep Compatibility</SectionLabel>
      <SlideHeading>Matching on <span style={{ color:"var(--crimson-light)" }}>12 antigens,</span> not just 2.</SlideHeading>
      <p style={{ fontSize:14, color:"rgba(255,255,255,0.6)", maxWidth:640, lineHeight:1.65, marginBottom:28 }}>
        International transfusion guidelines require extended phenotyping. RakSetu is the first Indian platform to implement it fully.
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:12 }}>
        {ANTIGENS.map((a, i) => (
          <motion.div key={a.name} initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }} transition={{ delay:i*0.04 }}
            whileHover={{ borderColor:"rgba(192,39,45,0.5)", background:"rgba(192,39,45,0.1)" }}
            style={{
              background: a.hi ? "rgba(192,39,45,0.1)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${a.hi ? "rgba(192,39,45,0.4)" : "var(--border)"}`,
              borderRadius:12, padding:"16px 12px", textAlign:"center", transition:"all 0.2s",
            }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:15, fontWeight:600, color:"var(--crimson-light)", marginBottom:4 }}>{a.name}</div>
            <div style={{ fontSize:11, color:"var(--text-muted)" }}>{a.system}</div>
            {a.hi && <div style={{ marginTop:6 }}><span className="badge badge-crimson" style={{ fontSize:9 }}>Standard</span></div>}
          </motion.div>
        ))}
      </div>
    </Slide>
  );
}

function GuardianSlide() {
  const stats = [
    { val:"50K+", label:"Guardian Donors", sub:"in the founding pool at launch" },
    { val:"3–5",  label:"Guardians per patient", sub:"redundancy ensures zero gaps" },
    { val:"∞",    label:"Lifetime commitment", sub:"managed with AI retention systems" },
  ];
  const lifecycle = [
    { title:"Phenotype Registration", desc:"Extended blood typing across 12 antigens" },
    { title:"AI Matching",            desc:"Paired with compatible patients silently" },
    { title:"7-Day Activation",       desc:"Notified a week before transfusion date" },
    { title:"Churn Monitoring",       desc:"Engagement score tracked continuously" },
    { title:"Re-engagement",          desc:"AI triggers nudges before donor goes cold" },
  ];
  return (
    <Slide glow="right">
      <SectionLabel>Guardian Donors</SectionLabel>
      <div style={{ display:"flex", gap:48, alignItems:"flex-start" }}>
        <div style={{ flex:1 }}>
          <SlideHeading>From strangers<br />to <span style={{ color:"var(--crimson-light)" }}>lifelong guardians.</span></SlideHeading>
          <p style={{ fontSize:14, color:"rgba(255,255,255,0.65)", lineHeight:1.7, marginBottom:24 }}>
            Guardian Donors aren't one-time blood donors. They are permanent, molecularly-bonded companions for a patient's entire transfusion journey.
          </p>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {stats.map(s => (
              <motion.div key={s.val} whileHover={{ borderColor:"rgba(192,39,45,0.3)" }}
                style={{ display:"flex", alignItems:"center", gap:16, background:"rgba(255,255,255,0.04)",
                  border:"1px solid var(--border)", borderRadius:14, padding:"14px 18px", transition:"border-color 0.2s" }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:28, color:"var(--crimson-light)", minWidth:72 }}>{s.val}</div>
                <div>
                  <div style={{ fontSize:13, color:"var(--text-main)", fontWeight:600 }}>{s.label}</div>
                  <div style={{ fontSize:12, color:"var(--text-muted)" }}>{s.sub}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        <div style={{ width:300, flexShrink:0 }}>
          <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)", borderRadius:18, padding:26 }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, letterSpacing:"0.12em", color:"var(--text-muted)", textTransform:"uppercase", marginBottom:20 }}>Guardian Lifecycle</div>
            {lifecycle.map((l, i) => (
              <div key={l.title} style={{ display:"flex", gap:14, padding:"10px 0",
                borderBottom: i < lifecycle.length-1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--crimson-light)", flexShrink:0, marginTop:6 }} />
                <div style={{ fontSize:12.5, color:"rgba(255,255,255,0.75)", lineHeight:1.5 }}>
                  <strong style={{ color:"var(--text-main)", display:"block", marginBottom:2, fontSize:13 }}>{l.title}</strong>
                  {l.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Slide>
  );
}

function TimelineSlide() {
  const days = [
    { day:"DAY −7", icon:"📅", title:"Transfusion Scheduled",  desc:"Hospital confirms upcoming transfusion date in system" },
    { day:"DAY −7", icon:"🔔", title:"Guardians Notified",      desc:"3–5 matched donors receive personalised activation request" },
    { day:"DAY −5", icon:"✅", title:"Confirmations In",        desc:"Donors confirm or defer — backup pool activated instantly" },
    { day:"DAY −1", icon:"🩺", title:"Pre-Screening",           desc:"Confirmed donors complete health checklist remotely" },
    { day:"DAY 0",  icon:"💉", title:"Transfusion Day",         desc:"Compatible blood ready. Patient safe. Zero scrambling." },
  ];
  return (
    <Slide glow="left">
      <SectionLabel>Proactive Activation</SectionLabel>
      <SlideHeading>7 days ahead.<br /><span style={{ color:"var(--crimson-light)" }}>Zero last-minute emergencies.</span></SlideHeading>
      <p style={{ fontSize:14, color:"rgba(255,255,255,0.6)", maxWidth:640, lineHeight:1.65, marginBottom:28 }}>
        Traditional systems call donors the night before. We activate guardians a full week early — time for deferrals, backups, and scheduling.
      </p>
      <div style={{ display:"flex", gap:12 }}>
        {days.map((d, i) => (
          <motion.div key={i} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.08 }}
            style={{ flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--crimson-light)", letterSpacing:"0.12em", marginBottom:8 }}>{d.day}</div>
            <motion.div whileHover={{ borderColor:"rgba(192,39,45,0.4)" }}
              style={{ background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)", borderRadius:14,
                padding:"18px 14px", flex:1, transition:"border-color 0.2s" }}>
              <div style={{ fontSize:24, marginBottom:10 }}>{d.icon}</div>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, color:"var(--text-main)", marginBottom:6 }}>{d.title}</div>
              <div style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.5 }}>{d.desc}</div>
            </motion.div>
          </motion.div>
        ))}
      </div>
    </Slide>
  );
}

function PrivacySlide() {
  const pills = ["✓ No PII leaves the hospital", "✓ Distributed edge training", "✓ DPDP Act & HIPAA compliant", "✓ Mathematical weight transfer only"];
  const rows = [
    "The ML model is sent into the isolated hospital network",
    "The model learns from private local records securely",
    "Only the updated mathematical weights return to our Central Aggregator",
    "Global predictive accuracy achieved without seeing a single patient file",
  ];
  return (
    <Slide glow="right">
      <SectionLabel>Privacy & Compliance</SectionLabel>
      <div style={{ display:"flex", gap:48, alignItems:"flex-start" }}>
        <div style={{ flex:1 }}>
          <SlideHeading>Federated Learning.<br /><span style={{ color:"var(--crimson-light)" }}>Zero DPDP / HIPAA Risk.</span></SlideHeading>
          <p style={{ fontSize:14, color:"rgba(255,255,255,0.65)", lineHeight:1.7, marginBottom:20 }}>
            Hospitals cannot legally share raw patient records. Our architecture uses Federated Learning (Flower/flwr) to train models securely at the edge.
          </p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20 }}>
            {pills.map(p => (
              <span key={p} style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(39,174,96,0.08)",
                border:"1px solid rgba(39,174,96,0.2)", borderRadius:20, padding:"6px 14px", fontSize:12, color:"#4eca80" }}>{p}</span>
            ))}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, fontSize:13, color:"rgba(255,255,255,0.7)" }}>
                <div style={{ width:20, height:20, background:"rgba(39,174,96,0.12)", borderRadius:"50%",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#4eca80", flexShrink:0 }}>✓</div>
                {r}
              </div>
            ))}
          </div>
        </div>
        <div style={{ width:240, flexShrink:0 }}>
          <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)", borderRadius:18,
            padding:32, textAlign:"center" }}>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:56, color:"var(--text-main)", lineHeight:1 }}>Edge</div>
            <div style={{ width:40, height:3, background:"var(--crimson)", borderRadius:2, margin:"16px auto" }} />
            <div style={{ fontSize:14, color:"var(--text-muted)", lineHeight:1.6 }}>Training executed locally<br />to preserve anonymity</div>
          </div>
        </div>
      </div>
    </Slide>
  );
}

function AISlide() {
  const cards = [
    { icon:"🧠", title:"LSTM Forecasting", tag:"Predictive Analytics",
      desc:"Long Short-Term Memory networks analyse a patient's historical Hemoglobin decay rate to forecast exactly when they will cross critical thresholds." },
    { icon:"✍️", title:"AWS Bedrock GenAI", tag:"Generative AI",
      desc:"The Story Engine uses Nova Lite to dynamically generate highly personalised, regional-language impact stories (e.g., \"Your blood saved a 5yo in Pune\")." },
    { icon:"🧬", title:"Antigen Match & XGBoost", tag:"Machine Learning",
      desc:"Scores donor compatibility across 12 antigens while XGBoost churn models continuously score donors on their likelihood to drop out of the Guardian Circle." },
  ];
  return (
    <Slide glow="left">
      <SectionLabel>AI Engine</SectionLabel>
      <SlideHeading>Intelligence that<br /><span style={{ color:"var(--crimson-light)" }}>predicts, connects, and matches.</span></SlideHeading>
      <p style={{ fontSize:14, color:"rgba(255,255,255,0.6)", maxWidth:640, lineHeight:1.65, marginBottom:28 }}>
        Three specialized AI models working across AWS and edge nodes to keep the lifeline unbroken.
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:18 }}>
        {cards.map((c, i) => (
          <motion.div key={c.title} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.1 }}
            whileHover={{ borderColor:"rgba(192,39,45,0.4)" }}
            style={{ background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)", borderRadius:16,
              padding:"24px 20px", display:"flex", flexDirection:"column", gap:10, transition:"border-color 0.2s" }}>
            <div style={{ fontSize:28 }}>{c.icon}</div>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:16, color:"var(--text-main)" }}>{c.title}</div>
            <div style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.65, flex:1 }}>{c.desc}</div>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--crimson-light)",
              background:"rgba(192,39,45,0.1)", border:"1px solid rgba(192,39,45,0.2)",
              borderRadius:6, padding:"3px 8px", width:"fit-content" }}>{c.tag}</div>
          </motion.div>
        ))}
      </div>
    </Slide>
  );
}

function MarketSlide() {
  const cards = [
    { label:"Patients in India",        val:"1.5L+", sub:"Thalassemia Major patients requiring transfusions every 2–4 weeks", hi:false },
    { label:"Transfusions / Year",      val:"3.9M+", sub:"Annual transfusion events — each one a potential crisis without a guardian", hi:true },
    { label:"Compatible Donors Needed", val:"750K+", sub:"At 5 guardians per patient, the addressable donor recruitment opportunity", hi:false },
    { label:"Global Market",            val:"$2.4B", sub:"Blood management software market CAGR 8.2% — India deeply under-penetrated", hi:false },
  ];
  return (
    <Slide glow="right">
      <SectionLabel>Market Opportunity</SectionLabel>
      <SlideHeading>A massive, <span style={{ color:"var(--crimson-light)" }}>underserved</span> market.</SlideHeading>
      <p style={{ fontSize:14, color:"rgba(255,255,255,0.6)", maxWidth:640, lineHeight:1.65, marginBottom:28 }}>
        India carries the world's largest Thalassemia burden. No existing platform serves them with the depth they need.
      </p>
      <div style={{ display:"flex", gap:16 }}>
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.08 }}
            whileHover={{ borderColor:"rgba(192,39,45,0.45)" }}
            style={{ flex:1, background: c.hi ? "rgba(192,39,45,0.08)" : "rgba(255,255,255,0.04)",
              border:`1px solid ${c.hi ? "rgba(192,39,45,0.3)" : "var(--border)"}`,
              borderRadius:18, padding:28, display:"flex", flexDirection:"column", justifyContent:"space-between",
              transition:"border-color 0.2s" }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, letterSpacing:"0.12em", color:"var(--text-muted)", textTransform:"uppercase", marginBottom:12 }}>{c.label}</div>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:40, lineHeight:1,
              color: c.hi ? "var(--crimson-light)" : "var(--text-main)" }}>{c.val}</div>
            <div style={{ fontSize:12, color:"var(--text-muted)", marginTop:8, lineHeight:1.5 }}>{c.sub}</div>
          </motion.div>
        ))}
      </div>
    </Slide>
  );
}

function TractionSlide() {
  const cards = [
    { val:"48h",  label:"Build Time",        sub:"Full-stack prototype with AI matching, donor management, and privacy layer" },
    { val:"12",   label:"Antigens Modelled", sub:"Complete extended phenotyping — first in any Indian blood app" },
    { val:"3",    label:"AI Models Live",    sub:"Match scoring, churn prediction, and risk sentinel running on real data" },
    { val:"0",    label:"PII Exposed",       sub:"Privacy architecture validated — zero identifiable data crosses the donor-patient boundary" },
  ];
  return (
    <Slide glow="left">
      <SectionLabel>Traction</SectionLabel>
      <SlideHeading>Built in a hackathon.<br /><span style={{ color:"var(--crimson-light)" }}>Ready for the real world.</span></SlideHeading>
      <p style={{ fontSize:14, color:"rgba(255,255,255,0.6)", maxWidth:640, lineHeight:1.65, marginBottom:28 }}>
        What we achieved in 48 hours — and where we're headed next.
      </p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:i*0.08 }}
            whileHover={{ borderColor:"rgba(192,39,45,0.4)" }}
            style={{ background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)", borderRadius:16,
              padding:"24px 22px", display:"flex", gap:18, alignItems:"flex-start", transition:"border-color 0.2s" }}>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:36, color:"var(--crimson-light)", lineHeight:1, flexShrink:0 }}>{c.val}</div>
            <div>
              <div style={{ fontSize:14, color:"var(--text-main)", fontWeight:600, marginBottom:4 }}>{c.label}</div>
              <div style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.5 }}>{c.sub}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </Slide>
  );
}

function StackSlide() {
  const cols = [
    { title:"Frontend & Rural Reach", items:[
      { icon:"⚛️", name:"React + Vite",        role:"Hospital Admin Dashboard" },
      { icon:"📞", name:"Amazon Lex & Polly",  role:"Offline Voice IVR System" },
    ]},
    { title:"Backend Core", items:[
      { icon:"🐍", name:"FastAPI & Celery",    role:"Microservices architecture" },
      { icon:"🐋", name:"Docker Compose",      role:"Local isolated cluster" },
    ]},
    { title:"AI & Federated Learning", items:[
      { icon:"🛡️", name:"Flower (flwr)",       role:"Federated model aggregation" },
      { icon:"🧠", name:"PyTorch & XGBoost",   role:"LSTM forecasting & churn" },
    ]},
    { title:"Cloud Infrastructure", items:[
      { icon:"☁️", name:"AWS Bedrock",          role:"Nova Lite Story Engine" },
      { icon:"🐘", name:"PostgreSQL & Redis",   role:"Data & message brokering" },
    ]},
  ];
  return (
    <Slide glow="right">
      <SectionLabel>Technology</SectionLabel>
      <SlideHeading>Built to scale<br /><span style={{ color:"var(--crimson-light)" }}>from day one.</span></SlideHeading>
      <p style={{ fontSize:14, color:"rgba(255,255,255,0.6)", maxWidth:640, lineHeight:1.65, marginBottom:28 }}>
        A modern, privacy-first stack designed for healthcare-grade reliability.
      </p>
      <div style={{ display:"flex", gap:16 }}>
        {cols.map(col => (
          <div key={col.title} style={{ flex:1, display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:"0.12em", color:"var(--crimson-light)", textTransform:"uppercase", marginBottom:6 }}>{col.title}</div>
            {col.items.map(item => (
              <motion.div key={item.name} whileHover={{ borderColor:"rgba(192,39,45,0.4)" }}
                style={{ background:"rgba(255,255,255,0.04)", border:"1px solid var(--border)", borderRadius:12,
                  padding:14, display:"flex", alignItems:"center", gap:10, transition:"border-color 0.2s" }}>
                <div style={{ fontSize:18 }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize:13, color:"var(--text-main)", fontWeight:600 }}>{item.name}</div>
                  <div style={{ fontSize:11, color:"var(--text-muted)" }}>{item.role}</div>
                </div>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </Slide>
  );
}

function RoadmapSlide() {
  const phases = [
    { label:"Phase 1 · Now",       title:"Hackathon MVP",   items:[
      { t:"✓ 12-antigen matching engine", done:true },
      { t:"✓ AI churn predictor",         done:true },
      { t:"✓ Privacy architecture",       done:true },
      { t:"✓ Working prototype",          done:true },
    ]},
    { label:"Phase 2 · 3 months",  title:"Pilot — 1 City", items:[
      { t:"Partner with 2 thalassemia centres", done:false },
      { t:"Onboard 500 real patients",          done:false },
      { t:"Recruit 2,500 guardian donors",      done:false },
      { t:"Validate AI match accuracy",         done:false },
    ]},
    { label:"Phase 3 · 12 months", title:"State Rollout",   items:[
      { t:"5 cities, 20 hospitals",         done:false },
      { t:"10,000 patients onboarded",      done:false },
      { t:"Blood bank API integrations",    done:false },
      { t:"Government health portal tie-in",done:false },
    ]},
    { label:"Phase 4 · 24 months", title:"National Scale",  items:[
      { t:"All India coverage",          done:false },
      { t:"1.5L patients served",        done:false },
      { t:"SCD & rare blood groups",     done:false },
      { t:"Regional language support",   done:false },
    ]},
  ];
  return (
    <Slide glow="left">
      <SectionLabel>Roadmap</SectionLabel>
      <SlideHeading>From hackathon<br /><span style={{ color:"var(--crimson-light)" }}>to national lifeline.</span></SlideHeading>
      <p style={{ fontSize:14, color:"rgba(255,255,255,0.6)", maxWidth:640, lineHeight:1.65, marginBottom:28 }}>
        A phased rollout designed to validate fast, scale responsibly, and reach every patient who needs us.
      </p>
      <div style={{ display:"flex", gap:16 }}>
        {phases.map(ph => (
          <div key={ph.label} style={{ flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:"0.12em", color:"var(--crimson-light)", textTransform:"uppercase", marginBottom:4 }}>{ph.label}</div>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15, color:"var(--text-main)", marginBottom:14 }}>{ph.title}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {ph.items.map(item => (
                <div key={item.t} style={{
                  fontSize:12, padding:"9px 12px", background: item.done ? "rgba(39,174,96,0.06)" : "rgba(255,255,255,0.04)",
                  border:`1px solid ${item.done ? "rgba(39,174,96,0.2)" : "var(--border)"}`,
                  borderRadius:10, lineHeight:1.4, color: item.done ? "#4eca80" : "rgba(255,255,255,0.65)",
                }}>{item.t}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function CloseSlide() {
  return (
    <Slide glow="both">
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", textAlign:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, fontFamily:"var(--font-mono)", fontSize:10,
          letterSpacing:"0.15em", textTransform:"uppercase", color:"var(--crimson-light)", marginBottom:20 }}>
          <span style={{ width:24, height:2, background:"var(--crimson-light)", display:"inline-block" }} />
          Join the Mission
          <span style={{ width:24, height:2, background:"var(--crimson-light)", display:"inline-block" }} />
        </div>
        <motion.h2 initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:"clamp(40px, 5vw, 68px)",
            color:"var(--text-main)", lineHeight:1, marginBottom:6 }}>
          Every child deserves<br /><span style={{ color:"var(--crimson-light)" }}>a guardian.</span>
        </motion.h2>
        <p style={{ fontSize:16, color:"rgba(255,255,255,0.6)", maxWidth:520, lineHeight:1.7, margin:"0 auto 32px" }}>
          RakSetu is looking for hospital partners, NGO collaborators, and early believers who want to make lifelong blood access a reality in India.
        </p>
        <div style={{ display:"flex", gap:14, justifyContent:"center", marginBottom:36 }}>
          <button className="btn-crimson" style={{ padding:"14px 28px", fontSize:15 }}>🤝 Partner With Us</button>
          <button className="btn-ghost" style={{ padding:"13px 28px", fontSize:15 }}>📋 View Full Demo</button>
        </div>
        <div style={{ display:"flex", gap:28, justifyContent:"center" }}>
          {[
            ["Email", "team@raksetu.in"],
            ["Built at", "Hackathon 2026"],
            ["For", "Blood Warriors 🩸"],
          ].map(([k, v]) => (
            <div key={k} style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text-muted)" }}>
              {k}: <span style={{ color:"var(--text-main)" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

const SLIDE_COMPONENTS = [
  HeroSlide, ProblemSlide, SolutionSlide, AntigenSlide, GuardianSlide,
  TimelineSlide, PrivacySlide, AISlide, MarketSlide, TractionSlide,
  StackSlide, RoadmapSlide, CloseSlide,
];

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function About() {
  const [cur, setCur] = useState(0);
  const total = SLIDES.length;

  const goTo = (n: number) => setCur(((n % total) + total) % total);
  const prev = () => goTo(cur - 1);
  const next = () => goTo(cur + 1);

  // Keyboard navigation
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp")   prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cur]);

  const SlideComp = SLIDE_COMPONENTS[cur];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" }}>
      {/* Topbar */}
      <div className="topbar" style={{ flexShrink:0 }}>
        <div>
          <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700 }}>
            About RakSetu
          </div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
            Mission deck · {SLIDES[cur].label}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>
            {String(cur+1).padStart(2,"0")} / {String(total).padStart(2,"0")}
          </span>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>← → to navigate</span>
        </div>
      </div>

      {/* Slide area */}
      <div style={{ flex:1, minHeight:0, position:"relative" }}>
        <AnimatePresence mode="wait">
          <motion.div key={cur} initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x:-20 }} transition={{ duration:0.25 }}
            style={{ height:"100%" }}>
            <SlideComp />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Nav bar */}
      <div style={{ height:56, background:"rgba(4,12,28,0.97)", borderTop:"1px solid var(--border)",
        display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 32px", flexShrink:0 }}>
        <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:15, color:"var(--crimson-light)", letterSpacing:1 }}>RakSetu</span>

        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <button onClick={prev}
            style={{ width:36, height:36, borderRadius:"50%", border:"1px solid var(--border)", background:"rgba(255,255,255,0.06)",
              color:"var(--text-main)", fontSize:20, fontWeight:300, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            ‹
          </button>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => goTo(i)}
                style={{ width: i === cur ? 18 : 6, height:6, borderRadius: i===cur ? 3 : "50%",
                  background: i===cur ? "var(--crimson-light)" : "rgba(255,255,255,0.15)",
                  border:"none", cursor:"pointer", transition:"all 0.2s", padding:0 }} />
            ))}
          </div>
          <button onClick={next}
            style={{ width:36, height:36, borderRadius:"50%", border:"1px solid var(--border)", background:"rgba(255,255,255,0.06)",
              color:"var(--text-main)", fontSize:20, fontWeight:300, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            ›
          </button>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text-muted)", letterSpacing:1 }}>
            {String(cur+1).padStart(2,"0")} / {String(total).padStart(2,"0")}
          </span>
        </div>

        <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>← → or click to navigate</span>
      </div>
    </div>
  );
}
