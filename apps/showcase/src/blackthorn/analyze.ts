/**
 * Showcase-side analyze client. Lets a demo site call BLACKTHORN's
 * /v1/analyze endpoint directly — same pipeline the extension's sign popup
 * runs, just rendered on the site itself so visitors can see what the
 * firewall WOULD say before clicking "Sign".
 *
 * Network: requests go through the showcase Vite proxy at /api/v1/analyze
 * (rewrites to localhost:8080). The API key here matches the dev .env's
 * default — production deploys would surface this in env.
 */

import type { VersionedTransaction } from "@solana/web3.js";

export interface RiskFinding {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  details?: Record<string, unknown>;
}

export interface AnalysisResult {
  decision: "safe" | "advisory" | "block";
  safe: boolean;
  reasons: string[];
  riskFindings: RiskFinding[];
  estimatedChanges: {
    sol: Array<{ account: string; deltaLamports: number | null }>;
    tokens: Array<{ mint: string; symbol?: string; deltaAmount: string | null }>;
    approvals: Array<{ delegate: string; amount: string | null }>;
    delegates?: unknown[];
  };
  simulationWarnings: string[];
  offline: boolean;
}

export interface AnalyzeOptions {
  cluster?: "mainnet-beta" | "devnet" | "testnet";
  policy?: Record<string, unknown>;
}

const API_KEY = "dev-key-change-me";

export async function analyzeTransactionForPreview(
  tx: VersionedTransaction,
  userWallet: string,
  opts: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const transactionBase64 = bytesToB64(tx.serialize());
  const res = await fetch("/api/v1/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      cluster: opts.cluster ?? "devnet",
      transactionBase64,
      userWallet,
      policy: opts.policy ?? {},
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`analyze ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as AnalysisResult;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
