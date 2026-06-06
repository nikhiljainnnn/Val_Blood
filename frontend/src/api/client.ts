import { API_CONFIG } from "./config";
import axios from "axios";
import { useAuthStore } from "../store";

const BASE_URL = API_CONFIG.baseURL;

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ─── Typed API calls ──────────────────────────────────────────────────────────

export const authAPI = {
  login: (phone: string, password: string) =>
    api.post("/auth/login", { phone, password }),
  registerDonor: (body: unknown) =>
    api.post("/auth/register/donor", body),
  registerPatient: (body: unknown) =>
    api.post("/auth/register/patient", body),
};

export const matchingAPI = {
  getGuardianCircle: (patientId: string) =>
    api.get(`/guardian-circle/${patientId}`),
  createRequest: (body: unknown) =>
    api.post("/transfusion/request", body),
  buildCircle: (patientId: string) =>
    api.post(`/guardian-circle/build/${patientId}`),
};

export const predictionAPI = {
  getChurnBatch:    () => api.get("/churn/batch"),
  getChurnDonor:    (donorId: string) => api.get(`/churn/donor/${donorId}`),
  getHbForecast:    (patientId: string) => api.get(`/hb-forecast/${patientId}`),
  getUrgentBatch:   () => api.get("/hb-forecast/batch/all"),
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
