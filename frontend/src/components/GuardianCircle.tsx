import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

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
}

const STATUS_COLOR: Record<string, string> = {
  active:  "#6366F1",
  at_risk: "#E8952A",
  donated: "#1DB88E",
  churned: "#E8554E",
};

interface Props {
  donors:      Donor[];
  patientName: string;
  width?:      number;
  height?:     number;
}

export default function GuardianCircle({ donors, patientName, width = 640, height = 580 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !donors.length) return;

    const svg    = d3.select(svgRef.current);
    // Use a generous viewBox so labels + tooltips never clip
    const VW     = width;
    const VH     = height;
    const cx     = VW / 2;
    const cy     = VH / 2;
    const innerR = 56;
    const outerR = 200;   // donor orbit radius — generous with 640px wide canvas
    const labelR = outerR + 36; // label orbit — still fits inside VW/2 = 320

    svg.selectAll("*").remove();

    // ── Orbital decoration rings ────────────────────────────────
    [outerR + 20, outerR - 18].forEach((r, i) => {
      svg.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", r)
        .attr("fill", "none")
        .attr("stroke", i === 0 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", i === 0 ? "3,7" : "none");
    });

    // ── Patient centre node ─────────────────────────────────────
    const centre = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    // glow
    centre.append("circle").attr("r", innerR + 12)
      .attr("fill", "radial-gradient(circle, rgba(192,39,45,0.15) 0%, transparent 70%)")
      .attr("fill", "none")
      .attr("stroke", "rgba(192,39,45,0.18)")
      .attr("stroke-width", 8);

    centre.append("circle").attr("r", innerR)
      .attr("fill", "var(--surface-dark, #0D0D14)")
      .attr("stroke", "#C0272D")
      .attr("stroke-width", 2);

    centre.append("text").text("🩺")
      .attr("text-anchor", "middle").attr("dominant-baseline", "central")
      .attr("dy", "-8").attr("font-size", 22);

    centre.append("text").text(patientName)
      .attr("text-anchor", "middle").attr("dy", "20")
      .attr("fill", "#ccc").attr("font-size", 10)
      .attr("font-family", "'JetBrains Mono', monospace").attr("font-weight", "600");

    // ── Donor nodes ─────────────────────────────────────────────
    donors.forEach((donor, i) => {
      const angle = (i / donors.length) * Math.PI * 2 - Math.PI / 2;
      const dx    = cx + outerR * Math.cos(angle);
      const dy    = cy + outerR * Math.sin(angle);
      const color = STATUS_COLOR[donor.status] || "#6366F1";
      const r     = 20 + donor.compatibility.score * 12; // 20–32px

      // Connection line
      svg.append("line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", dx).attr("y2", dy)
        .attr("stroke", color)
        .attr("stroke-width", 0.8 + donor.compatibility.score * 2.2)
        .attr("opacity", 0.12 + donor.compatibility.score * 0.5)
        .attr("stroke-dasharray", donor.status === "at_risk" ? "4,3" : "none");

      const nodeGroup = svg.append("g")
        .attr("transform", `translate(${dx},${dy})`)
        .style("cursor", "pointer");

      // Churn warning ring
      if (donor.churn_probability > 0.6) {
        nodeGroup.append("circle")
          .attr("r", r + 7)
          .attr("fill", "none")
          .attr("stroke", "#E8952A")
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "4,3")
          .attr("opacity", 0.9);
      }

      // Main circle
      nodeGroup.append("circle")
        .attr("r", r)
        .attr("fill", color).attr("fill-opacity", 0.12)
        .attr("stroke", color).attr("stroke-width", 1.8);

      // Score text
      nodeGroup.append("text")
        .text(`${Math.round(donor.compatibility.score * 100)}%`)
        .attr("text-anchor", "middle").attr("dominant-baseline", "central")
        .attr("dy", "-4").attr("fill", "#fff")
        .attr("font-size", 10).attr("font-weight", "700")
        .attr("font-family", "'JetBrains Mono', monospace");

      // Rank badge
      nodeGroup.append("text")
        .text(`#${donor.rank}`)
        .attr("text-anchor", "middle").attr("dominant-baseline", "central")
        .attr("dy", "12").attr("fill", color)
        .attr("font-size", 9)
        .attr("font-family", "'JetBrains Mono', monospace");

      // Name label — positioned on the label orbit
      const lx = cx + labelR * Math.cos(angle);
      const ly = cy + labelR * Math.sin(angle);
      const anchor = Math.cos(angle) > 0.15 ? "start" : Math.cos(angle) < -0.15 ? "end" : "middle";

      svg.append("text")
        .attr("x", lx).attr("y", ly)
        .attr("text-anchor", anchor)
        .attr("dominant-baseline", "central")
        .attr("fill", "#888")
        .attr("font-size", 9.5)
        .attr("font-family", "'JetBrains Mono', monospace")
        .text(donor.donor_name.split(" ")[0]);

      // ── Tooltip ── (clamped so it never leaves the SVG viewport)
      const TW = 172, TH = 84;

      nodeGroup
        .on("mouseover", function () {
          d3.select(this).select("circle").transition().duration(150).attr("fill-opacity", 0.28);

          // Compute tooltip origin so it stays fully inside viewBox
          let tx = dx + r + 8;
          let ty = dy - TH / 2;

          // Right overflow → flip left
          if (tx + TW > VW - 8) tx = dx - TW - r - 8;
          // Left overflow → pin
          if (tx < 8) tx = 8;
          // Top/bottom overflow
          if (ty < 8) ty = 8;
          if (ty + TH > VH - 8) ty = VH - TH - 8;

          const tooltip = svg.append("g")
            .attr("id", `tt-${donor.donor_id}`)
            .attr("transform", `translate(${tx},${ty})`);

          tooltip.append("rect")
            .attr("width", TW).attr("height", TH)
            .attr("rx", 8)
            .attr("fill", "#18181C")
            .attr("stroke", "rgba(255,255,255,0.1)").attr("stroke-width", 1);

          const lines = [
            donor.donor_name,
            `Compat: ${Math.round(donor.compatibility.score * 100)}%  ·  ${donor.compatibility.mismatch_count} mismatch`,
            `Churn risk: ${Math.round(donor.churn_probability * 100)}%`,
            `Status: ${donor.status.replace("_", " ")}  ·  ${donor.language.toUpperCase()}`,
          ];
          lines.forEach((t, j) => {
            tooltip.append("text")
              .attr("x", 10).attr("y", 18 + j * 16)
              .attr("fill", j === 0 ? "#F0EEE8" : "#888")
              .attr("font-size", j === 0 ? 12 : 10)
              .attr("font-family", "'JetBrains Mono', monospace")
              .attr("font-weight", j === 0 ? "600" : "400")
              .text(t);
          });
        })
        .on("mouseout", function () {
          d3.select(this).select("circle").transition().duration(150).attr("fill-opacity", 0.12);
          svg.select(`#tt-${donor.donor_id}`).remove();
        });
    });

  }, [donors, patientName, width, height]);

  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", display: "block", maxHeight: "520px" }}
        role="img"
        aria-label={`Guardian Circle for patient ${patientName} — ${donors.length} donors`}
      />
    </div>
  );
}
