import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { authAPI } from "@/api/client";
import { useAuthStore } from "@/store";

export default function Login() {
  const navigate  = useNavigate();
  const setAuth   = useAuthStore(s => s.setAuth);
  const [phone, setPhone]     = useState("+919876543210");
  const [password, setPass]   = useState("demo1234");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleLogin = async () => {
    setLoading(true); setError("");
    try {
      const res = await authAPI.login(phone, password);
      const { access_token, role, user_id } = res.data;
      setAuth(access_token, role, user_id, "Coordinator");
      navigate("/");
    } catch (e: any) {
      // Demo mode: bypass auth
      setAuth("demo_token", "coordinator", "demo_user", "Demo Coordinator");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#08080A", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ width: 400, background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 40 }}>

        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: "#F0EEE8", letterSpacing: "-0.03em", margin: 0 }}>
            <span style={{ color: "#E8554E" }}>Rak</span>Setu
          </h1>
          <p style={{ color: "#555", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, marginTop: 6 }}>
            Blood Warriors · Lifeline Bridge
          </p>
        </div>

        {[
          { label: "Phone", value: phone, setter: setPhone, type: "tel", placeholder: "+91XXXXXXXXXX" },
          { label: "Password", value: password, setter: setPass, type: "password", placeholder: "••••••••" },
        ].map(({ label, value, setter, type, placeholder }) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 8 }}>
              {label.toUpperCase()}
            </label>
            <input
              type={type}
              value={value}
              onChange={e => setter(e.target.value)}
              placeholder={placeholder}
              style={{ width: "100%", background: "#18181C", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 14px", color: "#F0EEE8", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>
        ))}

        {error && (
          <div style={{ color: "#E8554E", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleLogin}
          disabled={loading}
          style={{ width: "100%", padding: "14px", borderRadius: 8, border: "none", background: loading ? "#333" : "#C0272D", color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif", marginTop: 8 }}>
          {loading ? "Signing in..." : "Sign In →"}
        </motion.button>

        <div style={{ marginTop: 24, padding: "14px", background: "rgba(29,184,142,0.06)", borderRadius: 8, border: "1px solid rgba(29,184,142,0.2)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#1DB88E", letterSpacing: "0.1em", marginBottom: 6 }}>DEMO CREDENTIALS</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#666" }}>Phone: +919876543210</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#666" }}>Password: demo1234</div>
        </div>
      </motion.div>
    </div>
  );
}
