import React, { useState } from "react";
import { motion } from "framer-motion";
import { useDashboardStore } from "../store";

const DEMO_EVENTS = [
  { event: "new_request",     urgency: "critical", label: "🩸 Critical: Arjun (B+) needs 2 units within 48h" },
  { event: "donor_confirmed", urgency: "normal",   label: "✅ Ramesh Kumar confirmed donation for tomorrow 10AM" },
  { event: "churn_alert",     urgency: "urgent",   label: "⚠️ Vijay Reddy churn risk at 71% — intervention needed" },
  { event: "circle_replaced", urgency: "normal",   label: "🔄 New donor Preethi added to Arjun's Guardian Circle" },
  { event: "new_request",     urgency: "urgent",   label: "🩸 Urgent: Priya (O−) needs matching rare-type donor" },
  { event: "inventory_update",urgency: "normal",   label: "📦 Mumbai Blood Bank: 12 O+ units available" },
];

export default function AlertBanner() {
  const addEvent   = useDashboardStore(s => s.addEvent);
  const [firing, setFiring] = useState(false);

  const fireDemo = () => {
    if (firing) return;
    setFiring(true);

    const ev = DEMO_EVENTS[Math.floor(Math.random() * DEMO_EVENTS.length)];
    addEvent({
      id:        crypto.randomUUID(),
      event:     ev.event,
      data:      { message: ev.label },
      urgency:   ev.urgency as "normal" | "urgent" | "critical",
      timestamp: new Date().toISOString(),
    });

    setTimeout(() => setFiring(false), 1000);
  };

  return (
    <div style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 16 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#444", marginBottom: 10, letterSpacing: "0.1em" }}>
        DEMO CONTROLS
      </div>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={fireDemo}
        disabled={firing}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: 6,
          border: "1px solid rgba(192,39,45,0.3)",
          background: "rgba(192,39,45,0.08)",
          color: "#E8554E",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          cursor: firing ? "not-allowed" : "pointer",
          transition: "all 0.2s",
        }}
      >
        {firing ? "Event fired!" : "⚡ Simulate Live Event"}
      </motion.button>
    </div>
  );
}
