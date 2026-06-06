import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store";

import Login       from "./pages/Login";
import Dashboard   from "./pages/Dashboard";
import DonorPortal from "./pages/DonorPortal";
import PatientView from "./pages/PatientView";
import Onboarding  from "./pages/Onboarding";
import UrgentCases  from "./pages/UrgentCases";
import AtRiskDonors from "./pages/AtRiskDonors";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const refreshToken = useAuthStore(s => s.refreshToken);

  useEffect(() => {
    refreshToken();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={
          <PrivateRoute><Dashboard /></PrivateRoute>
        } />
        <Route path="/donor" element={
          <PrivateRoute><DonorPortal /></PrivateRoute>
        } />
        <Route path="/patient" element={
          <PrivateRoute><PatientView /></PrivateRoute>
        } />
        <Route path="/onboarding" element={
          <PrivateRoute><Onboarding /></PrivateRoute>
        } />
        <Route path="/urgent" element={
          <PrivateRoute><UrgentCases /></PrivateRoute>
        } />
        <Route path="/at-risk" element={
          <PrivateRoute><AtRiskDonors /></PrivateRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}