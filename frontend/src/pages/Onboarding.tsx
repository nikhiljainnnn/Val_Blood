import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { authAPI } from "@/api/client";
import { useAuthStore } from "@/store";

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

// Demo synthetic antigen profile (simulates lab result)
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
      // Demo bypass
      setAuth("demo_donor_token", "donor", "demo_donor_1", form.name || "Demo Donor");
      navigate("/");
    } finally {
      setLoad(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#08080A", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 520 }}>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1 }}>
              <div style={{ height: 3, borderRadius: 2, background: i <= step ? "#C0272D" : "#1A1A20", transition: "background 0.3s" }} />
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: i === step ? "#E8554E" : "#444", marginTop: 6, letterSpacing: "0.08em" }}>
                {s.toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 36 }}>

            {/* Step 0: Personal info */}
            {step === 0 && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Join Blood Warriors</h2>
                <p style={{ color: "#666", fontFamily: "'Fraunces', serif", fontSize: 14, marginBottom: 28 }}>
                  You are about to become a guardian donor. Your information is secure and private.
                </p>
                {[
                  { label: "Full Name", key: "name", type: "text",     placeholder: "Ramesh Kumar" },
                  { label: "Phone",     key: "phone", type: "tel",     placeholder: "+91XXXXXXXXXX" },
                  { label: "Password",  key: "password", type: "password", placeholder: "Min. 8 characters" },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 6 }}>
                      {f.label.toUpperCase()}
                    </label>
                    <input type={f.type} placeholder={f.placeholder}
                      value={(form as any)[f.key]}
                      onChange={e => update(f.key, e.target.value)}
                      style={{ width: "100%", background: "#18181C", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "11px 14px", color: "#F0EEE8", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                ))}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 6 }}>CITY</label>
                  <select value={form.city} onChange={e => update("city", e.target.value)}
                    style={{ width: "100%", background: "#18181C", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "11px 14px", color: "#F0EEE8", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: "none" }}>
                    {CITY_OPTIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Step 1: Blood type */}
            {step === 1 && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Blood Type</h2>
                <p style={{ color: "#666", fontFamily: "'Fraunces', serif", fontSize: 14, marginBottom: 28 }}>
                  Select your ABO group and Rh factor. This is the first compatibility dimension.
                </p>
                <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 12 }}>ABO GROUP</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
                  {ABO_OPTIONS.map(abo => (
                    <button key={abo} onClick={() => update("abo", abo)}
                      style={{ padding: "16px 8px", borderRadius: 10, border: `2px solid ${form.abo === abo ? "#C0272D" : "rgba(255,255,255,0.08)"}`, background: form.abo === abo ? "rgba(192,39,45,0.12)" : "#18181C", color: form.abo === abo ? "#E8554E" : "#888", fontSize: 20, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                      {abo}
                    </button>
                  ))}
                </div>
                <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 12 }}>Rh FACTOR</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[true, false].map(pos => (
                    <button key={String(pos)} onClick={() => update("rh_d", pos)}
                      style={{ padding: "14px", borderRadius: 10, border: `2px solid ${form.rh_d === pos ? "#6366F1" : "rgba(255,255,255,0.08)"}`, background: form.rh_d === pos ? "rgba(99,102,241,0.12)" : "#18181C", color: form.rh_d === pos ? "#818CF8" : "#888", fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                      {pos ? "Rh+" : "Rh−"}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 20, padding: "12px 14px", background: "rgba(29,184,142,0.06)", borderRadius: 8, border: "1px solid rgba(29,184,142,0.15)" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#1DB88E" }}>
                    Selected: <strong>{form.abo}{form.rh_d ? "+" : "−"}</strong>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", marginTop: 4 }}>
                    Next step: extended phenotype (11 more antigens)
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Phenotype scan */}
            {step === 2 && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Extended Phenotype</h2>
                <p style={{ color: "#666", fontFamily: "'Fraunces', serif", fontSize: 14, marginBottom: 24 }}>
                  We scan 11 additional antigens (Kell, Duffy, Kidd, MNS, Rh CcEe) to prevent alloimmunization.
                </p>

                {!scanDone ? (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ width: 120, height: 120, border: "2px solid rgba(255,255,255,0.08)", borderRadius: 12, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>
                      🧬
                    </div>

                    {scanning ? (
                      <div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#1DB88E", marginBottom: 16 }}>Analyzing antigen profile...</div>
                        {["Rh system (C/c/E/e)", "Kell system (K/k)", "Duffy system (Fyᵃ/Fyᵇ)", "Kidd system (Jkᵃ/Jkᵇ)", "MNS system (M/N/S/s)"].map((s, i) => (
                          <motion.div key={s}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.5 }}
                            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                            <motion.span
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}>
                              ⬤
                            </motion.span>
                            {s}
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <button onClick={startScan}
                        style={{ padding: "14px 32px", borderRadius: 8, border: "1px solid rgba(29,184,142,0.4)", background: "rgba(29,184,142,0.08)", color: "#1DB88E", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
                        Scan Kit QR Code →
                      </button>
                    )}
                  </div>
                ) : (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                    <div style={{ padding: "16px", background: "rgba(29,184,142,0.06)", borderRadius: 10, border: "1px solid rgba(29,184,142,0.2)", marginBottom: 16, textAlign: "center" }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                      <div style={{ color: "#1DB88E", fontWeight: 700 }}>Profile Complete</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555", marginTop: 4 }}>
                        {form.abo}{form.rh_d ? "+" : "−"} · Rh: C−c+E−e+ · Kell: K−k+ · Duffy: Fyᵃ−Fyᵇ+ · Kidd: Jkᵃ+Jkᵇ−
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                      {[
                        { name: "Rh C",  val: false }, { name: "Rh c", val: true },
                        { name: "Rh E",  val: false }, { name: "Rh e", val: true },
                        { name: "Kell K", val: false },{ name: "Kell k", val: true },
                        { name: "Fyᵃ",  val: false }, { name: "Fyᵇ",  val: true },
                        { name: "Jkᵃ",  val: true },  { name: "Jkᵇ",  val: false },
                        { name: "MNS S", val: false }, { name: "MNS s", val: true },
                      ].map(ag => (
                        <div key={ag.name} style={{ padding: "8px", borderRadius: 6, background: "#18181C", border: `1px solid ${ag.val ? "rgba(29,184,142,0.2)" : "rgba(255,255,255,0.05)"}`, textAlign: "center" }}>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555" }}>{ag.name}</div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: ag.val ? "#1DB88E" : "#444" }}>
                            {ag.val ? "+" : "−"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Step 3: Preferences */}
            {step === 3 && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Preferences</h2>
                <p style={{ color: "#666", fontFamily: "'Fraunces', serif", fontSize: 14, marginBottom: 28 }}>
                  We'll communicate with you in your language, through the channel you prefer.
                </p>
                <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555", letterSpacing: "0.1em", marginBottom: 10 }}>PREFERRED LANGUAGE</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  {LANG_OPTIONS.map(l => (
                    <button key={l.code} onClick={() => update("language", l.code)}
                      style={{ padding: "12px 16px", borderRadius: 8, border: `1px solid ${form.language === l.code ? "rgba(192,39,45,0.4)" : "rgba(255,255,255,0.06)"}`, background: form.language === l.code ? "rgba(192,39,45,0.08)" : "#18181C", color: form.language === l.code ? "#E8554E" : "#888", textAlign: "left", cursor: "pointer", fontSize: 14, transition: "all 0.2s" }}>
                      {l.label}
                    </button>
                  ))}
                </div>
                <div style={{ padding: "14px", background: "rgba(99,102,241,0.06)", borderRadius: 8, border: "1px solid rgba(99,102,241,0.2)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#818CF8" }}>
                  You'll receive WhatsApp messages, and a voice call in {LANG_OPTIONS.find(l => l.code === form.language)?.label} as fallback.
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)}
                  style={{ flex: 1, padding: "13px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "'Syne', sans-serif" }}>
                  ← Back
                </button>
              )}
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => step < STEPS.length - 1 ? setStep(s => s + 1) : handleSubmit()}
                disabled={loading || (step === 2 && !scanDone)}
                style={{ flex: 2, padding: "13px", borderRadius: 8, border: "none", background: (step === 2 && !scanDone) ? "#1A1A20" : "#C0272D", color: (step === 2 && !scanDone) ? "#444" : "#fff", fontSize: 14, fontWeight: 700, cursor: (step === 2 && !scanDone) ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif", transition: "all 0.2s" }}>
                {loading ? "Creating account..." : step === STEPS.length - 1 ? "Complete Registration →" : "Next →"}
              </motion.button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
