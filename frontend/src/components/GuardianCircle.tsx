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

export default function GuardianCircle({ donors, patientName, width = 500, height = 500 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !donors.length) return;

    const svg    = d3.select(svgRef.current);
    const W      = width;
    const H      = height;
    const cx     = W / 2;
    const cy     = H / 2;
    const innerR = 56;
    const outerR = 180;

    svg.selectAll("*").remove();

    // Orbital ring
    svg.append("circle")
      .attr("cx", cx).attr("cy", cy)
      .attr("r", outerR + 24)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.04)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,6");

    svg.append("circle")
      .attr("cx", cx).attr("cy", cy)
      .attr("r", outerR - 24)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.03)")
      .attr("stroke-width", 1);

    // Patient center
    const centerGroup = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    centerGroup.append("circle")
      .attr("r", innerR)
      .attr("fill", "#0D0D14")
      .attr("stroke", "#C0272D")
      .attr("stroke-width", 2);

    // Pulse animation ring
    centerGroup.append("circle")
      .attr("r", innerR + 4)
      .attr("fill", "none")
      .attr("stroke", "rgba(192,39,45,0.3)")
      .attr("stroke-width", 1.5)
      .style("animation", "pulse 2s ease-in-out infinite");

    centerGroup.append("text")
      .text("🩺")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("dy", "-8")
      .attr("font-size", 24);

    centerGroup.append("text")
      .text(patientName)
      .attr("text-anchor", "middle")
      .attr("dy", "20")
      .attr("fill", "#ccc")
      .attr("font-size", 11)
      .attr("font-family", "'JetBrains Mono', monospace")
      .attr("font-weight", "600");

    // Donor nodes
    donors.forEach((donor, i) => {
      const angle = (i / donors.length) * Math.PI * 2 - Math.PI / 2;
      const dx    = cx + outerR * Math.cos(angle);
      const dy    = cy + outerR * Math.sin(angle);
      const color = STATUS_COLOR[donor.status] || "#6366F1";
      const r     = 22 + donor.compatibility.score * 14;

      // Connection line
      const lineOpacity = 0.15 + donor.compatibility.score * 0.55;
      svg.append("line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", dx).attr("y2", dy)
        .attr("stroke", color)
        .attr("stroke-width", 1 + donor.compatibility.score * 2.5)
        .attr("opacity", lineOpacity)
        .attr("stroke-dasharray", donor.status === "at_risk" ? "4,3" : "none");

      const nodeGroup = svg.append("g")
        .attr("transform", `translate(${dx},${dy})`)
        .style("cursor", "pointer");

      // Churn risk warning ring (pulsing for critical)
      if (donor.churn_probability > 0.6) {
        nodeGroup.append("circle")
          .attr("r", r + 7)
          .attr("fill", "none")
          .attr("stroke", "#E8952A")
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "4,3")
          .attr("opacity", 0.9);
      }

      // Main donor circle
      nodeGroup.append("circle")
        .attr("r", r)
        .attr("fill", color)
        .attr("fill-opacity", 0.12)
        .attr("stroke", color)
        .attr("stroke-width", 1.8);

      // Compatibility score
      nodeGroup.append("text")
        .text(`${Math.round(donor.compatibility.score * 100)}%`)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("dy", "-4")
        .attr("fill", "#fff")
        .attr("font-size", 11)
        .attr("font-weight", "700")
        .attr("font-family", "'JetBrains Mono', monospace");

      // Rank badge
      nodeGroup.append("text")
        .text(`#${donor.rank}`)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("dy", "12")
        .attr("fill", color)
        .attr("font-size", 9)
        .attr("font-family", "'JetBrains Mono', monospace");

      // Name label outside circle
      const labelR  = outerR + 40;
      const labelX  = labelR * Math.cos(angle);
      const labelY  = labelR * Math.sin(angle);
      const anchor  = Math.cos(angle) > 0.1 ? "start" : Math.cos(angle) < -0.1 ? "end" : "middle";

      svg.append("text")
        .attr("x", cx + labelX)
        .attr("y", cy + labelY)
        .attr("text-anchor", anchor)
        .attr("dominant-baseline", "central")
        .attr("fill", "#666")
        .attr("font-size", 10)
        .attr("font-family", "'JetBrains Mono', monospace")
        .text(donor.donor_name.split(" ")[0]);

      // Tooltip on hover
      nodeGroup
        .on("mouseover", function (event) {
          d3.select(this).select("circle").transition().duration(150).attr("fill-opacity", 0.3);
          // Show tooltip
          const tooltip = svg.append("g")
            .attr("id", `tooltip-${donor.donor_id}`)
            .attr("transform", `translate(${dx + (dx > cx ? 10 : -180)},${dy - 30})`);

          tooltip.append("rect")
            .attr("width", 168).attr("height", 80)
            .attr("rx", 6)
            .attr("fill", "#18181C")
            .attr("stroke", "rgba(255,255,255,0.1)")
            .attr("stroke-width", 1);

          const texts = [
            donor.donor_name,
            `Compat: ${Math.round(donor.compatibility.score * 100)}% · ${donor.compatibility.mismatch_count} mismatch`,
            `Churn risk: ${Math.round(donor.churn_probability * 100)}%`,
            `Status: ${donor.status.replace("_", " ")} · Lang: ${donor.language.toUpperCase()}`,
          ];
          texts.forEach((t, j) => {
            tooltip.append("text")
              .attr("x", 10).attr("y", 18 + j * 16)
              .attr("fill", j === 0 ? "#fff" : "#888")
              .attr("font-size", j === 0 ? 12 : 10)
              .attr("font-family", "'JetBrains Mono', monospace")
              .attr("font-weight", j === 0 ? "600" : "400")
              .text(t);
          });
        })
        .on("mouseout", function () {
          d3.select(this).select("circle").transition().duration(150).attr("fill-opacity", 0.12);
          svg.select(`#tooltip-${donor.donor_id}`).remove();
        });
    });

    // CSS for pulse animation
    const style = document.getElementById("gc-pulse-style") || document.createElement("style");
    style.id = "gc-pulse-style";
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 0.3; transform: scale(1); }
        50%       { opacity: 0.8; transform: scale(1.08); }
      }
    `;
    document.head.appendChild(style);

  }, [donors, patientName, width, height]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label={`Guardian Circle for patient ${patientName} — ${donors.length} donors`}
    />
  );
}
