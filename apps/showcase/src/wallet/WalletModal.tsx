import { motion, AnimatePresence } from "framer-motion";
import { X, Zap } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const WALLETS = [
  { id: "swig", name: "Swig Wallet", tag: "Smart Wallet", active: true, color: "#6366f1" },
  { id: "phantom", name: "Phantom", tag: "Extension", active: false, color: "#ab9ff2" },
  { id: "solflare", name: "Solflare", tag: "Extension", active: false, color: "#fc7227" },
  { id: "backpack", name: "Backpack", tag: "Extension", active: false, color: "#e33e3e" },
];

export function WalletModal({ open, onClose, onConfirm }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
          onClick={onClose}
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
              <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-3 space-y-2">
              {WALLETS.map((w) => (
                <button
                  key={w.id}
                  disabled={!w.active}
                  onClick={w.active ? onConfirm : undefined}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl transition-all ${
                    w.active
                      ? "hover:bg-white/5 cursor-pointer"
                      : "opacity-35 cursor-not-allowed"
                  }`}
                  style={w.active ? { border: `1px solid rgba(99,102,241,0.3)`, background: "rgba(99,102,241,0.06)" } : { border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
                      style={{ background: w.active ? `${w.color}22` : "rgba(255,255,255,0.06)", color: w.color }}
                    >
                      {w.name[0]}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">{w.name}</p>
                      <p className="text-xs text-white/35">{w.tag}</p>
                    </div>
                  </div>
                  {w.active && (
                    <div className="flex items-center gap-1.5">
                      <Zap size={11} style={{ color: w.color }} />
                      <span className="text-xs font-semibold" style={{ color: w.color }}>
                        Connect
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="px-5 pb-5">
              <p className="text-xs text-white/25 text-center leading-relaxed">
                Swig is a smart wallet — no extension needed.{" "}
                <span className="text-white/40">Session-based authorization.</span>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
