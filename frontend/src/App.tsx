import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store";

import Sidebar       from "./components/Sidebar";
import { ToastContainer } from "./components/Toast";
import Login         from "./pages/Login";
import Dashboard     from "./pages/Dashboard";
import DonorPortal   from "./pages/DonorPortal";
import PatientView   from "./pages/PatientView";
import Onboarding    from "./pages/Onboarding";
import UrgentCases   from "./pages/UrgentCases";
import AtRiskDonors  from "./pages/AtRiskDonors";
import About         from "./pages/About";

// ── Demo Mode Guard ───────────────────────────────────────────────────────────
// In demo/local mode (no Cognito configured) we skip auth entirely.
// Set VITE_REQUIRE_AUTH=true in .env to enforce login.
const REQUIRE_AUTH = import.meta.env.VITE_REQUIRE_AUTH === "true";

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">{children}</div>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token);

  // Only enforce auth if explicitly required (production with Cognito)
  if (REQUIRE_AUTH && !token) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  const refreshToken = useAuthStore(s => s.refreshToken);

  useEffect(() => {
    // Silently try to refresh — if Cognito isn't configured, this no-ops
    refreshToken().catch(() => {/* ignore — demo mode */});
  }, []);

  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/login"      element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />

        <Route path="/"          element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/donor"     element={<PrivateRoute><DonorPortal /></PrivateRoute>} />
        <Route path="/donor/:id" element={<PrivateRoute><DonorPortal /></PrivateRoute>} />
        <Route path="/patient"   element={<PrivateRoute><PatientView /></PrivateRoute>} />
        <Route path="/patient/:id" element={<PrivateRoute><PatientView /></PrivateRoute>} />
        <Route path="/urgent"    element={<PrivateRoute><UrgentCases /></PrivateRoute>} />
        <Route path="/at-risk"   element={<PrivateRoute><AtRiskDonors /></PrivateRoute>} />
        <Route path="/about"     element={<PrivateRoute><About /></PrivateRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );

}