/**
 * Popup home tab.
 * Spec: docs/wallet-spec.md §3.2 (hero balance + quick actions) + §3.4 (tab content).
 *
 * Send/Receive open as full-popup overlays. Airdrop runs in place and updates
 * the hero balance on success. Smart-wallet balance lands in T26 once the
 * allowance ledger + monitor are wired.
 */

import { useCallback, useEffect, useState } from "react";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Send, Download, Sparkles, Loader2 } from "lucide-react";
import { useRpc, useWalletState } from "../shared/state-context";
import { ReceiveScreen } from "./ReceiveScreen";
import { SendScreen } from "./SendScreen";

const RPC_BY_CLUSTER: Record<string, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  "devnet":       "https://api.devnet.solana.com",
  "testnet":      "https://api.testnet.solana.com",
};

export function Home() {
  const state = useWalletState();
  const rpc = useRpc();
  const [balance, setBalance] = useState<number | null>(null);
  const [airdropping, setAirdropping] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);
  const [airdropError, setAirdropError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<"send" | "receive" | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!state?.authorityAddress) return;
    const conn = new Connection(RPC_BY_CLUSTER[state.network] ?? RPC_BY_CLUSTER.devnet!, "confirmed");
    try {
      const lamports = await conn.getBalance(new PublicKey(state.authorityAddress));
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch { /* keep last value */ }
  }, [state?.authorityAddress, state?.network]);

  useEffect(() => {
    let cancelled = false;
    void refreshBalance().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [refreshBalance]);

  const onAirdrop = async () => {
    setAirdropping(true);
    setAirdropError(null);
    setAirdropMsg(null);
    try {
      const r = await rpc.call("wallet.airdrop", undefined as never);
      setAirdropMsg(`Received ${r.amountSol} devnet SOL`);
      await refreshBalance();
    } catch (err) {
      setAirdropError(err instanceof Error ? err.message : String(err));
    } finally {
      setAirdropping(false);
      setTimeout(() => { setAirdropMsg(null); setAirdropError(null); }, 4000);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 relative">
      {/* Hero balance */}
      <section
        className="rounded-card p-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015))",
          border: "1px solid var(--line)",
        }}
      >
        <p className="label mb-1.5">Smart Wallet</p>
        <p className="text-[40px] font-extrabold leading-none font-mono tracking-tight">
          {balance === null ? "—" : balance.toFixed(4)}
          <span className="text-base text-text-faint font-bold ml-1.5">SOL</span>
        </p>
        <p className="text-text-faint text-[11px] mt-2">
          {balance && balance > 0 ? "Authority funded · ready to provision Swig" : "Authority empty · run an airdrop to get started"}
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <ActionButton icon={Send}     label="Send"    onClick={() => setOverlay("send")} />
          <ActionButton icon={Download} label="Receive" onClick={() => setOverlay("receive")} />
          <ActionButton icon={Sparkles} label={airdropping ? "…" : "Airdrop"}
            onClick={onAirdrop} loading={airdropping} />
        </div>

        {airdropMsg && (
          <div className="mt-3 px-3 py-1.5 rounded-input text-[11px] flex items-center gap-1.5"
               style={{ background: "var(--ok-dim)", color: "var(--ok)" }}>
            <Sparkles size={11} /> {airdropMsg}
          </div>
        )}
        {airdropError && (
          <div className="mt-3 px-3 py-1.5 rounded-input text-[11px]"
               style={{ background: "var(--bad-dim)", color: "var(--bad)" }}>
            {airdropError}
          </div>
        )}
      </section>

      {/* Recent activity placeholder until T26 lands */}
      <section className="card flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="label !mb-0">Recent activity</p>
          <span className="text-[10px] text-text-faint">live in T26</span>
        </div>
        <p className="text-xs text-text-faint">
          Your transactions, dApp signatures, and x402 payments will live here once the allowance ledger is online.
        </p>
      </section>

      {overlay === "receive" && state?.authorityAddress && (
        <ReceiveScreen
          address={state.authorityAddress}
          network={state.network}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay === "send" && state?.authorityAddress && (
        <SendScreen
          authorityAddress={state.authorityAddress}
          network={state.network}
          balanceSol={balance}
          onClose={() => setOverlay(null)}
          onSent={refreshBalance}
        />
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon, label, onClick, loading,
}: { icon: typeof Send; label: string; onClick?: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick || loading}
      className="flex flex-col items-center gap-1 py-2.5 rounded-input transition-all
                 hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)" }}
    >
      {loading ? <Loader2 size={14} className="animate-spin text-text" /> : <Icon size={14} className="text-text" />}
      <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
    </button>
  );
}
