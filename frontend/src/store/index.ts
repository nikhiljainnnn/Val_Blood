import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Auth store ───────────────────────────────────────────────────────────────
import { signOut, fetchAuthSession } from "../lib/cognito";

// ─── Auth store ───────────────────────────────────────────────────────────────
interface AuthState {
  token:        string | null;
  role:         string | null;
  userId:       string | null;
  name:         string | null;
  setAuth:      (token: string, role: string, userId: string, name: string) => void;
  refreshToken: () => Promise<void>;
  logout:       () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token:   null,
      role:    null,
      userId:  null,
      name:    null,

      setAuth: (token, role, userId, name) =>
        set({ token, role, userId, name }),

      // Call this on app load to silently refresh Cognito session
      refreshToken: async () => {
        try {
          const session = await fetchAuthSession();
          const token = session.tokens?.idToken?.toString() ?? null;
          if (token) set({ token });
        } catch {
          set({ token: null, role: null, userId: null, name: null });
        }
      },

      logout: async () => {
        try { await signOut(); } catch { /* ignore */ }
        set({ token: null, role: null, userId: null, name: null });
      },
    }),
    { name: "raksetu-auth" }
  )
);

// ─── Dashboard live event store ───────────────────────────────────────────────
export interface LiveEvent {
  id:        string;
  event:     string;
  data:      Record<string, unknown>;
  urgency:   "normal" | "urgent" | "critical";
  timestamp: string;
}

interface DashboardState {
  events:       LiveEvent[];
  connected:    boolean;
  stats:        Record<string, number>;
  addEvent:     (e: LiveEvent) => void;
  setConnected: (v: boolean) => void;
  setStats:     (s: Record<string, number>) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  events:       [],
  connected:    false,
  stats:        {},
  addEvent: (e) =>
    set((state) => ({
      events: [e, ...state.events].slice(0, 50),  // keep last 50
    })),
  setConnected: (v) => set({ connected: v }),
  setStats:     (s) => set({ stats: s }),
}));

// ─── Patient store ────────────────────────────────────────────────────────────
export interface GuardianDonor {
  donor_id:          string;
  donor_name:        string;
  phone:             string;
  language:          string;
  compatibility:     { score: number; mismatch_count: number; risk_level: string };
  churn_probability: number;
  availability_prob: number;
  days_to_eligible:  number;
  rank:              number;
  status:            string;
}

interface PatientState {
  selectedPatientId: string | null;
  guardianCircle:    GuardianDonor[];
  hbForecast:        Record<string, unknown> | null;
  setPatient:        (id: string) => void;
  setCircle:         (donors: GuardianDonor[]) => void;
  setForecast:       (f: Record<string, unknown>) => void;
}

export const usePatientStore = create<PatientState>((set) => ({
  selectedPatientId: null,
  guardianCircle:    [],
  hbForecast:        null,
  setPatient: (id)      => set({ selectedPatientId: id }),
  setCircle:  (donors)  => set({ guardianCircle: donors }),
  setForecast: (f)      => set({ hbForecast: f }),
}));
