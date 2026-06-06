import { API_CONFIG } from "./config";
import axios from "axios";
import { useAuthStore } from "../store";

const BASE_URL = API_CONFIG.baseURL;
const PRED_URL = API_CONFIG.predURL;

// ── Demo mode: skip real API calls if no backend ─────────────────────────────
// Set VITE_DEMO_MODE=true in .env, or the app auto-detects backend unavailability.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true" || true;

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,               // fail fast in demo mode
  headers: { "Content-Type": "application/json" },
});

export const predApi = axios.create({
  baseURL: PRED_URL,
  timeout: 8000,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT on every request
const attachJWT = (config: any) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
};
api.interceptors.request.use(attachJWT);
predApi.interceptors.request.use(attachJWT);

// ── Response interceptor: NEVER auto-redirect to login ───────────────────────
// In demo mode the backend may not be running at all.
// Auth expiry is handled by the Login page — components use try/catch + fallback data.
api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err)     // pass error to the component's catch block
);
predApi.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err)
);

// ── Typed API calls ───────────────────────────────────────────────────────────

export const authAPI = {
  login:           (phone: string, password: string) => api.post("/auth/login", { phone, password }),
  registerDonor:   (body: unknown) => api.post("/auth/register/donor", body),
  registerPatient: (body: unknown) => api.post("/auth/register/patient", body),
};

export const matchingAPI = {
  getGuardianCircle: (patientId: string) => api.get(`/guardian-circle/${patientId}`),
  createRequest:     (body: unknown) => api.post("/transfusion/request", body),
  buildCircle:       (patientId: string) => api.post(`/guardian-circle/build/${patientId}`),
};

export const predictionAPI = {
  getChurnBatch:  () => predApi.get("/churn/batch"),
  getChurnDonor:  (donorId: string) => predApi.get(`/churn/donor/${donorId}`),
  getHbForecast:  (patientId: string) => predApi.get(`/hb-forecast/${patientId}`),
  getUrgentBatch: () => predApi.get("/hb-forecast/batch/all"),
};

export const notificationAPI = {
  notifyDonor: (body: unknown) => api.post("/notify/donor", body),
};

export const storyAPI = {
  getStory: (donorId: string, patientId: string, language = "hi") =>
    api.get(`/story/${donorId}/${patientId}`, { params: { language } }),
};

export const dashboardAPI = {
  getStats:     () => api.get("/dashboard/stats"),
  getInventory: () => api.get("/inventory"),
};

export const donorAPI = {
  getAtRisk:      () => api.get("/donors/at-risk"),
  triggerCascade: (donorId: string) => api.post(`/donors/${donorId}/cascade`),
};

export const patientAPI = {
  getUrgent: () => api.get("/patients/urgent"),
};

export const demoAPI = {
  getAtRiskBridge:   () => predApi.get("/churn/at-risk-bridge"),
  getUrgentPatients: () => predApi.get("/patients/urgent"),
  getDemoSummary:    () => predApi.get("/demo/summary"),
};

export const interventionAPI = {
  generateMessage: (donorId: string, triggerReason: string, language = "hi") =>
    api.post("/intervention/generate", { donor_id: donorId, trigger_reason: triggerReason, language }),
};
