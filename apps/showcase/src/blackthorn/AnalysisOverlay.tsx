import { motion, AnimatePresence } from "framer-motion";
import { Shield, ShieldCheck, ShieldAlert, ShieldX, X, ArrowRight, AlertTriangle } from "lucide-react";
import type { AnalysisResult } from "./types";

interface Props {
  state: "idle" | "analyzing" | "result";
  result?: AnalysisResult;
  onClose: () => void;
  onProceed: () => void;
}

const RISK_CONFIG = {
  NONE: {
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.2)",
    Icon: ShieldCheck,
    label: "SAFE",
  },
  LOW: {
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.2)",
    Icon: ShieldCheck,
    label: "SAFE",
  },
  MEDIUM: {
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    Icon: AlertTriangle,
    label: "WARNING",
  },
  HIGH: {
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.2)",
    Icon: ShieldAlert,
    label: "DANGER",
  },
  CRITICAL: {
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.2)",
    Icon: ShieldX,
    label: "BLOCKED",
  },
};

export function AnalysisOverlay({ state, result, onClose, onProceed }: Props) {
  const config = result ? RISK_CONFIG[result.riskLevel] : RISK_CONFIG.NONE;
  const RiskIcon = config.Icon;

  return (
    <AnimatePresence>
      {state !== "idle" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: "#111114", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-white/40" />
                <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">
                  Blackthorn Security
                </span>
              </div>
              {state === "result" && (
                <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-6">
              {state === "analyzing" && (
                <div className="flex flex-col items-center py-8 gap-6">
                  <div className="relative">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-16 h-16 rounded-full border-2 border-transparent"
                      style={{ borderTopColor: "#6366f1", borderRightColor: "rgba(99,102,241,0.3)" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Shield size={24} className="text-indigo-400" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-white">Analyzing transaction</p>
                    <p className="text-sm text-white/40 mt-1">Simulating on-chain behavior...</p>
                  </div>
                  <div className="w-full space-y-2">
                    {["Decoding instructions", "Simulating state changes", "Checking program reputation", "Running policy engine"].map(
                      (step, i) => (
                        <motion.div
                          key={step}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.18 }}
                          className="flex items-center gap-2 text-xs text-white/30"
                        >
                          <motion.div
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1.5, delay: i * 0.18, repeat: Infinity }}
                            className="w-1 h-1 rounded-full bg-indigo-400"
                          />
                          {step}
                        </motion.div>
                      )
                    )}
                  </div>
                </div>
              )}

              {state === "result" && result && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                  {/* Risk badge */}
                  <div className="flex flex-col items-center gap-3 py-4">
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: config.bg, border: `1px solid ${config.border}` }}
                    >
                      <RiskIcon size={32} style={{ color: config.color }} />
                    </motion.div>
                    <div className="text-center">
                      <span
                        className="text-xs font-bold tracking-widest px-3 py-1 rounded-full"
                        style={{ background: config.bg, color: config.color }}
                      >
                        {config.label}
                      </span>
                      <p className="mt-2 font-semibold text-white text-sm leading-snug">
                        {result.summary}
                      </p>
                    </div>
                  </div>

                  {/* Estimated changes */}
                  {result.estimatedChanges.length > 0 && (
                    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="px-4 py-2 text-xs font-semibold text-white/30 uppercase tracking-wider border-b border-white/5">
                        Estimated Changes
                      </p>
                      <div className="divide-y divide-white/5">
                        {result.estimatedChanges.map((c, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-sm font-medium text-white/70">{c.asset}</span>
                            <div className="text-right">
                              <span
                                className="text-sm font-semibold font-mono"
                                style={{ color: c.direction === "in" ? "#10b981" : "#ef4444" }}
                              >
                                {c.delta}
                              </span>
                              {c.usdValue && (
                                <span className="ml-2 text-xs text-white/30">{c.usdValue}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Risk findings */}
                  {result.riskFindings.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-white/30 uppercase tracking-wider">
                        Threats Detected
                      </p>
                      {result.riskFindings.map((f, i) => (
                        <motion.div
                          key={f.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.08 }}
                          className="flex gap-3 p-3 rounded-xl"
                          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}
                        >
                          <ShieldAlert size={14} className="text-red-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-red-300">{f.label}</p>
                            <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{f.detail}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Reasons */}
                  {result.safe && result.reasons.length > 0 && (
                    <div className="space-y-1.5">
                      {result.reasons.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-white/50">
                          <div className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
                          {r}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Demo mode note */}
                  {result.demoMode && (
                    <p className="text-center text-xs text-white/20">Showcase mode — simulated analysis</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    {result.safe ? (
                      <button
                        onClick={onProceed}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all"
                        style={{ background: "#10b981", color: "#fff" }}
                      >
                        Proceed <ArrowRight size={14} />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={onClose}
                          className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all"
                          style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
                        >
                          Cancel Transaction
                        </button>
                        <button
                          onClick={onProceed}
                          className="px-4 py-3 rounded-xl text-xs text-white/30 hover:text-white/50 transition-colors"
                        >
                          Ignore
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
