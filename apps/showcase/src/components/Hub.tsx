import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, ArrowRight, Zap } from "lucide-react";

const SITES = [
  {
    path: "/solswap",
    name: "SolSwap",
    tagline: "DeFi Token Swap",
    description: "Swap any Solana token with best-rate Jupiter routing.",
    scenario: "Fund drain · Unknown program",
    color: "#6366f1",
    emoji: "⚡",
    gradient: "from-indigo-500/20 to-violet-500/10",
  },
  {
    path: "/pixeldrop",
    name: "PixelDrop",
    tagline: "NFT Minting",
    description: "Mint generative NFTs from the Cyber Phantoms collection.",
    scenario: "Wallet drainer · Token authority theft",
    color: "#ec4899",
    emoji: "🎨",
    gradient: "from-pink-500/20 to-purple-500/10",
  },
  {
    path: "/solyield",
    name: "SolYield",
    tagline: "Liquid Staking",
    description: "Stake SOL and earn yield with liquid staking protocols.",
    scenario: "Unverified pool · No unstake path",
    color: "#10b981",
    emoji: "📈",
    gradient: "from-emerald-500/20 to-teal-500/10",
  },
  {
    path: "/claimhub",
    name: "ClaimHub",
    tagline: "Airdrop Claims",
    description: "Claim your allocation from Solana ecosystem airdrops.",
    scenario: "Phishing · Unlimited token approval",
    color: "#f59e0b",
    emoji: "🎁",
    gradient: "from-amber-500/20 to-orange-500/10",
  },
  {
    path: "/launchpad",
    name: "LaunchPad",
    tagline: "Token Launch",
    description: "Participate in vetted Solana token launches.",
    scenario: "Rug pull · Mint authority · No LP lock",
    color: "#8b5cf6",
    emoji: "🚀",
    gradient: "from-violet-500/20 to-purple-500/10",
  },
];

export function Hub() {
  return (
    <div className="min-h-screen" style={{ background: "#090909" }}>
      {/* Header */}
      <div className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
              <Shield size={18} className="text-indigo-400" />
            </div>
            <div>
              <span className="font-black text-white tracking-tight">BLACKTHORN</span>
              <span className="text-white/30 text-xs ml-2">Showcase</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/25">
            <Zap size={11} className="text-indigo-400" />
            <span>Solana Transaction Security</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8" style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Live Interactive Demo
          </span>
          <h1 className="text-6xl font-black text-white mb-6 leading-none tracking-tight">
            See BLACKTHORN<br />
            <span style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              protect you in real-time.
            </span>
          </h1>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">
            Five real-world Solana scenarios. Each site looks production-ready.
            Toggle "danger mode" to see exactly how BLACKTHORN catches threats before you sign.
          </p>
        </motion.div>
      </div>

      {/* Sites grid */}
      <div className="max-w-6xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {SITES.map((site, i) => (
            <motion.div
              key={site.path}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <Link to={site.path} className="group block h-full">
                <div
                  className="h-full rounded-2xl p-6 transition-all duration-300 group-hover:scale-[1.02]"
                  style={{
                    background: "#0f0f0f",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = `${site.color}40`;
                    (e.currentTarget as HTMLDivElement).style.background = `${site.color}08`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)";
                    (e.currentTarget as HTMLDivElement).style.background = "#0f0f0f";
                  }}
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl" style={{ background: `${site.color}18`, border: `1px solid ${site.color}30` }}>
                        {site.emoji}
                      </div>
                      <div>
                        <h3 className="font-bold text-white">{site.name}</h3>
                        <p className="text-xs" style={{ color: site.color }}>{site.tagline}</p>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-white/20 group-hover:text-white/50 transition-colors mt-1" />
                  </div>

                  <p className="text-sm text-white/40 mb-5 leading-relaxed">{site.description}</p>

                  <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
                    <Shield size={12} className="text-red-400 shrink-0" />
                    <p className="text-xs text-red-400/70">{site.scenario}</p>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-16 rounded-2xl p-8"
          style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.12)" }}
        >
          <h2 className="text-lg font-bold text-white mb-6 text-center">How it works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Connect wallet", desc: "Use Swig — no extension needed" },
              { step: "02", title: "Trigger action", desc: "Swap, mint, stake, claim, or invest" },
              { step: "03", title: "BLACKTHORN analyzes", desc: "Transaction simulated & policies checked" },
              { step: "04", title: "Safe or blocked", desc: "You decide with full context" },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 font-mono text-xs font-bold" style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
                  {step}
                </div>
                <p className="font-semibold text-white text-sm">{title}</p>
                <p className="text-xs text-white/35 mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
