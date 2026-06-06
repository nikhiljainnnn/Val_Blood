import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Loader, CheckCircle, BrainCircuit } from "lucide-react";
import { upgradesAPI } from "../api/client";
import { useDashboardStore } from "../store";

export default function AgentModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [task, setTask] = useState(
    "Check the matching service for urgent or critical patients. If any are found, check our dormant guest pool and run an awareness campaign for them."
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runAgent = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await upgradesAPI.runAgent(task);
      setResult(res.data);
      
      // Inject action into the Dashboard's Live Feed
      useDashboardStore.getState().addEvent({
        id: `agent-${Date.now()}`,
        event: "Agent Workflow Complete",
        urgency: "urgent",
        timestamp: Date.now(),
        data: { task }
      });
      
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Failed to run agent");
    } finally {
      setRunning(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.7)",
              backdropFilter: "blur(4px)",
              zIndex: 999,
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            style={{
              position: "fixed",
              top: "10vh",
              left: "50%",
              transform: "translateX(-50%)",
              width: "90%",
              maxWidth: 700,
              maxHeight: "80vh",
              background: "var(--navy-2)",
              border: "1px solid var(--border-light)",
              borderRadius: 20,
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border-light)", background: "rgba(255,255,255,0.02)" }}>
              <div>
                <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700 }}>
                  🤖 Bedrock Nova Supervisor
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  Autonomous Agent Workflow Tester
                </p>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 24, overflowY: "auto" }}>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
                Task Prompt
              </label>
              <textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 80,
                  background: "var(--navy-1)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 12,
                  padding: 16,
                  color: "var(--text-main)",
                  fontFamily: "inherit",
                  fontSize: 14,
                  lineHeight: 1.5,
                  marginBottom: 16,
                  resize: "vertical",
                }}
              />

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={runAgent}
                  disabled={running}
                  className="btn-primary"
                  style={{ padding: "10px 24px", display: "flex", alignItems: "center", gap: 8, opacity: running ? 0.7 : 1 }}
                >
                  {running ? <Loader size={16} className="spin" /> : <Play size={16} />}
                  {running ? "Agent is Thinking..." : "Execute Workflow"}
                </motion.button>
              </div>

              {error && (
                <div style={{ marginTop: 24, padding: 16, background: "rgba(232,85,78,0.1)", border: "1px solid rgba(232,85,78,0.3)", borderRadius: 12, color: "var(--crimson)" }}>
                  <strong>Error:</strong> {error}
                </div>
              )}

              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ marginTop: 24 }}
                >
                  <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--text-main)", display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle size={16} style={{ color: "var(--success)" }} /> Execution Complete
                  </h3>
                  
                  {/* Clean up and format the response text */}
                  {(() => {
                    let responseText = result.response || "";
                    let thinkingText = "";
                    
                    const thinkMatch = responseText.match(/<thinking>([\s\S]*?)<\/thinking>/);
                    if (thinkMatch) {
                      thinkingText = thinkMatch[1].trim();
                      responseText = responseText.replace(/<thinking>[\s\S]*?<\/thinking>/, "").trim();
                    }

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {thinkingText && (
                          <div style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid var(--border-light)",
                            borderRadius: 12,
                            padding: "12px 16px",
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase" }}>
                              <BrainCircuit size={12} /> Agent Thinking Process
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", fontStyle: "italic" }}>
                              {thinkingText}
                            </div>
                          </div>
                        )}
                        
                        {responseText && (
                          <div style={{
                            background: "var(--navy-1)",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            padding: "16px",
                            fontFamily: "var(--font-main)",
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: "var(--text-main)",
                            whiteSpace: "pre-wrap",
                          }}>
                            {responseText}
                          </div>
                        )}
                        
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-subtle)", textAlign: "right" }}>
                          Completed in {result.iterations} iterations
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
