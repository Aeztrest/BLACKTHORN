import { type ReactNode, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { WalletContext, type WalletState } from "../wallet/context";
import { WalletModal } from "../wallet/WalletModal";
import { BlackthornBadge } from "./BlackthornBadge";
import { useWallet } from "../wallet/context";

interface SiteTheme {
  primary: string;
  accent?: string;
  bg: string;
  name: string;
  logo: ReactNode;
}

interface Props {
  theme: SiteTheme;
  children: ReactNode;
  navLinks?: { label: string; href?: string }[];
}

function NavBar({ theme, navLinks }: { theme: SiteTheme; navLinks?: Props["navLinks"] }) {
  const { connected, shortAddress, connect, disconnect, connecting } = useWallet();

  return (
    <nav
      className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-6 py-4"
      style={{
        background: `${theme.bg}cc`,
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2.5">
          {theme.logo}
          <span className="font-bold text-white">{theme.name}</span>
        </div>
        {navLinks && (
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((l) => (
              <a key={l.label} href={l.href ?? "#"} className="text-sm text-white/50 hover:text-white/80 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {connected ? (
          <button onClick={disconnect} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium glass hover:bg-white/8 transition-all">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="font-mono text-xs text-white/70">{shortAddress}</span>
            <ChevronDown size={12} className="text-white/30" />
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="btn-primary flex items-center gap-2"
            style={{ background: theme.primary }}
          >
            {connecting ? (
              <><div className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />Connecting...</>
            ) : "Connect Wallet"}
          </button>
        )}
      </div>
    </nav>
  );
}

function randomAddress(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from({ length: 44 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
function shorten(addr: string) { return `${addr.slice(0, 4)}...${addr.slice(-4)}`; }

export function SiteShell({ theme, children, navLinks }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(() => setModalOpen(true), []);
  const disconnect = useCallback(() => setAddress(null), []);

  const handleConfirm = useCallback(async () => {
    setModalOpen(false);
    setConnecting(true);
    await new Promise((r) => setTimeout(r, 900));
    setAddress(randomAddress());
    setConnecting(false);
  }, []);

  const walletState: WalletState = {
    connected: !!address,
    address,
    shortAddress: address ? shorten(address) : null,
    connecting,
    connect,
    disconnect,
  };

  return (
    <div
      className="min-h-screen"
      style={{ "--site-primary": theme.primary, "--site-accent": theme.accent ?? theme.primary, "--site-bg": theme.bg, background: theme.bg } as React.CSSProperties}
    >
      <WalletContext.Provider value={walletState}>
        <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} onConfirm={handleConfirm} />

        <Link to="/" className="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-xs text-white/20 hover:text-white/50 transition-colors">
          <ArrowLeft size={12} />
          Showcase
        </Link>

        <NavBar theme={theme} navLinks={navLinks} />
        <main className="pt-20">{children}</main>
        <BlackthornBadge />
      </WalletContext.Provider>
    </div>
  );
}
