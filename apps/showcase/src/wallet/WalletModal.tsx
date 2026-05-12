import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, Zap, Loader2, Download, ChevronRight } from "lucide-react";
import type { Wallet } from "@wallet-standard/base";

interface Props {
  open: boolean;
  onClose: () => void;
  onConnect: (wallet: Wallet) => void;
  connecting: boolean;
  available: Wallet[];
}

const BLACKTHORN_NAME = "BLACKTHORN";

export function WalletModal({ open, onClose, onConnect, connecting, available }: Props) {
  const blackthorn = available.find((w) => w.name === BLACKTHORN_NAME);
  const others = available.filter((w) => w.name !== BLACKTHORN_NAME);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: "#111114", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="font-semibold text-sm text-white">Connect Wallet</h2>
              <button onClick={onClose} className="text-white/30 hover:text-white/70">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {blackthorn ? (
                <button
                  onClick={() => onConnect(blackthorn)}
                  disabled={connecting}
                  className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all hover:bg-white/5 disabled:opacity-60"
                  style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.35)" }}
                >
                  <WalletIcon wallet={blackthorn} fallback={<ShieldCheck size={16} className="text-white" />} variant="primary" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-white">BLACKTHORN Wallet</p>
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold"
                        style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>Recommended</span>
                    </div>
                    <p className="text-xs text-white/50 mt-0.5">Pre-flight simulation + live monitoring</p>
                  </div>
                  {connecting
                    ? <Loader2 size={11} className="animate-spin text-accent-soft" />
                    : <Zap size={11} className="text-accent-soft" />}
                </button>
              ) : (
                <a
                  href="/install"
                  className="block w-full p-4 rounded-xl transition-all hover:bg-white/[0.06]"
                  style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.35)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
                      <Download size={14} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">Install BLACKTHORN</p>
                      <p className="text-xs text-white/55 mt-0.5">One-click download · works in Chrome, Brave, Edge, Firefox</p>
                    </div>
                    <ChevronRight size={12} className="text-white/40" />
                  </div>
                </a>
              )}

              {others.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-white/30 font-semibold px-1 mb-1.5">
                    Other wallets
                  </p>
                  {others.map((w) => (
                    <button
                      key={w.name}
                      onClick={() => onConnect(w)}
                      disabled={connecting}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:bg-white/5"
                      style={{ border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      <WalletIcon wallet={w} fallback={<span className="text-sm font-bold">{w.name[0]}</span>} />
                      <p className="text-sm text-white flex-1">{w.name}</p>
                      <span className="text-[10px] text-white/30">No BLACKTHORN protection</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 space-y-2">
              <p className="text-xs text-white/45 leading-relaxed">
                BLACKTHORN sits between this site and your signature. Every transaction is simulated and policy-checked at the wallet level — not on this page.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function WalletIcon({ wallet, fallback, variant }: {
  wallet: Wallet;
  fallback: React.ReactNode;
  variant?: "primary";
}) {
  const size = variant === "primary" ? 40 : 32;
  const radius = variant === "primary" ? 12 : 8;
  return (
    <div
      className="flex items-center justify-center shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: variant === "primary" ? "linear-gradient(135deg,#6366f1,#4f46e5)" : "rgba(255,255,255,0.05)",
      }}
    >
      {wallet.icon ? <img src={wallet.icon} alt="" className="w-full h-full object-contain" /> : fallback}
    </div>
  );
}
