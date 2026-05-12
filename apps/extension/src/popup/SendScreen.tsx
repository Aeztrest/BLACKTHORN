/**
 * Send overlay — recipient address + amount in SOL → broadcast via the
 * `wallet.transferSol` RPC. Phantom-style minimal flow: paste, type, send.
 *
 * Validates the address client-side (PublicKey shape) before enabling the
 * Send button. The background handler enforces balance + builds + confirms.
 */

import { useState, useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import { X, Loader2, ArrowRight, ExternalLink } from "lucide-react";
import { useRpc } from "../shared/state-context";

interface Props {
  authorityAddress: string;
  network: string;
  balanceSol: number | null;
  onClose: () => void;
  onSent: () => void;
}

export function SendScreen({ authorityAddress, network, balanceSol, onClose, onSent }: Props) {
  const rpc = useRpc();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ signature: string } | null>(null);

  const addressValid = useMemo(() => {
    if (!to.trim()) return false;
    try { new PublicKey(to.trim()); return true; } catch { return false; }
  }, [to]);

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const FEE_BUFFER_SOL = 0.000005;
  const overBalance = balanceSol !== null && (amountNum + FEE_BUFFER_SOL) > balanceSol;
  const sameAsSelf = addressValid && to.trim() === authorityAddress;
  const canSend = addressValid && amountValid && !overBalance && !sameAsSelf && !sending;

  const onMax = () => {
    if (balanceSol === null) return;
    const max = Math.max(0, balanceSol - FEE_BUFFER_SOL);
    setAmount(max.toFixed(6));
  };

  const onSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const r = await rpc.call("wallet.transferSol", { to: to.trim(), amountSol: amountNum });
      setSuccess({ signature: r.signature });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const explorer = success
    ? `https://explorer.solana.com/tx/${success.signature}?cluster=${network === "mainnet-beta" ? "mainnet-beta" : network}`
    : null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--line)" }}>
        <p className="font-semibold text-sm">Send SOL</p>
        <button onClick={onClose} className="p-1.5 rounded-input hover:bg-white/5">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 px-4 py-4 flex flex-col gap-4 overflow-y-auto">
        {success
          ? (
            <div className="card text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                   style={{ background: "var(--ok-dim)", color: "var(--ok)" }}>
                <ArrowRight size={20} />
              </div>
              <p className="font-bold mb-1">Sent</p>
              <p className="text-text-faint text-[11px] mb-4">
                {amount} SOL → <span className="font-mono">{to.slice(0, 6)}…{to.slice(-4)}</span>
              </p>
              <a
                href={explorer ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-accent-soft hover:text-accent"
              >
                View on Solana Explorer <ExternalLink size={10} />
              </a>
              <button onClick={onClose} className="btn-primary w-full mt-5">Done</button>
            </div>
          )
          : (
            <>
              <div>
                <label className="label">Recipient address</label>
                <input
                  className="input"
                  placeholder="Solana address"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
                {to.trim() && !addressValid && (
                  <p className="text-bad text-[10px] mt-1.5">Not a valid Solana address.</p>
                )}
                {sameAsSelf && (
                  <p className="text-warn text-[10px] mt-1.5">That's your own address.</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="label !mb-0">Amount (SOL)</span>
                  <button
                    onClick={onMax}
                    disabled={balanceSol === null || balanceSol <= 0}
                    className="text-[10px] text-text-faint hover:text-text disabled:opacity-40 px-2 py-0.5 rounded-input"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--line)" }}
                  >
                    Max
                  </button>
                </div>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="text-text-faint text-[10px] mt-1.5">
                  Balance: {balanceSol === null ? "—" : `${balanceSol.toFixed(4)} SOL`}
                </p>
                {amount && !amountValid && (
                  <p className="text-bad text-[10px] mt-1.5">Enter a positive number.</p>
                )}
                {overBalance && amountValid && (
                  <p className="text-bad text-[10px] mt-1.5">
                    Amount + ~{(FEE_BUFFER_SOL).toFixed(6)} SOL fee exceeds balance.
                  </p>
                )}
              </div>

              {error && (
                <div className="p-2.5 rounded-input text-[11px]"
                     style={{ background: "var(--bad-dim)", color: "var(--bad)" }}>
                  {error}
                </div>
              )}

              <button
                onClick={onSend}
                disabled={!canSend}
                className="btn-primary mt-auto"
              >
                {sending
                  ? <><Loader2 size={14} className="animate-spin" /> Confirming…</>
                  : <>Send {amount && amountValid ? `${amountNum} SOL` : ""}</>}
              </button>
            </>
          )}
      </div>
    </div>
  );
}

