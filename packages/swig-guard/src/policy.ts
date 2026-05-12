/**
 * BLACKTHORN guard policy DSL — v2.
 * Source of truth: docs/policy-dsl.md (mirrored 1:1 here, plus the x402,
 * allowance, and behavioral rules nothing else has).
 *
 * The server-side schema (apps/server/src/domain/policy.ts) carries the
 * pre-sign subset; client-only rules (allowance windows, behavioral alerts)
 * live exclusively in the wallet.
 */

export interface GuardPolicy {
  /* ───── 1.1 Pre-sign rules (server + client both evaluate) ───── */

  /** Reject if estimated SOL loss exceeds this fraction of the wallet's pre-balance. 0–100. */
  maxLossPercent?: number;

  /** Reject if post-tx balance of the configured mint falls below this UI amount. */
  minPostUsdcBalance?: number;

  /** Mint to apply minPostUsdcBalance to. Defaults to cluster USDC when unset. */
  minPostTokenMint?: string;

  /** Reject when a new SPL Token Approve appears in the simulation. */
  blockApprovalChanges?: boolean;

  /** Reject when an existing token delegate is changed. */
  blockDelegateChanges?: boolean;

  /** Reject when a tx invokes a program flagged in BLACKTHORN's reputation DB. */
  blockRiskyPrograms?: boolean;

  /** Reject when a tx invokes any program not in the known-safe list. */
  blockUnknownProgramExposure?: boolean;

  /** If true, medium-severity advisories alone do not block. Critical/high still do. */
  allowWarnings?: boolean;

  /** When true (default), simulation must succeed for safe=true. */
  requireSuccessfulSimulation?: boolean;

  /* ───── 1.2 x402 protocol rules (client-only) ───── */

  /** Maximum SOL or USDC equivalent value of a single x402 payment. */
  maxX402PerTx?: number;

  /** Rolling 1-hour cap of cumulative x402 spend, per (merchant, asset). */
  x402HourlyCap?: number;

  /** Rolling 24-hour cap. */
  x402DailyCap?: number;

  /** Allowlist of facilitator pubkeys (extra.feePayer). When set, refuses unknown facilitators. */
  allowedFacilitators?: string[];

  /** Allowlist of asset mint pubkeys. When set, refuses payments in other mints. */
  allowedMints?: string[];

  /** Allowlist of merchant origins. When set, refuses unknown origins. */
  allowedMerchantOrigins?: string[];

  /** Denylist of merchant origins. Always refused even when allowlist is empty. */
  blockedMerchantOrigins?: string[];

  /** Refuse x402 payments whose tx omits the SPL Memo instruction. */
  requireMemo?: boolean;

  /** Refuse x402 payments whose recentBlockhash is older than this in seconds. */
  requireBlockhashMaxAgeSeconds?: number;

  /** Refuse x402 payments whose ComputeUnitPrice exceeds this microlamports/CU value. */
  maxComputeUnitPriceMicroLamports?: number;

  /** Cross-check the named feePayer against the facilitator's /supported endpoint. */
  requireFeePayerSupportedCheck?: boolean;

  /** Block x402 payments whose `amount` deviates more than `anomalyStdDev`× from the merchant's running mean. */
  blockAmountAnomalies?: boolean;

  /** Multiplier for anomaly detection. Default 4. */
  anomalyStdDev?: number;

  /* ───── 1.3 Allowance / authorization rules (client-only) ───── */

  /** Auto-revoke a merchant's Swig sub-key after this many idle days. 0 = never. */
  autoRevokeAfterIdleDays?: number;

  /** Auto-pause an allowance when it hits 100% of dailyCap. */
  autoPauseOnDailyCapHit?: boolean;

  /** Maximum number of active sub-keys at once. 0 = no limit. */
  maxActiveSubKeys?: number;

  /** Refuse SPL Token Approve to grant unlimited (u64::MAX) — always cap. */
  refuseUnlimitedApprovals?: boolean;

  /* ───── 1.4 Behavioral / monitoring rules (client-only) ───── */

  /** Trigger drift alerts when an outgoing tx wasn't signed via BLACKTHORN. */
  driftAlerts?: boolean;

  /** Trigger verify-orphan alerts (verify but no settle). */
  verifyOrphanAlerts?: boolean;

  /** Trigger settle-no-delivery alerts. */
  noDeliveryAlerts?: boolean;

  /** Refuse signatures while any merchant in the request is in `alert` state. */
  refuseInAlertState?: boolean;
}

/* ────── Templates ────── */

export const STRICT_POLICY: GuardPolicy = {
  // Pre-sign
  maxLossPercent: 25,
  blockApprovalChanges: true,
  blockDelegateChanges: true,
  blockRiskyPrograms: true,
  blockUnknownProgramExposure: true,
  allowWarnings: false,
  requireSuccessfulSimulation: true,
  // x402
  maxX402PerTx: 0.10,
  x402HourlyCap: 1.00,
  x402DailyCap: 5.00,
  requireMemo: true,
  requireBlockhashMaxAgeSeconds: 30,
  maxComputeUnitPriceMicroLamports: 5,
  requireFeePayerSupportedCheck: true,
  blockAmountAnomalies: true,
  anomalyStdDev: 3,
  // Allowances
  autoRevokeAfterIdleDays: 30,
  autoPauseOnDailyCapHit: true,
  maxActiveSubKeys: 12,
  refuseUnlimitedApprovals: true,
  // Behavioral
  driftAlerts: true,
  verifyOrphanAlerts: true,
  noDeliveryAlerts: true,
  refuseInAlertState: true,
};

export const BALANCED_POLICY: GuardPolicy = {
  maxLossPercent: 50,
  blockApprovalChanges: true,
  blockDelegateChanges: true,
  blockRiskyPrograms: true,
  blockUnknownProgramExposure: false,
  allowWarnings: true,
  requireSuccessfulSimulation: true,
  maxX402PerTx: 1.00,
  x402HourlyCap: 5.00,
  x402DailyCap: 25.00,
  requireMemo: true,
  requireBlockhashMaxAgeSeconds: 60,
  maxComputeUnitPriceMicroLamports: 5,
  requireFeePayerSupportedCheck: true,
  blockAmountAnomalies: true,
  anomalyStdDev: 4,
  autoRevokeAfterIdleDays: 90,
  autoPauseOnDailyCapHit: false,
  refuseUnlimitedApprovals: true,
  driftAlerts: true,
  verifyOrphanAlerts: true,
  noDeliveryAlerts: true,
  refuseInAlertState: false,
};

export const PERMISSIVE_POLICY: GuardPolicy = {
  maxLossPercent: 90,
  blockRiskyPrograms: true,
  requireSuccessfulSimulation: true,
  allowWarnings: true,
  maxX402PerTx: 10.00,
  x402HourlyCap: 50.00,
  x402DailyCap: 250.00,
  blockAmountAnomalies: false,
  refuseUnlimitedApprovals: false,
  driftAlerts: true,
};

export type PolicyTemplateId = "strict" | "balanced" | "permissive" | "custom";

export interface PolicyTemplate {
  id: PolicyTemplateId;
  name: string;
  description: string;
  policy: GuardPolicy;
}

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: "strict",
    name: "Strict",
    description: "Block any suspicious activity. Tight x402 caps. Best for cautious users.",
    policy: STRICT_POLICY,
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Production default. Blocks drains and unauthorized approvals; permits unknown programs.",
    policy: BALANCED_POLICY,
  },
  {
    id: "permissive",
    name: "Permissive",
    description: "Only blocks fatal outcomes. Generous caps. For power users.",
    policy: PERMISSIVE_POLICY,
  },
];

const NUM = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validatePolicy(p: GuardPolicy): void {
  if (p.maxLossPercent !== undefined) {
    if (!NUM(p.maxLossPercent) || p.maxLossPercent < 0 || p.maxLossPercent > 100) {
      throw new Error("maxLossPercent must be a number between 0 and 100");
    }
  }
  if (p.minPostUsdcBalance !== undefined) {
    if (!NUM(p.minPostUsdcBalance) || p.minPostUsdcBalance < 0) {
      throw new Error("minPostUsdcBalance must be a non-negative number");
    }
  }
  if (p.minPostTokenMint !== undefined && typeof p.minPostTokenMint !== "string") {
    throw new Error("minPostTokenMint must be a base58 mint address string");
  }
  if (p.maxX402PerTx !== undefined && (!NUM(p.maxX402PerTx) || p.maxX402PerTx < 0)) {
    throw new Error("maxX402PerTx must be a non-negative number");
  }
  if (p.x402HourlyCap !== undefined && (!NUM(p.x402HourlyCap) || p.x402HourlyCap < 0)) {
    throw new Error("x402HourlyCap must be a non-negative number");
  }
  if (p.x402DailyCap !== undefined && (!NUM(p.x402DailyCap) || p.x402DailyCap < 0)) {
    throw new Error("x402DailyCap must be a non-negative number");
  }
  if (p.requireBlockhashMaxAgeSeconds !== undefined && (!NUM(p.requireBlockhashMaxAgeSeconds) || p.requireBlockhashMaxAgeSeconds <= 0)) {
    throw new Error("requireBlockhashMaxAgeSeconds must be positive");
  }
  if (p.anomalyStdDev !== undefined && (!NUM(p.anomalyStdDev) || p.anomalyStdDev <= 0)) {
    throw new Error("anomalyStdDev must be positive");
  }
}

export function normalizePolicy(p: GuardPolicy): GuardPolicy {
  const out: GuardPolicy = {};
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
