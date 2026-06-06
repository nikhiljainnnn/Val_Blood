import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Star, Heart, Award, Clock, TrendingUp, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import StoryCard from "../components/StoryCard";
import ParticleBackground from "../components/ParticleBackground";
import "../index.css";

const DEMO_DONOR = {
  id:"demo-donor-001", name:"Ramesh Kumar", phone:"+919XXXXXXXXX",
  city:"Mumbai", language:"hi", abo:"B", rh_d:true,
  karma_score:4750, lifetime_donations:32, account_age_days:847,
  last_donation_at:"2024-03-15", churn_risk:0.12, guardian_circles:3,
  antigen_profile:{
    abo:"B", rh_d:true, rh_c:true, rh_C:false, rh_e:true, rh_E:false,
    kell_k:true, kell_K:false, duffy_fya:false, duffy_fyb:true,
    kidd_jka:true, kidd_jkb:false, mns_M:true, mns_N:false, mns_S:false, mns_s:true,
  },
};

const DEMO_DONATIONS = [
  { month:"Oct",donations:1 },{ month:"Nov",donations:2 },
  { month:"Dec",donations:1 },{ month:"Jan",donations:1 },
  { month:"Feb",donations:2 },{ month:"Mar",donations:1 },
];

const DEMO_STORIES = [
  { id:"s1", patient_initial:"A", donation_number:32, story:"आपका 32वाँ donation एक 9 साल के बच्चे के लिए था जो पिछले हफ्ते पहली बार स्कूल में पहला नंबर आया। उसकी माँ कहती हैं — यह आपकी वजह से मुमकिन हुआ।", language:"hi", date:"Mar 15, 2024" },
  { id:"s2", patient_initial:"P", donation_number:29, story:"Your donation #29 helped a young girl attend her sister's wedding — her first family celebration after 2 years of hospitalization.", language:"en", date:"Jan 22, 2024" },
  { id:"s3", patient_initial:"K", donation_number:25, story:"आपका 25वाँ donation एक बच्चे को उसके जन्मदिन तक पहुँचाया — परिवार ने कहा यह उनकी सबसे बड़ी खुशी थी।", language:"hi", date:"Nov 8, 2023" },
];

const KARMA_TIERS = [
  { name:"Guardian",  min:0,    max:1000,  color:"#6366F1", icon:"🛡️" },
  { name:"Protector", min:1000, max:3000,  color:"#8B5CF6", icon:"⚔️" },
  { name:"Lifesaver", min:3000, max:6000,  color:"#E8554E", icon:"🔥" },
  { name:"Legend",    min:6000, max:99999, color:"#F59E0B", icon:"👑" },
];

function getCurrentTier(karma:number) {
  return KARMA_TIERS.find(t => karma >= t.min && karma < t.max) || KARMA_TIERS[0];
}

const ANTIGEN_LIST = [
  {name:"ABO",    val:"B"},    {name:"Rh D",  val:"+"},
  {name:"Rh C",  val:"−"},    {name:"Rh c",  val:"+"},
  {name:"Rh E",  val:"−"},    {name:"Rh e",  val:"+"},
  {name:"Kell K",val:"−"},    {name:"Kell k",val:"+"},
  {name:"Fyᵃ",   val:"−"},    {name:"Fyᵇ",   val:"+"},
  {name:"Jkᵃ",   val:"+"},    {name:"Jkᵇ",   val:"−"},
  {name:"MNS M", val:"+"},    {name:"MNS N", val:"−"},
  {name:"MNS S", val:"−"},    {name:"MNS s", val:"+"},
];

const MILESTONES = [
  { icon:"🏆", label:"30 donations",   date:"Feb 2024", color:"#F59E0B" },
  { icon:"🌟", label:"Lifesaver tier", date:"Jan 2024", color:"#E8554E" },
  { icon:"💎", label:"2-year streak",  date:"Dec 2023", color:"#6366F1" },
  { icon:"❤️", label:"3 circles",      date:"Oct 2023", color:"#1DB88E" },
];

export default function DonorPortal() {
  const navigate = useNavigate();
  const [donor]  = useState(DEMO_DONOR);
  const [tab, setTab] = useState<"impact"|"profile"|"activity">("impact");

  const tier     = getCurrentTier(donor.karma_score);
  const nextTier = KARMA_TIERS[KARMA_TIERS.indexOf(tier) + 1];
  const tierProg = nextTier ? (donor.karma_score - tier.min) / (nextTier.min - tier.min) : 1.0;

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
          <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:15 }}>
            Donor Portal — {donor.name}
          </span>
        </div>
        <div style={{
          display:"flex", alignItems:"center", gap:6,
          fontFamily:"'JetBrains Mono',monospace", fontSize:10,
          color: tier.color, background:`${tier.color}18`,
          border:`1px solid ${tier.color}35`, borderRadius:8, padding:"5px 12px",
        }}>
          {tier.icon} {tier.name.toUpperCase()} TIER
        </div>
      </header>

      <main style={{ padding:"28px 32px", maxWidth:960, margin:"0 auto", position:"relative", zIndex:1 }}>

        {/* ── HERO CARD ── */}
        <motion.div
          initial={{ opacity:0, y:20 }}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.5, ease:[0.4,0,0.2,1] }}
          style={{
            background:"linear-gradient(135deg, rgba(20,8,10,0.95) 0%, rgba(18,18,26,0.9) 100%)",
            border:`1px solid ${tier.color}30`,
            borderRadius:20, padding:32, marginBottom:24,
            position:"relative", overflow:"hidden",
            backdropFilter:"blur(16px)",
            boxShadow:`0 0 60px ${tier.color}10`,
          }}
        >
          {/* Background glows */}
          <div style={{
            position:"absolute", top:-80, right:-80,
            width:300, height:300, borderRadius:"50%",
            background:`radial-gradient(circle, ${tier.color}12 0%, transparent 70%)`,
            pointerEvents:"none", animation:"glow-pulse 4s ease-in-out infinite",
          }} />
          <div style={{
            position:"absolute", bottom:-60, left:0,
            width:200, height:200, borderRadius:"50%",
            background:"radial-gradient(circle, rgba(192,39,45,0.06) 0%, transparent 70%)",
            pointerEvents:"none",
          }} />

          <div style={{ display:"flex", alignItems:"flex-start", gap:22, position:"relative" }}>
            {/* Avatar */}
            <motion.div
              animate={{ boxShadow:["0 0 0 0 transparent","0 0 20px rgba(255,255,255,0.05)","0 0 0 0 transparent"] }}
              transition={{ duration:3, repeat:Infinity }}
              style={{
                width:76, height:76, borderRadius:20,
                background:`linear-gradient(135deg, ${tier.color}25, ${tier.color}10)`,
                border:`2px solid ${tier.color}50`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:34, flexShrink:0,
              }}
            >
              {tier.icon}
            </motion.div>

            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
                <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, margin:0, letterSpacing:"-0.02em" }}>
                  {donor.name}
                </h1>
                <span style={{
                  fontFamily:"'JetBrains Mono',monospace", fontSize:10,
                  color: tier.color, background:`${tier.color}18`,
                  border:`1px solid ${tier.color}35`, padding:"3px 10px", borderRadius:5,
                  letterSpacing:"0.08em",
                }}>
                  {tier.name.toUpperCase()}
                </span>
              </div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#555", marginBottom:22 }}>
                {donor.city} · {donor.abo}{donor.rh_d?"+":"−"} · {donor.guardian_circles} patients protected
              </div>

              {/* Stat row */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:18 }}>
                {[
                  { label:"KARMA PTS", value:donor.karma_score.toLocaleString(), icon:Star,        color:"#F59E0B" },
                  { label:"DONATIONS", value:donor.lifetime_donations,            icon:Heart,       color:"#E8554E" },
                  { label:"CIRCLES",   value:donor.guardian_circles,             icon:Award,       color:"#1DB88E" },
                  { label:"DAYS ACTIVE",value:donor.account_age_days,            icon:Clock,       color:"#6366F1" },
                ].map(({ label, value, icon:Icon, color }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity:0, y:8 }}
                    animate={{ opacity:1, y:0 }}
                    transition={{ delay:0.1 + i*0.07 }}
                    style={{ textAlign:"center" }}
                  >
                    <div style={{
                      width:32, height:32, borderRadius:8,
                      background:`${color}15`, border:`1px solid ${color}25`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      margin:"0 auto 8px",
                    }}>
                      <Icon size={14} style={{ color }} />
                    </div>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color, lineHeight:1 }}>
                      {value}
                    </div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#444", marginTop:3, letterSpacing:"0.1em" }}>
                      {label}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Karma progress bar */}
          {nextTier && (
            <div style={{ marginTop:24, paddingTop:20, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#555", marginBottom:8 }}>
                <span style={{ color: tier.color }}>{tier.name} · {donor.karma_score.toLocaleString()} pts</span>
                <span>{nextTier.name} · {nextTier.min.toLocaleString()} pts</span>
              </div>
              <div className="progress-track">
                <motion.div
                  initial={{ width:0 }}
                  animate={{ width:`${tierProg*100}%` }}
                  transition={{ duration:1.4, ease:"easeOut", delay:0.4 }}
                  style={{
                    height:"100%", borderRadius:3,
                    background:`linear-gradient(to right, ${tier.color}, ${nextTier.color})`,
                    boxShadow:`0 0 8px ${tier.color}60`,
                  }}
                />
              </div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#444", marginTop:6 }}>
                {(nextTier.min - donor.karma_score).toLocaleString()} pts to {nextTier.name}
              </div>
            </div>
          )}
        </motion.div>

        {/* ── TABS ── */}
        <div className="tabs-container" style={{ marginBottom:20 }}>
          {(["impact","profile","activity"] as const).map(t => (
            <button
              key={t}
              className={`tab-btn ${tab===t?"active":""}`}
              onClick={() => setTab(t)}
            >
              {t==="impact" ? "💫 Impact Stories" : t==="profile" ? "🧬 Antigen Profile" : "📊 Activity"}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity:0, y:10 }}
            animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-10 }}
            transition={{ duration:0.25 }}
          >
            {/* IMPACT TAB */}
            {tab === "impact" && (
              <div>
                <div className="section-label">IMPACT STORIES — YOUR DONATIONS</div>
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  {DEMO_STORIES.map((s, i) => (
                    <motion.div
                      key={s.id}
                      initial={{ opacity:0, x:-12 }}
                      animate={{ opacity:1, x:0 }}
                      transition={{ delay:i*0.1 }}
                    >
                      <StoryCard story={s} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* PROFILE TAB */}
            {tab === "profile" && (
              <div
                style={{
                  background:"rgba(14,14,20,0.8)", backdropFilter:"blur(16px)",
                  border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:24,
                }}
              >
                <div className="section-label">EXTENDED ANTIGEN PROFILE</div>
                <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, marginBottom:20 }}>
                  12-Antigen Blood Type Map
                </h3>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                  {ANTIGEN_LIST.map((ag, i) => (
                    <motion.div
                      key={ag.name}
                      initial={{ opacity:0, scale:0.9 }}
                      animate={{ opacity:1, scale:1 }}
                      transition={{ delay:i*0.04 }}
                      className={`antigen-cell ${(ag.val === "+" || (ag.val !== "−" && ag.val.length === 1)) ? "positive" : ""}`}
                    >
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#555", marginBottom:6, letterSpacing:"0.08em" }}>
                        {ag.name}
                      </div>
                      <div style={{
                        fontFamily:"'JetBrains Mono',monospace", fontSize:18, fontWeight:700,
                        color: ag.val === "+" ? "#1DB88E" : ag.val === "−" ? "#333" : "#E8554E",
                      }}>
                        {ag.val}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Churn risk indicator */}
                <div style={{ marginTop:24, padding:"16px 20px", background:"rgba(29,184,142,0.04)", border:"1px solid rgba(29,184,142,0.15)", borderRadius:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#1DB88E", letterSpacing:"0.12em", marginBottom:4 }}>
                        CHURN RISK SCORE
                      </div>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"#1DB88E" }}>
                        {Math.round(donor.churn_risk * 100)}% risk
                      </div>
                    </div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#555", textAlign:"right" }}>
                      XGBoost model<br />Updated daily
                    </div>
                  </div>
                  <div style={{ marginTop:12 }} className="progress-track">
                    <motion.div
                      initial={{ width:0 }}
                      animate={{ width:`${donor.churn_risk*100}%` }}
                      transition={{ duration:1, ease:"easeOut", delay:0.3 }}
                      style={{
                        height:"100%", borderRadius:3,
                        background:"linear-gradient(90deg, #1DB88E, #27ae60)",
                        boxShadow:"0 0 8px rgba(29,184,142,0.4)",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ACTIVITY TAB */}
            {tab === "activity" && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {/* Chart */}
                <div style={{
                  background:"rgba(14,14,20,0.8)", backdropFilter:"blur(16px)",
                  border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:24,
                }}>
                  <div className="section-label">DONATION HISTORY</div>
                  <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, marginBottom:20 }}>
                    Last 6 Months
                  </h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={DEMO_DONATIONS} margin={{ top:0, right:0, left:-20, bottom:0 }}>
                      <XAxis dataKey="month" tick={{ fill:"#555", fontSize:11, fontFamily:"'JetBrains Mono',monospace" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill:"#555", fontSize:11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background:"#14141A", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}
                        cursor={{ fill:"rgba(255,255,255,0.02)" }}
                      />
                      <Bar dataKey="donations" radius={[5,5,0,0]}>
                        {DEMO_DONATIONS.map((_, i) => (
                          <Cell key={i} fill={i===DEMO_DONATIONS.length-1 ? "#C0272D" : "#6366F1"} fillOpacity={0.75} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Milestones */}
                <div style={{
                  background:"rgba(14,14,20,0.8)", backdropFilter:"blur(16px)",
                  border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:24,
                }}>
                  <div className="section-label">ACHIEVEMENTS</div>
                  <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, marginBottom:16 }}>
                    Milestones Unlocked
                  </h3>
                  {MILESTONES.map((m, i) => (
                    <motion.div
                      key={m.label}
                      initial={{ opacity:0, x:-12 }}
                      animate={{ opacity:1, x:0 }}
                      transition={{ delay:i*0.08 }}
                      style={{
                        display:"flex", alignItems:"center", gap:14,
                        padding:"13px 0", borderBottom:i<MILESTONES.length-1?"1px solid rgba(255,255,255,0.04)":"none",
                      }}
                    >
                      <div style={{
                        width:40, height:40, borderRadius:10,
                        background:`${m.color}12`, border:`1px solid ${m.color}25`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:20, flexShrink:0,
                      }}>
                        {m.icon}
                      </div>
                      <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{m.label}</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#444" }}>{m.date}</span>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:m.color, boxShadow:`0 0 8px ${m.color}` }} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
