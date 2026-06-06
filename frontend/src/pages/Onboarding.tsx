import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { authAPI } from "@/api/client";
import { useAuthStore } from "@/store";
import ParticleBackground from "@/components/ParticleBackground";
import "../../src/index.css";

const STEPS = ["Personal Info", "Blood Type", "Phenotype Scan", "Preferences"];

const ABO_OPTIONS = ["A", "B", "AB", "O"];
const CITY_OPTIONS = ["Mumbai", "Delhi", "Bengaluru", "Chennai", "Hyderabad", "Pune", "Ahmedabad", "Kolkata"];
const LANG_OPTIONS = [
  { code: "hi", label: "हिंदी (Hindi)" },
  { code: "ta", label: "தமிழ் (Tamil)" },
  { code: "te", label: "తెలుగు (Telugu)" },
  { code: "bn", label: "বাংলা (Bengali)" },
  { code: "en", label: "English" },
  { code: "mr", label: "मराठी (Marathi)" },
];

const DEMO_PROFILE = {
  abo: "B", rh_d: true,
  rh_c: true, rh_C: false, rh_e: true, rh_E: false,
  kell_k: true, kell_K: false,
  duffy_fya: false, duffy_fyb: true,
  kidd_jka: true, kidd_jkb: false,
  mns_M: true, mns_N: false, mns_S: false, mns_s: true,
};

export default function Onboarding() {
  const navigate = useNavigate();
  const setAuth  = useAuthStore(s => s.setAuth);

  const [step,   setStep]   = useState(0);
  const [scanning, setScan] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [loading, setLoad]  = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "+91", city: "Mumbai", password: "",
    abo: "B", rh_d: true, language: "hi",
    profile: DEMO_PROFILE,
  });

  const update = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const startScan = () => {
    setScan(true);
    setTimeout(() => { setScan(false); setScanDone(true); }, 3200);
  };

  const handleSubmit = async () => {
    setLoad(true);
    try {
      const body = {
        name: form.name, phone: form.phone,
        language: form.language, city: form.city.toLowerCase(),
        password: form.password || "demo1234",
        antigen_profile: { ...form.profile, abo: form.abo, rh_d: form.rh_d },
      };
      const res = await authAPI.registerDonor(body);
      setAuth(res.data.access_token, "donor", res.data.user_id, form.name);
      navigate("/donor/" + res.data.user_id);
    } catch {
      setAuth("demo_donor_token", "donor", "demo_donor_1", form.name || "Demo Donor");
      navigate("/");
    } finally {
      setLoad(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#08080A", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: 24, position: "relative" }}>
      <ParticleBackground />

      <div style={{ width: "100%", maxWidth: 540, position: "relative", zIndex: 10 }}>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 10, marginBottom: 36 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1 }}>
              <div style={{ height: 4, borderRadius: 2, background: i <= step ? "linear-gradient(90deg, #C0272D, #E8554E)" : "rgba(255,255,255,0.08)", transition: "all 0.4s", boxShadow: i <= step ? "0 0 12px rgba(192,39,45,0.4)" : "none" }} />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: i === step ? "#F0EEE8" : "#555", marginTop: 8, letterSpacing: "0.08em", fontWeight: i === step ? 600 : 400 }}>
                {s.toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step}
            initial={{ opacity: 0, x: 20, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
            style={{
              background: "rgba(14,14,20,0.85)", backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 40,
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)", position: "relative", overflow: "hidden",
            }}>

            {/* Step 0: Personal info */}
            {step === 0 && (
              <div>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#F0EEE8", letterSpacing: "-0.02em" }}>Join Blood Warriors</h2>
                <p style={{ color: "#888", fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
                  You are about to become a guardian donor. Your information is secure and private.
                </p>
                {[
                  { label: "Full Name", key: "name", type: "text",     placeholder: "Ramesh Kumar" },
                  { label: "Phone",     key: "phone", type: "tel",     placeholder: "+91XXXXXXXXXX" },
                  { label: "Password",  key: "password", type: "password", placeholder: "Min. 8 characters" },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: 18 }}>
                    <label className="input-label">{f.label}</label>
                    <input type={f.type} placeholder={f.placeholder}
                      value={(form as any)[f.key]}
                      onChange={e => update(f.key, e.target.value)}
                      className="input-field"
                    />
                  </div>
                ))}
                <div style={{ marginBottom: 18 }}>
                  <label className="input-label">CITY</label>
                  <select value={form.city} onChange={e => update("city", e.target.value)} className="input-field">
                    {CITY_OPTIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Step 1: Blood type */}
            {step === 1 && (
              <div>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#F0EEE8", letterSpacing: "-0.02em" }}>Blood Type</h2>
                <p style={{ color: "#888", fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
                  Select your ABO group and Rh factor. This is the first compatibility dimension.
                </p>
                <label className="input-label">ABO GROUP</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
                  {ABO_OPTIONS.map(abo => (
                    <button key={abo} onClick={() => update("abo", abo)}
                      style={{
                        padding: "18px 8px", borderRadius: 12,
                        border: `2px solid ${form.abo === abo ? "#C0272D" : "rgba(255,255,255,0.06)"}`,
                        background: form.abo === abo ? "rgba(192,39,45,0.12)" : "rgba(255,255,255,0.02)",
                        color: form.abo === abo ? "#E8554E" : "#888",
                        fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800,
                        cursor: "pointer", transition: "all 0.2s",
                        boxShadow: form.abo === abo ? "0 8px 24px rgba(192,39,45,0.2)" : "none",
                      }}>
                      {abo}
                    </button>
                  ))}
                </div>
                <label className="input-label">Rh FACTOR</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[true, false].map(pos => (
                    <button key={String(pos)} onClick={() => update("rh_d", pos)}
                      style={{
                        padding: "16px", borderRadius: 12,
                        border: `2px solid ${form.rh_d === pos ? "#6366F1" : "rgba(255,255,255,0.06)"}`,
                        background: form.rh_d === pos ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.02)",
                        color: form.rh_d === pos ? "#818CF8" : "#888",
                        fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700,
                        cursor: "pointer", transition: "all 0.2s",
                        boxShadow: form.rh_d === pos ? "0 8px 24px rgba(99,102,241,0.2)" : "none",
                      }}>
                      {pos ? "Rh+" : "Rh−"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Phenotype scan */}
            {step === 2 && (
              <div>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#F0EEE8", letterSpacing: "-0.02em" }}>Extended Phenotype</h2>
                <p style={{ color: "#888", fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
                  We scan 11 additional antigens (Kell, Duffy, Kidd, MNS, Rh CcEe) to prevent alloimmunization.
                </p>

                {!scanDone ? (
                  <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <div style={{
                      width: 140, height: 140, borderRadius: 24, margin: "0 auto 32px",
                      background: "rgba(29,184,142,0.05)", border: "2px dashed rgba(29,184,142,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56,
                      position: "relative",
                    }}>
                      🧬
                      {scanning && (
                        <div style={{ position: "absolute", inset: -2, border: "2px solid #1DB88E", borderRadius: 24, animation: "border-spin 2s linear infinite" }} />
                      )}
                    </div>

                    {scanning ? (
                      <div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#1DB88E", marginBottom: 20, letterSpacing: "0.1em" }}>ANALYZING ANTIGEN PROFILE...</div>
                        {["Rh system (C/c/E/e)", "Kell system (K/k)", "Duffy system (Fyᵃ/Fyᵇ)", "Kidd system (Jkᵃ/Jkᵇ)", "MNS system (M/N/S/s)"].map((s, i) => (
                          <motion.div key={s}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.5 }}
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#888", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                            <motion.span animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }} transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }} style={{ color: "#1DB88E" }}>
                              ⬤
                            </motion.span>
                            {s}
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <button onClick={startScan} className="btn-ghost" style={{ padding: "16px 36px", fontSize: 15, color: "#1DB88E", borderColor: "rgba(29,184,142,0.4)" }}>
                        Scan Kit QR Code →
                      </button>
                    )}
                  </div>
                ) : (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                    <div style={{ padding: "20px", background: "rgba(29,184,142,0.08)", borderRadius: 16, border: "1px solid rgba(29,184,142,0.25)", marginBottom: 24, textAlign: "center" }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
                      <div style={{ color: "#1DB88E", fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800 }}>Profile Complete</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#888", marginTop: 8 }}>
                        {form.abo}{form.rh_d ? "+" : "−"} · Rh: C−c+E−e+ · Kell: K−k+<br />Duffy: Fyᵃ−Fyᵇ+ · Kidd: Jkᵃ+Jkᵇ−
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                      {[
                        { name: "Rh C",  val: false }, { name: "Rh c", val: true },
                        { name: "Rh E",  val: false }, { name: "Rh e", val: true },
                        { name: "Kell K", val: false },{ name: "Kell k", val: true },
                        { name: "Fyᵃ",  val: false }, { name: "Fyᵇ",  val: true },
                        { name: "Jkᵃ",  val: true },  { name: "Jkᵇ",  val: false },
                        { name: "MNS S", val: false }, { name: "MNS s", val: true },
                      ].map((ag, i) => (
                        <motion.div key={ag.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                          className={`antigen-cell ${ag.val ? "positive" : ""}`}>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555" }}>{ag.name}</div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: ag.val ? "#1DB88E" : "#444" }}>
                            {ag.val ? "+" : "−"}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Step 3: Preferences */}
            {step === 3 && (
              <div>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#F0EEE8", letterSpacing: "-0.02em" }}>Preferences</h2>
                <p style={{ color: "#888", fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
                  We'll communicate with you in your language, through the channel you prefer.
                </p>
                <label className="input-label">PREFERRED LANGUAGE</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                  {LANG_OPTIONS.map(l => (
                    <button key={l.code} onClick={() => update("language", l.code)}
                      style={{
                        padding: "16px 20px", borderRadius: 12,
                        border: `1px solid ${form.language === l.code ? "rgba(192,39,45,0.4)" : "rgba(255,255,255,0.06)"}`,
                        background: form.language === l.code ? "rgba(192,39,45,0.08)" : "rgba(255,255,255,0.02)",
                        color: form.language === l.code ? "#E8554E" : "#888",
                        textAlign: "left", cursor: "pointer", fontSize: 15, fontFamily: "'DM Sans', sans-serif", fontWeight: form.language === l.code ? 600 : 400,
                        transition: "all 0.2s"
                      }}>
                      {l.label}
                    </button>
                  ))}
                </div>
                <div className="alert-indigo">
                  <span style={{ color: "#818CF8", fontWeight: 600 }}>Communication: </span>
                  You'll receive WhatsApp messages, and a voice call in {LANG_OPTIONS.find(l => l.code === form.language)?.label} as fallback.
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: "flex", gap: 16, marginTop: 40 }}>
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: "16px" }}>
                  ← Back
                </button>
              )}
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => step < STEPS.length - 1 ? setStep(s => s + 1) : handleSubmit()}
                disabled={loading || (step === 2 && !scanDone)}
                className="btn-crimson"
                style={{
                  flex: 2, justifyContent: "center", padding: "16px", fontSize: 15,
                  opacity: (step === 2 && !scanDone) ? 0.5 : 1, cursor: (step === 2 && !scanDone) ? "not-allowed" : "pointer"
                }}>
                {loading ? "Creating account..." : step === STEPS.length - 1 ? "Complete Registration →" : "Next Step →"}
              </motion.button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
