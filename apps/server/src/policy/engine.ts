import type { Policy } from "../domain/policy.js";
import type { Decision, DecisionMeta } from "../domain/decision.js";
import type { EstimatedChanges } from "../domain/estimated-changes.js";
import type { RiskFinding, RiskFindingCode } from "../domain/findings.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";
import type { Cluster } from "../config/index.js";

export type PolicyEvaluationInput = {
  cluster: Cluster;
  policy: Policy;
  simulation: NormalizedSimulation;
  estimatedChanges: EstimatedChanges;
  riskFindings: RiskFinding[];
  simulationWarnings: string[];
  usdcMint: string;
  userWallet: string | null;
  integratorRequestId?: string;
};

function hasCode(findings: RiskFinding[], code: RiskFindingCode): boolean {
  return findings.some((f) => f.code === code);
}

function minTokenAmountRaw(minUi: number, decimals: number): bigint {
  const scale = 10n ** BigInt(decimals);
  const rounded = BigInt(Math.round(minUi * Number(scale)));
  return rounded;
}

export function evaluatePolicy(input: PolicyEvaluationInput): Decision {
  const {
    cluster,
    policy,
    simulation,
    estimatedChanges,
    riskFindings,
    simulationWarnings,
    usdcMint,
    userWallet,
    integratorRequestId,
  } = input;

  const reasons: string[] = [];
  const infoReasons: string[] = [];
  const extraPolicyFindings: RiskFinding[] = [];

  const requireOkSim = policy.requireSuccessfulSimulation !== false;
  if (simulation.status === "failed") {
    if (requireOkSim) {
      reasons.push("Simulation did not succeed; blocking under policy");
    } else {
      infoReasons.push(
        "Simulation did not succeed, but policy does not require successful simulation — allowed",
      );
    }
  }

  if (policy.blockRiskyPrograms && hasCode(riskFindings, "RISKY_PROGRAM_INTERACTION")) {
    reasons.push("Risky program interaction detected and blocked by policy");
  }

  if (
    policy.blockUnknownProgramExposure &&
    hasCode(riskFindings, "UNKNOWN_PROGRAM_EXPOSURE") &&
    policy.allowWarnings !== true
  ) {
    reasons.push("Unknown program exposure detected and blocked by policy");
  }

  if (policy.blockApprovalChanges && hasCode(riskFindings, "APPROVAL_CHANGE_DETECTED")) {
    reasons.push("New token approval (delegate) detected and blocked by policy");
  }

  if (policy.blockDelegateChanges && hasCode(riskFindings, "DELEGATE_CHANGE_DETECTED")) {
    reasons.push("Token delegate change detected and blocked by policy");
  }

  if (policy.maxLossPercent != null) {
    if (!userWallet) {
      reasons.push("Cannot evaluate max loss percent without userWallet context");
      extraPolicyFindings.push({
        code: "LOSS_PERCENT_UNAVAILABLE",
        severity: "high",
        message: "maxLossPercent policy set but userWallet was not provided",
      });
    } else {
      const solRow = estimatedChanges.sol.find((s) => s.account === userWallet);
      const pre = solRow?.preLamports;
      const delta = solRow?.deltaLamports;
      if (pre == null || delta == null || pre <= 0) {
        reasons.push("Cannot estimate loss percent for user wallet (missing pre-state)");
        extraPolicyFindings.push({
          code: "LOSS_PERCENT_UNAVAILABLE",
          severity: "high",
          message: "Insufficient data to compute loss percent (fail-closed)",
        });
      } else {
        const lossRatio = Math.max(0, -delta / pre);
        const lossPct = lossRatio * 100;
        if (lossPct > policy.maxLossPercent + 1e-9) {
          reasons.push(
            `Estimated SOL loss ${lossPct.toFixed(4)}% exceeds max allowed ${policy.maxLossPercent}%`,
          );
          extraPolicyFindings.push({
            code: "ESTIMATED_LOSS_EXCEEDS_MAX",
            severity: "high",
            message: "Estimated loss for user wallet exceeds policy threshold",
            details: { lossPercent: lossPct, maxLossPercent: policy.maxLossPercent },
          });
        }
      }
    }
  }

  if (policy.minPostUsdcBalance != null) {
    const mint = policy.minPostTokenMint ?? usdcMint;
    if (!userWallet) {
      reasons.push("Cannot evaluate minimum token balance without userWallet context");
      extraPolicyFindings.push({
        code: "POST_BALANCE_TOO_LOW",
        severity: "high",
        message: "minPostUsdcBalance policy set but userWallet was not provided",
      });
    } else {
      const row = estimatedChanges.tokens.find(
        (t) => t.mint === mint && t.owner === userWallet,
      );
      if (!row) {
        reasons.push(
          `No simulated token account found for mint ${mint} owned by user wallet`,
        );
        extraPolicyFindings.push({
          code: "POST_BALANCE_TOO_LOW",
          severity: "high",
          message: "Cannot verify post-transaction token balance (account not in simulation set)",
        });
      } else if (row.decimals == null) {
        reasons.push("Cannot verify minimum token balance (mint decimals unknown)");
        extraPolicyFindings.push({
          code: "POST_BALANCE_TOO_LOW",
          severity: "high",
          message: "Cannot compute raw token amount for policy check",
        });
      } else {
        const postRaw = BigInt(row.postAmount);
        const minRaw = minTokenAmountRaw(policy.minPostUsdcBalance, row.decimals);
        if (postRaw < minRaw) {
          reasons.push(
            `Post-transaction token balance is below minimum ${policy.minPostUsdcBalance}`,
          );
          extraPolicyFindings.push({
            code: "POST_BALANCE_TOO_LOW",
            severity: "high",
            message: "Estimated post-transaction balance is below policy minimum",
            details: { mint, min: policy.minPostUsdcBalance },
          });
        }
      }
    }
  }

  const mergedFindings = mergeFindings(riskFindings, extraPolicyFindings);

  const blocked = isBlocked({
    policy,
    simulation,
    mergedFindings,
    reasons,
  });

  const meta: DecisionMeta = {
    analysisVersion: "v1",
    cluster,
    simulatedAt: new Date().toISOString(),
    confidence: deriveConfidence(mergedFindings, estimatedChanges, simulation),
    integratorRequestId,
  };

  const allReasons = [...reasons, ...infoReasons];

  return {
    safe: !blocked,
    reasons: dedupeStrings(allReasons),
    estimatedChanges,
    riskFindings: mergedFindings,
    simulationWarnings,
    meta,
  };
}

type BlockInput = {
  policy: Policy;
  simulation: NormalizedSimulation;
  mergedFindings: RiskFinding[];
  reasons: string[];
};

function isBlocked(input: BlockInput): boolean {
  const { policy, simulation, mergedFindings, reasons } = input;
  if (reasons.length > 0) return true;

  const requireOkSim = policy.requireSuccessfulSimulation !== false;
  if (requireOkSim && simulation.status === "failed") {
    return true;
  }

  if (policy.blockRiskyPrograms && hasCode(mergedFindings, "RISKY_PROGRAM_INTERACTION")) {
    return true;
  }

  if (
    policy.blockUnknownProgramExposure &&
    hasCode(mergedFindings, "UNKNOWN_PROGRAM_EXPOSURE") &&
    policy.allowWarnings !== true
  ) {
    return true;
  }

  if (policy.blockApprovalChanges && hasCode(mergedFindings, "APPROVAL_CHANGE_DETECTED")) {
    return true;
  }

  if (policy.blockDelegateChanges && hasCode(mergedFindings, "DELEGATE_CHANGE_DETECTED")) {
    return true;
  }

  const policyViolationCodes: RiskFindingCode[] = [
    "LOSS_PERCENT_UNAVAILABLE",
    "ESTIMATED_LOSS_EXCEEDS_MAX",
    "POST_BALANCE_TOO_LOW",
  ];
  for (const c of policyViolationCodes) {
    if (hasCode(mergedFindings, c)) return true;
  }

  if (
    hasCode(mergedFindings, "LOW_CONFIDENCE_INCOMPLETE_DATA") &&
    policy.allowWarnings !== true
  ) {
    return true;
  }

  return false;
}

function mergeFindings(a: RiskFinding[], b: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  const out: RiskFinding[] = [];
  for (const f of [...a, ...b]) {
    const k = `${f.code}:${JSON.stringify(f.details ?? {})}:${f.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function deriveConfidence(
  findings: RiskFinding[],
  changes: EstimatedChanges,
  simulation: NormalizedSimulation,
): DecisionMeta["confidence"] {
  if (hasCode(findings, "LOW_CONFIDENCE_INCOMPLETE_DATA")) return "low";
  if (simulation.status === "failed") return "low";
  if (changes.tokens.some((t) => t.decimals == null)) return "medium";
  return "high";
}

function dedupeStrings(xs: string[]): string[] {
  return [...new Set(xs)];
}
