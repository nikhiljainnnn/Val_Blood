import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { motion, AnimatePresence } from "framer-motion";

interface Donor {
  donor_id:          string;
  donor_name:        string;
  compatibility:     { score: number; mismatch_count: number; risk_level: string };
  churn_probability: number;
  availability_prob: number;
  days_to_eligible:  number;
  status:            string;
  rank:              number;
  language:          string;
  phone?:            string;
}

interface Props {
  donors:      Donor[];
  patientName: string;
  width?:      number;
  height?:     number;
}

const STATUS: Record<string, { color: string; label: string; glow: string }> = {
  active:  { color: "#6366F1", label: "Active",  glow: "rgba(99,102,241,0.5)" },
  at_risk: { color: "#E8952A", label: "At Risk", glow: "rgba(232,149,42,0.5)" },
  donated: { color: "#1DB88E", label: "Donated", glow: "rgba(29,184,142,0.5)" },
  churned: { color: "#E8554E", label: "Churned", glow: "rgba(232,85,78,0.5)" },
};

function statusOf(d: Donor) {
  return STATUS[d.status] ?? STATUS.active;
}

export default function GuardianCircle({
  donors, patientName, width = 720, height = 600,
}: Props) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<Donor | null>(null);

  useEffect(() => {
    if (!svgRef.current || !donors.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const VW       = width;
    const VH       = height;
    const cx       = VW / 2;
    const cy       = VH / 2;
    const patR     = 56;          // patient node radius
    const nodeR    = 28;          // donor node radius (fixed, clean)
    const orbitR   = Math.min(cx, cy) - nodeR - 72; // single orbit, fits everything
    const labelR   = orbitR + nodeR + 22;            // label ring, outside nodes

    // ── Defs ──────────────────────────────────────────────────────────────────
    const defs = svg.append("defs");

    // Patient gradient
    const pg = defs.append("radialGradient").attr("id","patGrad")
      .attr("cx","50%").attr("cy","50%").attr("r","50%");
    pg.append("stop").attr("offset","0%").attr("stop-color","#C0272D").attr("stop-opacity","0.95");
    pg.append("stop").attr("offset","100%").attr("stop-color","#5a0000").attr("stop-opacity","0.85");

    // Soft glow filter
    const gf = defs.append("filter").attr("id","softGlow")
      .attr("x","-60%").attr("y","-60%").attr("width","220%").attr("height","220%");
    gf.append("feGaussianBlur").attr("stdDeviation","4").attr("result","blur");
    const fm = gf.append("feMerge");
    fm.append("feMergeNode").attr("in","blur");
    fm.append("feMergeNode").attr("in","SourceGraphic");

    // Strong centre glow
    const sf = defs.append("filter").attr("id","centreGlow")
      .attr("x","-80%").attr("y","-80%").attr("width","360%").attr("height","360%");
    sf.append("feGaussianBlur").attr("stdDeviation","10").attr("result","blur");
    const sm = sf.append("feMerge");
    sm.append("feMergeNode").attr("in","blur");
    sm.append("feMergeNode").attr("in","SourceGraphic");

    // Per-status colour glow filters
    Object.entries(STATUS).forEach(([key, s]) => {
      const f = defs.append("filter").attr("id",`cg-${key}`)
        .attr("x","-60%").attr("y","-60%").attr("width","220%").attr("height","220%");
      f.append("feFlood").attr("flood-color", s.color).attr("flood-opacity","0.5").attr("result","col");
      f.append("feComposite").attr("in","col").attr("in2","SourceAlpha").attr("operator","in").attr("result","colMask");
      f.append("feGaussianBlur").attr("in","colMask").attr("stdDeviation","5").attr("result","blurred");
      const m2 = f.append("feMerge");
      m2.append("feMergeNode").attr("in","blurred");
      m2.append("feMergeNode").attr("in","SourceGraphic");
    });

    // ── Decorative rings ──────────────────────────────────────────────────────
    [orbitR + 18, orbitR, orbitR - 16, patR + 22, patR + 8].forEach((r, i) => {
      svg.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", r)
        .attr("fill", "none")
        .attr("stroke", i < 3 ? "rgba(99,102,241,0.1)" : "rgba(192,39,45,0.18)")
        .attr("stroke-width", i % 2 === 0 ? 1 : 0.5)
        .attr("stroke-dasharray", i % 2 === 0 ? "4,10" : "none");
    });

    // Radial tick marks at orbit
    const N = donors.length;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      const t1x = cx + (orbitR - 10) * Math.cos(a);
      const t1y = cy + (orbitR - 10) * Math.sin(a);
      const t2x = cx + (orbitR + 10) * Math.cos(a);
      const t2y = cy + (orbitR + 10) * Math.sin(a);
      svg.append("line")
        .attr("x1", t1x).attr("y1", t1y)
        .attr("x2", t2x).attr("y2", t2y)
        .attr("stroke", "rgba(255,255,255,0.08)")
        .attr("stroke-width", 1);
    }

    // ── Draw donor nodes & connections ────────────────────────────────────────
    donors.forEach((donor, i) => {
      const angle  = (i / N) * Math.PI * 2 - Math.PI / 2;
      const gx     = cx + orbitR * Math.cos(angle);
      const gy     = cy + orbitR * Math.sin(angle);
      const { color, glow } = statusOf(donor);
      const compat = donor.compatibility.score;

      // Trim connection line to node edges
      const sx = cx + (patR + 4) * Math.cos(angle);
      const sy = cy + (patR + 4) * Math.sin(angle);
      const ex = gx - (nodeR + 4) * Math.cos(angle);
      const ey = gy - (nodeR + 4) * Math.sin(angle);

      // Curved bezier: slight lateral bow so lines are visually distinct
      const perp   = angle + Math.PI / 2;
      const bow    = (i % 2 === 0 ? 1 : -1) * 18; // alternate left/right bow
      const qx     = (sx + ex) / 2 + bow * Math.cos(perp);
      const qy     = (sy + ey) / 2 + bow * Math.sin(perp);

      svg.append("path")
        .attr("d", `M${sx},${sy} Q${qx},${qy} ${ex},${ey}`)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1.2 + compat * 2.2)
        .attr("opacity", 0.18 + compat * 0.48)
        .attr("stroke-linecap", "round")
        .attr("stroke-dasharray", donor.status === "at_risk" ? "5,4" : "none");

      // Churn warning dashed ring (outside node)
      if (donor.churn_probability > 0.55) {
        svg.append("circle")
          .attr("cx", gx).attr("cy", gy).attr("r", nodeR + 9)
          .attr("fill", "none")
          .attr("stroke", "#E8952A")
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "4,3")
          .attr("opacity", 0.7);
      }

      // Glow halo
      svg.append("circle")
        .attr("cx", gx).attr("cy", gy).attr("r", nodeR + 6)
        .attr("fill", glow)
        .attr("opacity", "0.2")
        .attr("filter", "url(#softGlow)");

      // Clickable node group
      const ng = svg.append("g")
        .attr("transform", `translate(${gx},${gy})`)
        .style("cursor", "pointer");

      // Dark base circle
      ng.append("circle").attr("r", nodeR)
        .attr("fill", "#0c0c14")
        .attr("stroke", color)
        .attr("stroke-width", 2.2)
        .attr("filter", `url(#cg-${donor.status})`);

      // Compatibility arc (inner arc fill)
      const arcFn = d3.arc()({
        innerRadius: nodeR - 6,
        outerRadius: nodeR,
        startAngle:  -Math.PI / 2,
        endAngle:    -Math.PI / 2 + compat * Math.PI * 2,
      } as d3.DefaultArcObject);
      ng.append("path").attr("d", arcFn!)
        .attr("fill", color)
        .attr("opacity", "0.95");

      // Score text
      ng.append("text")
        .text(`${Math.round(compat * 100)}%`)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("dy", "-5")
        .attr("fill", "#fff")
        .attr("font-size", "11")
        .attr("font-weight", "700")
        .attr("font-family", "'JetBrains Mono',monospace");

      // Rank
      ng.append("text")
        .text(`#${donor.rank}`)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("dy", "11")
        .attr("fill", color)
        .attr("font-size", "9")
        .attr("font-family", "'JetBrains Mono',monospace");

      // ── Name label on label ring ─────────────────────────────────────────
      const lx     = cx + labelR * Math.cos(angle);
      const ly     = cy + labelR * Math.sin(angle);
      const cosA   = Math.cos(angle);
      const anchor = cosA > 0.15 ? "start" : cosA < -0.15 ? "end" : "middle";

      // Name pill background
      const firstName = donor.donor_name.split(" ")[0];
      const pilW  = firstName.length * 6.2 + 14; // approx width
      const pilH  = 18;

      svg.append("rect")
        .attr("x", anchor === "start" ? lx : anchor === "end" ? lx - pilW : lx - pilW / 2)
        .attr("y", ly - pilH / 2)
        .attr("width", pilW)
        .attr("height", pilH)
        .attr("rx", 9)
        .attr("fill", "#12121c")
        .attr("stroke", color)
        .attr("stroke-width", 0.8)
        .attr("opacity", 0.92);

      const labelPad = anchor === "start" ? lx + 7 : anchor === "end" ? lx - 7 : lx;
      svg.append("text")
        .attr("x", labelPad)
        .attr("y", ly)
        .attr("text-anchor", anchor)
        .attr("dominant-baseline", "central")
        .attr("fill", "#ddd")
        .attr("font-size", "9.5")
        .attr("font-family", "'JetBrains Mono',monospace")
        .attr("font-weight", "500")
        .text(firstName);

      // Events
      ng.on("click", () =>
        setSelected(prev => prev?.donor_id === donor.donor_id ? null : donor)
      );
      ng.on("mouseover", function() {
        d3.select(this).select("circle").transition().duration(110).attr("stroke-width", "4");
      });
      ng.on("mouseout", function() {
        d3.select(this).select("circle").transition().duration(110).attr("stroke-width", "2.2");
      });
    });

    // ── Patient centre ────────────────────────────────────────────────────────
    const centre = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    // Pulse halos
    [patR + 20, patR + 10].forEach(r => {
      centre.append("circle").attr("r", r)
        .attr("fill", "none")
        .attr("stroke", "rgba(192,39,45,0.2)")
        .attr("stroke-width", "1.5");
    });

    centre.append("circle").attr("r", patR)
      .attr("fill", "url(#patGrad)")
      .attr("filter", "url(#centreGlow)");

    centre.append("circle").attr("r", patR)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.3)")
      .attr("stroke-width", "1.5");

    centre.append("text").text("🩺")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("dy", "-12").attr("font-size", "24");

    centre.append("text").text(patientName)
      .attr("text-anchor", "middle")
      .attr("dy", "16")
      .attr("fill", "#fff")
      .attr("font-size", "11")
      .attr("font-family", "'JetBrains Mono',monospace")
      .attr("font-weight", "700");

    centre.append("text").text("PATIENT")
      .attr("text-anchor", "middle")
      .attr("dy", "30")
      .attr("fill", "rgba(255,255,255,0.35)")
      .attr("font-size", "7.5")
      .attr("font-family", "'JetBrains Mono',monospace")
      .attr("letter-spacing", "2");

  }, [donors, patientName, width, height]);

  const avgCompat = donors.length
    ? Math.round(donors.reduce((s, d) => s + d.compatibility.score, 0) / donors.length * 100)
    : 0;
  const active = donors.filter(d => d.status === "active").length;
  const atRisk = donors.filter(d => d.status === "at_risk").length;

  return (
    <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
      {/* SVG */}
      <div style={{ flex:1, position:"relative" }}>
        <div style={{ position:"absolute", top:0, left:0, fontFamily:"var(--font-mono)", fontSize:9,
          color:"var(--text-muted)", letterSpacing:"0.1em" }}>GUARDIAN NETWORK</div>
        <div style={{ position:"absolute", top:0, right:0, fontFamily:"var(--font-mono)", fontSize:9,
          color:"var(--success)" }}>{avgCompat}% AVG COMPAT</div>

        <svg ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width:"100%", height:"auto", display:"block", maxHeight:"500px", marginTop:18 }}
          role="img"
          aria-label={`Guardian Circle — ${donors.length} donors for ${patientName}`}
        />

        {/* Legend row */}
        <div style={{ display:"flex", gap:16, justifyContent:"center", marginTop:6, flexWrap:"wrap" }}>
          {Object.entries(STATUS).map(([key, s]) => (
            <span key={key} style={{ display:"flex", alignItems:"center", gap:5,
              fontFamily:"var(--font-mono)", fontSize:9.5, color:"var(--text-muted)" }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:s.color,
                display:"inline-block", boxShadow:`0 0 6px ${s.glow}` }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Side panel */}
      <div style={{ width:200, flexShrink:0, display:"flex", flexDirection:"column", gap:10 }}>
        {/* Stats */}
        <div style={{ background:"var(--surface-2)", borderRadius:12, padding:"14px 16px",
          border:"1px solid var(--border)" }}>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:"0.1em",
            color:"var(--text-muted)", marginBottom:12 }}>CIRCLE HEALTH</div>
          {[
            { label:"Donors",    val:`${donors.length}/10`,  color:"var(--text-main)" },
            { label:"Active",    val:active,                 color:"#6366F1" },
            { label:"At Risk",   val:atRisk,                 color:"var(--warning)" },
            { label:"Avg Compat",val:`${avgCompat}%`,        color:"var(--success)" },
          ].map(s => (
            <div key={s.label} style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", padding:"5px 0",
              borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>{s.label}</span>
              <span style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:700, color:s.color }}>{s.val}</span>
            </div>
          ))}
        </div>

        {/* Selected donor */}
        <AnimatePresence>
          {selected ? (
            <motion.div key={selected.donor_id}
              initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:8 }} transition={{ duration:0.18 }}
              style={{ background:`${statusOf(selected).color}14`, borderRadius:12,
                padding:"14px 16px", border:`1px solid ${statusOf(selected).color}35` }}>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:"0.1em",
                color:statusOf(selected).color, marginBottom:10 }}>SELECTED</div>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>{selected.donor_name}</div>
              {[
                ["Compat",    `${Math.round(selected.compatibility.score*100)}%`],
                ["Mismatches",`${selected.compatibility.mismatch_count}`],
                ["Churn",     `${Math.round(selected.churn_probability*100)}%`],
                ["Wait",      selected.days_to_eligible > 0 ? `${selected.days_to_eligible}d` : "Ready ✓"],
                ["Language",  selected.language?.toUpperCase()],
              ].map(([k,v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between",
                  fontFamily:"var(--font-mono)", fontSize:10, padding:"3px 0",
                  borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ color:"var(--text-muted)" }}>{k}</span>
                  <span style={{ color:"var(--text-main)", fontWeight:600 }}>{v}</span>
                </div>
              ))}
              <button onClick={() => setSelected(null)}
                style={{ marginTop:10, width:"100%", padding:"6px", borderRadius:6,
                  background:"rgba(255,255,255,0.05)", border:"1px solid var(--border)",
                  color:"var(--text-muted)", fontSize:10, cursor:"pointer",
                  fontFamily:"var(--font-mono)" }}>
                Dismiss ×
              </button>
            </motion.div>
          ) : (
            <motion.div key="hint" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              style={{ background:"var(--surface)", borderRadius:12, padding:"14px 16px",
                border:"1px solid var(--border)", textAlign:"center" }}>
              <div style={{ fontSize:22, marginBottom:8 }}>👆</div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", lineHeight:1.7 }}>
                Click any donor<br />to inspect
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top donors */}
        <div style={{ background:"var(--surface-2)", borderRadius:12, border:"1px solid var(--border)", overflow:"hidden" }}>
          <div style={{ padding:"10px 14px", borderBottom:"1px solid var(--border)",
            fontFamily:"var(--font-mono)", fontSize:9, letterSpacing:"0.1em", color:"var(--text-muted)" }}>
            TOP DONORS
          </div>
          {[...donors].sort((a,b) => b.compatibility.score - a.compatibility.score).slice(0,5).map(d => {
            const { color } = statusOf(d);
            return (
              <div key={d.donor_id}
                onClick={() => setSelected(d)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px",
                  borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer",
                  background: selected?.donor_id === d.donor_id ? `${color}12` : "transparent",
                  transition:"background 0.15s" }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:color,
                  boxShadow:`0 0 5px ${color}`, flexShrink:0 }} />
                <div style={{ flex:1, fontFamily:"var(--font-mono)", fontSize:10,
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {d.donor_name.split(" ")[0]}
                </div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, color }}>
                  {Math.round(d.compatibility.score*100)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
