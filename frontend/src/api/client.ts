import { API_CONFIG } from "./config";
import axios from "axios";
import { useAuthStore } from "../store";

const BASE_URL = API_CONFIG.baseURL;
const PRED_URL = API_CONFIG.predURL;

// ── Demo mode: skip real API calls if no backend ─────────────────────────────
// Set VITE_DEMO_MODE=true in .env, or the app auto-detects backend unavailability.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";


const baseConfig = {
  baseURL: BASE_URL,
  timeout: 60000,               // Allow 60s for agentic workflow to complete
  headers: { "Content-Type": "application/json" }
};

export const api = axios.create(baseConfig);

export const predApi = axios.create({
  baseURL: PRED_URL,
  timeout: 60000,
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

// ── Upgrades 1–6 + Agent API ─────────────────────────────────────────────────
// All routes go through the api-gateway base URL (/api/v1).
// predApi is used for prediction-service routes (port 8002).
export const upgradesAPI = {

  // ── Agent (orchestrator.py) ──────────────────────────────────────────────
  /** Run the Bedrock Supervisor with a free-text task */
  runAgent: (task: string, context: object = {}) =>
    api.post("/agent/run", { task, context }),

  /** Trigger a predefined scheduled task (daily_churn_scan | patient_request | etc.) */
  runScheduled: (trigger: string) =>
    api.post("/agent/scheduled", { trigger }),

  /** Health check — returns model, demo_mode, tools list */
  agentStatus: () =>
    api.get("/agent/status"),

  // ── Upgrade 6: Past-due transfusion alerts ───────────────────────────────
  /** Returns urgency breakdown: critical 656, urgent 67, high 28, normal 35 */
  alertSummary: () =>
    api.get("/admin/alerts/summary"),

  /** Run the urgency scan and trigger cascades for critical patients */
  scanAlerts: () =>
    api.post("/admin/alerts/scan"),

  /** Manually trigger outreach cascade for a specific patient */
  cascadePatient: (patientId: string, urgency = "urgent") =>
    api.post(`/admin/alerts/cascade/${patientId}`, null, { params: { urgency } }),

  // ── Upgrade 2: Guest activation ──────────────────────────────────────────
  /** Stats on the 2,420 dormant guest pool */
  guestPoolStats: () =>
    api.get("/admin/guest-pool/stats"),

  /** Activate dormant guests (optional: filter by blood_group) */
  activateGuests: (blood_group?: string, limit = 100) =>
    api.post("/admin/activate-guests", { blood_group, limit }),

  // ── Upgrade 5: Blood group awareness campaign ────────────────────────────
  /** Trigger monthly campaign for 160 users with unknown blood group */
  runAwareness: () =>
    api.post("/notify/awareness/run"),

  /** Stats: how many unknown blood group users, camp locations */
  awarenessStats: () =>
    api.get("/notify/awareness/stats"),

  // ── Upgrade 4: One-time → regular conversion model ───────────────────────
  /** Top N one-time donors ranked by conversion probability (model AUC 0.9214) */
  conversionCandidates: (top_n = 50) =>
    predApi.get("/conversion/candidates", { params: { top_n } }),

  /** Assign a candidate as bridge donor + send personalised invite */
  assignConversion: (body: {
    donor_id: string; patient_id: string;
    name: string; blood_group: string; language?: string;
  }) =>
    predApi.post("/conversion/assign", body),

  // ── Upgrade 1: Failure learning ──────────────────────────────────────────
  /** Log outreach failure and get recommended next protocol */
  failureLearn: (body: {
    donor_id: string; calls_attempted: number;
    days_since_last_donation: number;
    inactive_trigger_comment?: string; language?: string;
  }) =>
    api.post("/notify/failure-learn", body),

  // ── Upgrade 3: Conversation memory ───────────────────────────────────────
  /** Get structured interaction history summary for a donor */
  donorContext: (donorId: string) =>
    predApi.get(`/donor/context/${donorId}`),
};
