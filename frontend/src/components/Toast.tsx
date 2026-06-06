import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertTriangle, Info, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

// ── Global store (singleton, no Zustand needed) ────────────────────────────────
type Listener = (toasts: Toast[]) => void;
let _toasts: Toast[] = [];
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach(l => l([..._toasts]));
}

export const toast = {
  success: (title: string, message?: string) => _add("success", title, message),
  error:   (title: string, message?: string) => _add("error",   title, message),
  info:    (title: string, message?: string) => _add("info",    title, message),
  warning: (title: string, message?: string) => _add("warning", title, message),
};

function _add(type: ToastType, title: string, message?: string) {
  const id = Math.random().toString(36).slice(2);
  _toasts = [{ id, type, title, message }, ..._toasts].slice(0, 5);
  notify();
  setTimeout(() => {
    _toasts = _toasts.filter(t => t.id !== id);
    notify();
  }, 4200);
}

// ── Toast hook ─────────────────────────────────────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = React.useState<Toast[]>(_toasts);
  React.useEffect(() => {
    _listeners.add(setToasts);
    return () => { _listeners.delete(setToasts); };
  }, []);
  return toasts;
}

// ── Icon map ───────────────────────────────────────────────────────────────────
const ICON: Record<ToastType, { icon: React.FC<any>; color: string; bg: string; border: string }> = {
  success: { icon: CheckCircle,  color: "var(--success)",      bg: "var(--success-dim)",  border: "rgba(29,184,142,0.25)" },
  error:   { icon: AlertTriangle,color: "var(--crimson-light)", bg: "var(--crimson-dim)",  border: "var(--crimson-border)" },
  warning: { icon: AlertTriangle,color: "var(--warning)",       bg: "var(--warning-dim)",  border: "rgba(232,149,42,0.3)" },
  info:    { icon: Info,         color: "var(--info)",          bg: "var(--info-dim)",     border: "rgba(99,102,241,0.25)" },
};

// ── ToastContainer — mount once in main.tsx / App.tsx ─────────────────────────
export function ToastContainer() {
  const toasts = useToasts();

  return createPortal(
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 10,
      pointerEvents: "none",
    }}>
      <AnimatePresence>
        {toasts.map(t => {
          const cfg = ICON[t.type];
          const Icon = cfg.icon;
          return (
            <motion.div key={t.id}
              initial={{ opacity: 0, x: 60, scale: 0.92 }}
              animate={{ opacity: 1, x: 0,  scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              style={{
                pointerEvents: "all",
                background: "var(--surface)",
                border: `1px solid ${cfg.border}`,
                borderLeft: `4px solid ${cfg.color}`,
                borderRadius: 12,
                padding: "14px 16px",
                minWidth: 300, maxWidth: 380,
                display: "flex", gap: 12, alignItems: "flex-start",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                backdropFilter: "blur(16px)",
              }}
            >
              <Icon size={18} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-main)", marginBottom: t.message ? 4 : 0 }}>
                  {t.title}
                </div>
                {t.message && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {t.message}
                  </div>
                )}
              </div>
              <button onClick={() => { _toasts = _toasts.filter(x => x.id !== t.id); notify(); }}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                <X size={14} />
              </button>

              {/* Auto-dismiss progress bar */}
              <motion.div
                initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 4.0, ease: "linear" }}
                style={{
                  position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
                  background: cfg.color, transformOrigin: "left", borderRadius: "0 0 12px 12px", opacity: 0.5,
                }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
}
