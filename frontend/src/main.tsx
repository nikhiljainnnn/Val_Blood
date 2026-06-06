import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore, useDashboardStore } from "@/store";

// Pages
import Dashboard    from "@/pages/Dashboard";
import PatientView  from "@/pages/PatientView";
import DonorPortal  from "@/pages/DonorPortal";
import Onboarding   from "@/pages/Onboarding";
import Login        from "@/pages/Login";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/dashboard";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { setConnected, addEvent, setStats } = useDashboardStore();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setConnected(true);
        console.log("WS connected");
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.event === "ping") return;

          if (data.event === "stats_update") {
            setStats(data.data || {});
            return;
          }

          addEvent({
            id:        crypto.randomUUID(),
            event:     data.event || "unknown",
            data:      data.data || {},
            urgency:   data.urgency || "normal",
            timestamp: new Date().toISOString(),
          });
        } catch (_) {}
      };

      ws.onclose = () => {
        setConnected(false);
        retryTimer = setTimeout(connect, 3000);   // reconnect in 3s
      };

      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [token]);

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <WebSocketProvider>
        <Routes>
          <Route path="/login"     element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/patient/:id" element={
            <ProtectedRoute><PatientView /></ProtectedRoute>
          } />
          <Route path="/donor/:id" element={
            <ProtectedRoute><DonorPortal /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </WebSocketProvider>
    </BrowserRouter>
  );
}
