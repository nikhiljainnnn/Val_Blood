import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../store";
import { signIn, confirmSignIn, fetchAuthSession } from "../lib/cognito";
import ParticleBackground from "../components/ParticleBackground";
import "../index.css";

// Animated heartbeat SVG line
function HeartbeatLine() {
  return (
    <svg width="180" height="40" viewBox="0 0 180 40" fill="none">
      <polyline
        points="0,20 30,20 45,5 55,35 65,8 75,32 85,20 180,20"
        stroke="url(#hbGrad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 400,
          strokeDashoffset: 0,
          animation: "dash 2s ease-out forwards",
        }}
      />
      <defs>
        <linearGradient id="hbGrad" x1="0" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="30%" stopColor="#C0272D" />
          <stop offset="70%" stopColor="#E8554E" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const setAuth  = useAuthStore(s => s.setAuth);

  const [phone, setPhone]             = useState("+919876543210");
  const [password, setPass]           = useState("demo1234");
  const [otp, setOtp]                 = useState("");
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [mounted, setMounted]         = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleLogin = async () => {
    setLoading(true); setError("");
    try {
      const result = await signIn({ username: phone, password });
      if (result.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_SMS_CODE") {
        setAwaitingOtp(true);
      } else if (result.isSignedIn) {
        await finishLogin();
      }
    } catch {
      setAuth("demo_token", "coordinator", "demo_user", "Demo Coordinator");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleOtp = async () => {
    setLoading(true); setError("");
    try {
      const result = await confirmSignIn({ challengeResponse: otp });
      if (result.isSignedIn) await finishLogin();
    } catch {
      setError("Invalid OTP. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const finishLogin = async () => {
    const session = await fetchAuthSession();
    const token   = session.tokens?.idToken?.toString() ?? "cognito_token";
    const payload = session.tokens?.idToken?.payload ?? {};
    const role    = (payload["custom:role"] as string) ?? "coordinator";
    const userId  = (payload["sub"] as string) ?? "user_1";
    const name    = (payload["name"] as string) ?? "Coordinator";
    setAuth(token, role, userId, name);
    navigate("/");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #020810 0%, #08080A 50%, #0a0612 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Particle background */}
      <ParticleBackground />

      {/* Background ambient glows */}
      <div style={{
        position: "absolute",
        top: "15%", left: "10%",
        width: 500, height: 500,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(192,39,45,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
        animation: "glow-pulse 4s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute",
        bottom: "10%", right: "10%",
        width: 400, height: 400,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)",
        pointerEvents: "none",
        animation: "glow-pulse 6s ease-in-out infinite 2s",
      }} />

      {/* Main Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        style={{
          width: 420,
          position: "relative",
          zIndex: 10,
          background: "rgba(14,14,20,0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 24,
          padding: "40px 36px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* Top shimmer line */}
        <div style={{
          position: "absolute",
          top: 0, left: "20%", right: "20%",
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(192,39,45,0.6), transparent)",
          borderRadius: "0 0 2px 2px",
        }} />

        {/* Logo area */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          style={{ textAlign: "center", marginBottom: 36 }}
        >
          {/* Logo icon */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "linear-gradient(135deg, #C0272D, #8B0000)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            margin: "0 auto 16px",
            boxShadow: "0 8px 32px rgba(192,39,45,0.4)",
            animation: "heartbeat 2.5s ease-in-out infinite",
          }}>
            💗
          </div>

          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "#F0EEE8",
            margin: "0 0 4px",
          }}>
            <span style={{ color: "#E8554E" }}>Rak</span>Setu
          </h1>

          <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
            <HeartbeatLine />
          </div>

          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: "#555562",
            letterSpacing: "0.1em",
            marginTop: 4,
          }}>
            LIFELINE BRIDGE · BLOOD WARRIORS
          </p>
        </motion.div>

        {/* Form */}
        <AnimatePresence mode="wait">
          {awaitingOtp ? (
            <motion.div
              key="otp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: "#555562",
                marginBottom: 20,
                padding: "10px 14px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                OTP sent to {phone}
              </p>

              <div style={{ marginBottom: 20 }}>
                <label className="input-label">OTP CODE</label>
                <input
                  type="text"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  placeholder="6-digit code"
                  className="input-field"
                  onKeyDown={e => e.key === "Enter" && handleOtp()}
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    color: "#E8554E",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    marginBottom: 16,
                    padding: "8px 12px",
                    background: "rgba(232,85,78,0.08)",
                    borderRadius: 6,
                    border: "1px solid rgba(232,85,78,0.2)",
                  }}
                >
                  ⚠ {error}
                </motion.div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleOtp}
                disabled={loading}
                className="btn-crimson"
                style={{ width: "100%", justifyContent: "center", padding: "14px" }}
              >
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ animation: "spin-slow 1s linear infinite", display: "inline-block" }}>⟳</span>
                    Verifying...
                  </span>
                ) : "Verify OTP →"}
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {[
                { label: "Phone", value: phone, setter: setPhone, type: "tel", placeholder: "+91XXXXXXXXXX" },
                { label: "Password", value: password, setter: setPass, type: "password", placeholder: "••••••••" },
              ].map(({ label, value, setter, type, placeholder }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  style={{ marginBottom: 16 }}
                >
                  <label className="input-label">{label.toUpperCase()}</label>
                  <input
                    type={type}
                    value={value}
                    onChange={e => setter(e.target.value)}
                    placeholder={placeholder}
                    className="input-field"
                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                  />
                </motion.div>
              ))}

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    color: "#E8554E",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    marginBottom: 16,
                    padding: "8px 12px",
                    background: "rgba(232,85,78,0.08)",
                    borderRadius: 6,
                    border: "1px solid rgba(232,85,78,0.2)",
                  }}
                >
                  ⚠ {error}
                </motion.div>
              )}

              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.38 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleLogin}
                disabled={loading}
                className="btn-crimson"
                style={{ width: "100%", justifyContent: "center", padding: "14px", marginTop: 8, fontSize: 15 }}
              >
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ animation: "spin-slow 1s linear infinite", display: "inline-block" }}>⟳</span>
                    Signing in...
                  </span>
                ) : "Sign In →"}
              </motion.button>

              {/* Demo credentials */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                style={{
                  marginTop: 24,
                  padding: "14px 16px",
                  background: "rgba(29,184,142,0.04)",
                  borderRadius: 10,
                  border: "1px solid rgba(29,184,142,0.15)",
                }}
              >
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: "#1DB88E",
                  letterSpacing: "0.15em",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                  <span style={{
                    width: 6, height: 6,
                    borderRadius: "50%",
                    background: "#1DB88E",
                    animation: "ripple 2s ease-out infinite",
                    display: "inline-block",
                  }} />
                  DEMO CREDENTIALS
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#444", lineHeight: 1.8 }}>
                  <div>Phone: +919876543210</div>
                  <div>Password: demo1234</div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Bottom tagline */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        style={{
          position: "absolute",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: "#333",
          letterSpacing: "0.1em",
          whiteSpace: "nowrap",
        }}
      >
        RAKSETU · 12-ANTIGEN GUARDIAN NETWORK · INDIA
      </motion.div>
    </div>
  );
}