/**
 * Mirror of the BLACKTHORN /v1/analyze response shape.
 * Source of truth: apps/server/src/domain/decision.ts
 */

export type Cluster = "mainnet-beta" | "devnet" | "testnet";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type RiskFindingCode =
  | "SIMULATION_FAILED"
  | "RISKY_PROGRAM_INTERACTION"
  | "UNKNOWN_PROGRAM_EXPOSURE"
  | "APPROVAL_CHANGE_DETECTED"
  | "DELEGATE_CHANGE_DETECTED"
  | "LOSS_PERCENT_UNAVAILABLE"
  | "ESTIMATED_LOSS_EXCEEDS_MAX"
  | "POST_BALANCE_TOO_LOW"
  | "LOW_CONFIDENCE_INCOMPLETE_DATA"
  | "EXCESSIVE_CPI_DEPTH"
  | "SUSPICIOUS_COMPUTE_PATTERN"
  | "UNVERIFIED_PROGRAM_REPUTATION"
  // Catch-all for any future server codes
  | (string & {});

export interface RiskFinding {
  code: RiskFindingCode;
  severity: RiskSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface SolDelta {
  account: string;
  preLamports: number | null;
  postLamports: number | null;
  deltaLamports: number | null;
}

export interface TokenDelta {
  account: string;
  mint: string;
  owner?: string | null;
  preAmount?: string | null;
  postAmount?: string | null;
  deltaAmount?: string | null;
  decimals?: number | null;
  symbol?: string | null;
}

export interface ApprovalChange {
  delegate: string;
  amount?: string;
  mint?: string;
}

export interface EstimatedChanges {
  sol: SolDelta[];
  tokens: TokenDelta[];
  approvals: ApprovalChange[];
  delegates: ApprovalChange[];
}

export interface DecisionMeta {
  analysisVersion: string;
  cluster: Cluster;
  simulatedAt: string;
  confidence: "low" | "medium" | "high";
  integratorRequestId?: string;
}

export interface AnalysisResult {
  safe: boolean;
  reasons: string[];
  estimatedChanges: EstimatedChanges;
  riskFindings: RiskFinding[];
  simulationWarnings: string[];
  meta?: DecisionMeta;
  annotation?: unknown;
  suggestions?: unknown;
}

/** Highest severity present in a list of findings, or null if empty. */
export function maxSeverity(findings: RiskFinding[]): RiskSeverity | null {
  const order: RiskSeverity[] = ["low", "medium", "high", "critical"];
  let topIdx = -1;
  for (const f of findings) {
    const idx = order.indexOf(f.severity);
    if (idx > topIdx) topIdx = idx;
  }
  return topIdx === -1 ? null : order[topIdx]!;
}
