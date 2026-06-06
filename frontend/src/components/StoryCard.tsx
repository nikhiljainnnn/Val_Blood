import React, { useState } from "react";
import { motion } from "framer-motion";

interface Story {
  id:              string;
  patient_initial: string;
  donation_number: number;
  story:           string;
  language:        string;
  date:            string;
}

interface Props { story: Story }

const LANG_FLAG: Record<string, string> = {
  hi: "🇮🇳 Hindi", ta: "🇮🇳 Tamil", te: "🇮🇳 Telugu",
  bn: "🇮🇳 Bengali", en: "🇬🇧 English", mr: "🇮🇳 Marathi",
};

export default function StoryCard({ story }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div whileHover={{ borderColor: "rgba(192,39,45,0.3)" }}
      style={{ background: "#111113", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 22, cursor: "pointer", transition: "border-color 0.2s" }}
      onClick={() => setExpanded(e => !e)}>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        {/* Patient avatar */}
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(192,39,45,0.12)", border: "1px solid rgba(192,39,45,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {story.patient_initial}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#E8554E" }}>
              Donation #{story.donation_number}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#444" }}>·</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#444" }}>
              Patient {story.patient_initial}
            </span>
            <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#444" }}>
              {story.date}
            </span>
          </div>

          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: "#aaa", lineHeight: 1.7, fontStyle: "italic" }}>
            {expanded ? `"${story.story}"` : `"${story.story.slice(0, 100)}${story.story.length > 100 ? "..." : ""}"`}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#444" }}>
              {LANG_FLAG[story.language] || story.language}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#333", marginLeft: "auto" }}>
              {expanded ? "↑ collapse" : "↓ read more"}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
