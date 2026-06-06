import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Star, Heart, Award, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import StoryCard from "../components/StoryCard";

const DEMO_DONOR = {
  id: "demo-donor-001",
  name: "Ramesh Kumar",
  phone: "+919XXXXXXXXX",
  city: "Mumbai",
  language: "hi",
  abo: "B",
  rh_d: true,
  karma_score: 4750,
  lifetime_donations: 32,
  account_age_days: 847,
  last_donation_at: "2024-03-15",
  churn_risk: 0.12,
  guardian_circles: 3,     // how many patients they protect
  antigen_profile: {
    abo: "B", rh_d: true,
    rh_c: true, rh_C: false, rh_e: true, rh_E: false,
    kell_k: true, kell_K: false,
    duffy_fya: false, duffy_fyb: true,
    kidd_jka: true, kidd_jkb: false,
    mns_M: true, mns_N: false, mns_S: false, mns_s: true,
  }
};

const DEMO_DONATIONS = [
  { month: "Oct", donations: 1 }, { month: "Nov", donations: 2 },
  { month: "Dec", donations: 1 }, { month: "Jan", donations: 1 },
  { month: "Feb", donations: 2 }, { month: "Mar", donations: 1 },
];

const DEMO_STORIES = [
  { id: "s1", patient_initial: "A", donation_number: 32, story: "आपका 32वाँ donation एक 9 साल के बच्चे के लिए था जो पिछले हफ्ते पहली बार स्कूल में पहला नंबर आया। उसकी माँ कहती हैं — यह आपकी वजह से मुमकिन हुआ।", language: "hi", date: "Mar 15, 2024" },
  { id: "s2", patient_initial: "P", donation_number: 29, story: "Your donation #29 helped a young girl attend her sister's wedding — her first family celebration after 2 years of hospitalization.", language: "en", date: "Jan 22, 2024" },
  { id: "s3", patient_initial: "K", donation_number: 25, story: "आपका 25वाँ donation एक बच्चे को उसके जन्मदिन तक पहुँचाया — परिवार ने कहा यह उनकी सबसे बड़ी खुशी थी।", language: "hi", date: "Nov 8, 2023" },
];

const KARMA_TIERS = [
  { name: "Guardian",     min: 0,    max: 1000,  color: "#6366F1", icon: "🛡️" },
  { name: "Protector",    min: 1000, max: 3000,  color: "#8B5CF6", icon: "⚔️" },
  { name: "Lifesaver",    min: 3000, max: 6000,  color: "#E8552A", icon: "🔥" },
  { name: "Legend",       min: 6000, max: 99999, color: "#F59E0B", icon: "👑" },
];

function getCurrentTier(karma: number) {
  return KARMA_TIERS.find(t => karma >= t.min && karma < t.max) || KARMA_TIERS[0];
}

export default function DonorPortal() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [donor]  = useState(DEMO_DONOR);
  const [tab, setTab] = useState<"impact" | "profile" | "activity">("impact");

  const tier      = getCurrentTier(donor.karma_score);
  const nextTier  = KARMA_TIERS[KARMA_TIERS.indexOf(tier) + 1];
  const tierProg  = nextTier
    ? (donor.karma_score - tier.min) / (nextTier.min - tier.min)
    : 1.0;

  return (
    <div style={{ minHeight: "100vh", background: "#08080A", color: "#F0EEE8", fontFamily: "'Syne', sans-serif" }}>

      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16, background: "rgba(10,10,11,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <ArrowLeft size={16} /> Dashboard
        </button>
        <span style={{ color: "#333" }}>|</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Donor Portal — {donor.name}</span>
      </header>

      <main style={{ padding: "28px 32px", maxWidth: 900, margin: "0 auto" }}>

        {/* Hero card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "linear-gradient(135deg, #1A0A0C 0%, #12121A 100%)", border: "1px solid rgba(192,39,45,0.2)", borderRadius: 16, padding: 32, marginBottom: 24, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(192,39,45,0.08) 0%, transparent 70%)" }} />

          <div style={{ display: "flex", alignItems: "flex-start", gap: 20, position: "relative" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: `rgba(${tier.color.replace("#", "").match(/.{2}/g)?.map(h => parseInt(h, 16)).join(",")},0.15)`, border: `2px solid ${tier.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0 }}>
              {tier.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{donor.name}</h1>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: tier.color, background: `${tier.color}18`, border: `1px solid ${tier.color}40`, padding: "3px 10px", borderRadius: 4 }}>
                  {tier.name}
                </span>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#555", marginBottom: 20 }}>
                {donor.city} · B{donor.rh_d ? "+" : "−"} · {donor.guardian_circles} patients protected
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                {[
                  { label: "Karma",          value: donor.karma_score.toLocaleString(), icon: Star,  color: "#F59E0B" },
                  { label: "Donations",      value: donor.lifetime_donations,           icon: Droplets, color: "#E8554E" },
                  { label: "Circles",        value: donor.guardian_circles,            icon: Heart,  color: "#1DB88E" },
                  { label: "Days Active",    value: donor.account_age_days,            icon: Clock,  color: "#6366F1" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#444", marginTop: 2 }}>{label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Karma progress */}
          {nextTier && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555", marginBottom: 8 }}>
                <span>{tier.name} · {donor.karma_score.toLocaleString()} pts</span>
                <span>{nextTier.name} · {nextTier.min.toLocaleString()} pts</span>
              </div>
              <div style={{ height: 6, background: "#1A1A24", borderRadius: 3, overflow: "hidden" }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${tierProg * 100}%` }} transition={{ duration: 1.2, ease: "easeOut" }}
                  style={{ height: "100%", borderRadius: 3, background: `linear-gradient(to right, ${tier.color}, ${nextTier.color})` }} />
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#444", marginTop: 6 }}>
                {(nextTier.min - donor.karma_score).toLocaleString()} pts to {nextTier.name}
              </div>
            </div>
          )}
        </motion.div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#111113", padding: 4, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
          {(["impact", "profile", "activity"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: "10px", borderRadius: 7, border: "none", background: tab === t ? "#1A1A24" : "transparent", color: tab === t ? "#F0EEE8" : "#555", fontSize: 13, fontWeight: tab === t ? 600 : 400, cursor: "pointer", fontFamily: "'Syne', sans-serif", transition: "all 0.2s", textTransform: "capitalize" }}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab: Impact stories */}
        {tab === "impact" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", letterSpacing: "0.12em", marginBottom: 16 }}>
              IMPACT STORIES — YOUR DONATIONS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {DEMO_STORIES.map(s => <StoryCard key={s.id} story={s} />)}
            </div>
          </motion.div>
        )}

        {/* Tab: Profile */}
        {tab === "profile" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Extended Antigen Profile</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                { name: "ABO",    val: donor.antigen_profile.abo },
                { name: "Rh D",  val: donor.antigen_profile.rh_d ? "+" : "−" },
                { name: "Rh C",  val: donor.antigen_profile.rh_C ? "+" : "−" },
                { name: "Rh c",  val: donor.antigen_profile.rh_c ? "+" : "−" },
                { name: "Rh E",  val: donor.antigen_profile.rh_E ? "+" : "−" },
                { name: "Rh e",  val: donor.antigen_profile.rh_e ? "+" : "−" },
                { name: "Kell K",val: donor.antigen_profile.kell_K ? "+" : "−" },
                { name: "Kell k",val: donor.antigen_profile.kell_k ? "+" : "−" },
                { name: "Fyᵃ",  val: donor.antigen_profile.duffy_fya ? "+" : "−" },
                { name: "Fyᵇ",  val: donor.antigen_profile.duffy_fyb ? "+" : "−" },
                { name: "Jkᵃ",  val: donor.antigen_profile.kidd_jka ? "+" : "−" },
                { name: "Jkᵇ",  val: donor.antigen_profile.kidd_jkb ? "+" : "−" },
                { name: "MNS M", val: donor.antigen_profile.mns_M ? "+" : "−" },
                { name: "MNS N", val: donor.antigen_profile.mns_N ? "+" : "−" },
                { name: "MNS S", val: donor.antigen_profile.mns_S ? "+" : "−" },
                { name: "MNS s", val: donor.antigen_profile.mns_s ? "+" : "−" },
              ].map(ag => (
                <div key={ag.name} style={{ padding: "14px 10px", borderRadius: 8, background: "#18181C", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", marginBottom: 6 }}>{ag.name}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: ag.val === "+" || !["−"].includes(ag.val) ? "#1DB88E" : "#444" }}>
                    {ag.val}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Tab: Activity */}
        {tab === "activity" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 24, marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Donation History (Last 6 Months)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={DEMO_DONATIONS} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fill: "#555", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#18181C", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
                  <Bar dataKey="donations" radius={[4, 4, 0, 0]}>
                    {DEMO_DONATIONS.map((_, i) => (
                      <Cell key={i} fill={i === DEMO_DONATIONS.length - 1 ? "#C0272D" : "#6366F1"} fillOpacity={0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Milestones</h3>
              {[
                { icon: "🏆", label: "30 donations",      date: "Feb 2024", color: "#F59E0B" },
                { icon: "🌟", label: "Lifesaver tier",    date: "Jan 2024", color: "#E8554E" },
                { icon: "💎", label: "2-year streak",     date: "Dec 2023", color: "#6366F1" },
                { icon: "❤️", label: "3 circles joined", date: "Oct 2023", color: "#1DB88E" },
              ].map(m => (
                <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 20 }}>{m.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{m.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#444" }}>{m.date}</span>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color }} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
