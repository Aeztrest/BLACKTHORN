/**
 * x402 PaymentRequirements validation.
 *
 * Defends against malformed or malicious 402 responses before any signing
 * code is invoked.
 *
 * Spec: docs/x402-defense.md §1 + §3.
 */

import { PublicKey } from "@solana/web3.js";

export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { feePayer: string; memo?: string; [k: string]: unknown };
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  cluster?: "mainnet-beta" | "devnet" | "testnet";
}

const NETWORK_TO_CLUSTER: Record<string, ValidationResult["cluster"]> = {
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp":  "mainnet-beta",
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": "devnet",
  // Some implementations use the friendlier "solana:devnet" / "solana:mainnet" string.
  "solana:mainnet":                          "mainnet-beta",
  "solana:devnet":                           "devnet",
  "solana:testnet":                          "testnet",
};

export function validateRequirements(req: unknown): ValidationResult {
  if (!req || typeof req !== "object") return { ok: false, reason: "Requirements is not an object" };
  const r = req as Record<string, unknown>;

  if (r.scheme !== "exact") return { ok: false, reason: `Unsupported scheme: ${String(r.scheme)}` };
  if (typeof r.network !== "string") return { ok: false, reason: "Missing network" };
  const cluster = NETWORK_TO_CLUSTER[r.network];
  if (!cluster) return { ok: false, reason: `Unsupported network: ${r.network}` };

  if (typeof r.asset !== "string") return { ok: false, reason: "Missing asset" };
  if (!isValidPubkey(r.asset)) return { ok: false, reason: "asset is not a valid pubkey" };

  if (typeof r.amount !== "string") return { ok: false, reason: "Missing amount" };
  if (!/^\d+$/.test(r.amount)) return { ok: false, reason: "amount must be an integer string (atomic units)" };

  if (typeof r.payTo !== "string") return { ok: false, reason: "Missing payTo" };
  if (!isValidPubkey(r.payTo)) return { ok: false, reason: "payTo is not a valid pubkey" };

  if (typeof r.maxTimeoutSeconds !== "number" || r.maxTimeoutSeconds <= 0 || r.maxTimeoutSeconds > 600) {
    return { ok: false, reason: "maxTimeoutSeconds out of range (1–600)" };
  }

  const extra = r.extra as Record<string, unknown> | undefined;
  if (!extra || typeof extra !== "object") return { ok: false, reason: "Missing extra.feePayer" };
  if (typeof extra.feePayer !== "string") return { ok: false, reason: "extra.feePayer required" };
  if (!isValidPubkey(extra.feePayer)) return { ok: false, reason: "extra.feePayer is not a valid pubkey" };
  if (extra.memo !== undefined && (typeof extra.memo !== "string" || extra.memo.length > 256)) {
    return { ok: false, reason: "extra.memo must be a string ≤ 256 bytes" };
  }

  return { ok: true, cluster };
}

function isValidPubkey(s: string): boolean {
  try { new PublicKey(s); return true; } catch { return false; }
}

/** Atomic→UI conversion for display + cap math. Pure helper; no async. */
export function atomicToUi(amount: string, decimals: number): number {
  const a = BigInt(amount);
  const scale = 10n ** BigInt(decimals);
  // Two-decimal-place approximation suitable for cap comparisons.
  const intPart = a / scale;
  const fracPart = a % scale;
  return Number(intPart) + Number(fracPart) / Number(scale);
}
