import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Heart, AlertTriangle, Users, Droplets,
  LogOut, Shield, Activity, Info,
} from "lucide-react";
import { useAuthStore } from "../store";

const NAV_ITEMS = [
  { to: "/",        label: "Dashboard",    icon: LayoutDashboard },
  { to: "/patient", label: "Patient View", icon: Heart },
  { to: "/urgent",  label: "Urgent Cases", icon: AlertTriangle },
  { to: "/at-risk", label: "At-Risk Donors", icon: Users },
  { to: "/about",   label: "About / Mission", icon: Info },
];

const STATS = [
  { label: "Active Circles",   val: "487",  icon: Shield,   color: "var(--success)" },
  { label: "Donors Online",    val: "4.2K", icon: Users,    color: "var(--info)" },
  { label: "Transfusions/Mo",  val: "892",  icon: Droplets, color: "var(--crimson-light)" },
  { label: "Avg Compat",       val: "91.7%",icon: Activity, color: "var(--warning)" },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { name, role, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">💗</div>
        <div>
          <div style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, letterSpacing:"-0.02em" }}>
            <span style={{ color:"var(--crimson-light)" }}>Rak</span>Setu
          </div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:8.5, color:"var(--text-muted)", letterSpacing:"0.1em" }}>
            GUARDIAN NETWORK
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"}
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            <item.icon size={16} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Stats */}
      <div className="sidebar-stats">
        <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", letterSpacing:"0.12em", marginBottom:10 }}>
          SYSTEM HEALTH
        </div>
        {STATS.map(s => (
          <div key={s.label} className="sidebar-stat-row">
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <s.icon size={11} style={{ color:s.color }} />
              <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>{s.label}</span>
            </div>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, color:s.color }}>{s.val}</span>
          </div>
        ))}
      </div>

      {/* User */}
      <div className="sidebar-user">
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {name || "Coordinator"}
          </div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)" }}>
            {role || "coordinator"}
          </div>
        </div>
        <motion.button whileTap={{ scale:0.9 }} onClick={handleLogout}
          style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", padding:4 }}
          title="Sign out">
          <LogOut size={14} />
        </motion.button>
      </div>
    </aside>
  );
}
