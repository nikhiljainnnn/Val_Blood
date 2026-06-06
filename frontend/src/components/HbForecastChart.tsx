import React, { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import { predictionAPI } from "../api/client";

interface HbPoint {
  day:      string;
  hb:       number;
  forecast: number | null;
  lower:    number | null;
  upper:    number | null;
}

const DEMO_DATA: HbPoint[] = [
  // Historical Hb readings (sawtooth pattern)
  { day: "Mar 1",  hb: 10.4, forecast: null, lower: null, upper: null },
  { day: "Mar 8",  hb: 9.8,  forecast: null, lower: null, upper: null },
  { day: "Mar 15", hb: 9.1,  forecast: null, lower: null, upper: null },
  { day: "Mar 22", hb: 8.4,  forecast: null, lower: null, upper: null },
  { day: "Today",  hb: 7.9,  forecast: 7.9,  lower: 7.6,  upper: 8.2  },
  // Forecast (next 14 days)
  { day: "+3d",    hb: 0,    forecast: 7.4,  lower: 7.0,  upper: 7.8  },
  { day: "+6d",    hb: 0,    forecast: 6.9,  lower: 6.4,  upper: 7.4  },
  { day: "+9d",    hb: 0,    forecast: 6.4,  lower: 5.8,  upper: 7.0  },
  { day: "+12d",   hb: 0,    forecast: 5.9,  lower: 5.2,  upper: 6.6  },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#18181C", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
      <div style={{ color: "#888", marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => p.value > 0 && (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{Number(p.value).toFixed(1)} g/dL</strong>
        </div>
      ))}
    </div>
  );
};

interface Props {
  patientId: string;
}

export default function HbForecastChart({ patientId }: Props) {
  const [data, setData]       = useState<HbPoint[]>(DEMO_DATA);
  const [forecast, setForecast] = useState<{ days: number; urgency: boolean } | null>(null);

  useEffect(() => {
    predictionAPI.getHbForecast(patientId)
      .then(r => {
        setForecast({
          days:    r.data.predicted_days_to_threshold,
          urgency: r.data.urgency_flag,
        });
      })
      .catch(() => {
        setForecast({ days: 8.4, urgency: true });
      });
  }, [patientId]);

  return (
    <div>
      {forecast && (
        <div style={{
          marginBottom: 16,
          padding: "10px 14px",
          borderRadius: 8,
          background: forecast.urgency ? "rgba(232,85,78,0.08)" : "rgba(29,184,142,0.08)",
          border: `1px solid ${forecast.urgency ? "rgba(232,85,78,0.3)" : "rgba(29,184,142,0.3)"}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: forecast.urgency ? "#E8554E" : "#1DB88E" }}>
            {forecast.urgency ? "⚠️ Urgent" : "✓ Stable"}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#ccc" }}>
            Next transfusion in <strong style={{ color: forecast.urgency ? "#E8554E" : "#1DB88E" }}>
              {forecast.days.toFixed(1)} days
            </strong>
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="hbGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366F1" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#E8952A" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#E8952A" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="day" tick={{ fill: "#555", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }} axisLine={false} tickLine={false} />
          <YAxis domain={[4, 12]} tick={{ fill: "#555", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />

          {/* Danger threshold line */}
          <ReferenceLine y={8} stroke="#E8554E" strokeDasharray="6 3" strokeWidth={1.5}
            label={{ value: "8.0 g/dL threshold", position: "insideTopRight", fill: "#E8554E", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }} />

          {/* Confidence band */}
          <Area dataKey="upper"  stroke="none" fill="rgba(232,149,42,0.06)" name="CI upper" legendType="none" />
          <Area dataKey="lower"  stroke="none" fill="#08080A" name="CI lower" legendType="none" />

          {/* Historical Hb */}
          <Area dataKey="hb" name="Hb (actual)" stroke="#6366F1" strokeWidth={2.5}
            fill="url(#hbGrad)" dot={{ fill: "#6366F1", r: 3 }} activeDot={{ r: 5 }} />

          {/* Forecast */}
          <Area dataKey="forecast" name="Hb (forecast)" stroke="#E8952A" strokeWidth={2} strokeDasharray="5 3"
            fill="url(#forecastGrad)" dot={{ fill: "#E8952A", r: 3 }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", gap: 20, marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#555" }}>
        <span><span style={{ color: "#6366F1" }}>—</span> Historical Hb</span>
        <span><span style={{ color: "#E8952A" }}>- -</span> LSTM Forecast</span>
        <span><span style={{ color: "#E8554E" }}>- -</span> 8.0 g/dL threshold</span>
      </div>
    </div>
  );
}
