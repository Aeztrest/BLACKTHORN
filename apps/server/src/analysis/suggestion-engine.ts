import type { VersionedTransaction } from "@solana/web3.js";
import type { Decision } from "../domain/decision.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";
import type { TransactionSummary } from "../domain/instruction-summary.js";

export type SuggestionSeverity = "info" | "warning" | "critical";

export type TransactionSuggestion = {
  id: string;
  severity: SuggestionSeverity;
  category: "priority_fee" | "slippage" | "approval_limit" | "compute_budget" | "general";
  title: string;
  description: string;
  autoFixAvailable: boolean;
};

export type SuggestionResult = {
  suggestions: TransactionSuggestion[];
  hasAutoFixes: boolean;
};

const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
const MAX_SAFE_SLIPPAGE_BPS = 300;
const CU_HEADROOM_MULTIPLIER = 1.2;

export function generateSuggestions(
  _tx: VersionedTransaction,
  decision: Decision,
  simulation: NormalizedSimulation,
  summary: TransactionSummary,
): SuggestionResult {
  const suggestions: TransactionSuggestion[] = [];

  suggestions.push(...checkComputeBudget(summary, simulation));
  suggestions.push(...checkApprovals(decision));
  suggestions.push(...checkSlippage(summary));
  suggestions.push(...checkPriorityFee(summary));
  suggestions.push(...checkGeneralRisks(decision));

  return {
    suggestions,
    hasAutoFixes: suggestions.some((s) => s.autoFixAvailable),
  };
}

function checkComputeBudget(
  summary: TransactionSummary,
  simulation: NormalizedSimulation,
): TransactionSuggestion[] {
  const suggestions: TransactionSuggestion[] = [];
  const hasComputeBudget = summary.instructions.some(
    (ix) => ix.programId === COMPUTE_BUDGET_PROGRAM,
  );

  if (!hasComputeBudget && simulation.unitsConsumed != null && simulation.unitsConsumed > 200_000) {
    const recommended = Math.ceil(simulation.unitsConsumed * CU_HEADROOM_MULTIPLIER);
    suggestions.push({
      id: "add-compute-budget",
      severity: "warning",
      category: "compute_budget",
      title: "Missing compute budget instruction",
      description: `Transaction used ${simulation.unitsConsumed} CU but has no compute budget set. ` +
        `Consider adding SetComputeUnitLimit(${recommended}) to avoid transaction failure.`,
      autoFixAvailable: true,
    });
  }

  if (simulation.unitsConsumed != null && simulation.unitsConsumed > 1_000_000) {
    suggestions.push({
      id: "high-compute",
      severity: "warning",
      category: "compute_budget",
      title: "High compute usage",
      description: `Transaction consumes ${simulation.unitsConsumed} compute units, ` +
        `which is close to the 1.4M limit. This may fail under congestion.`,
      autoFixAvailable: false,
    });
  }

  return suggestions;
}

function checkApprovals(decision: Decision): TransactionSuggestion[] {
  const suggestions: TransactionSuggestion[] = [];

  if (decision.estimatedChanges.approvals.length > 0) {
    for (const approval of decision.estimatedChanges.approvals) {
      suggestions.push({
        id: `limit-approval-${approval.tokenAccount}`,
        severity: "critical",
        category: "approval_limit",
        title: "Unlimited token approval detected",
        description: `Token account ${approval.tokenAccount.slice(0, 8)}... is approving ` +
          `delegate ${approval.delegate?.slice(0, 8) ?? "unknown"}... with potentially unlimited amount. ` +
          `Consider setting a specific approval limit.`,
        autoFixAvailable: true,
      });
    }
  }

  return suggestions;
}

function checkSlippage(summary: TransactionSummary): TransactionSuggestion[] {
  const suggestions: TransactionSuggestion[] = [];

  if (summary.primaryAction === "swap") {
    suggestions.push({
      id: "check-slippage",
      severity: "info",
      category: "slippage",
      title: "Verify swap slippage tolerance",
      description: `This is a swap transaction. Ensure slippage tolerance is set appropriately ` +
        `(recommended: ${MAX_SAFE_SLIPPAGE_BPS / 100}% or less for stable pairs).`,
      autoFixAvailable: false,
    });
  }

  return suggestions;
}

function checkPriorityFee(summary: TransactionSummary): TransactionSuggestion[] {
  const suggestions: TransactionSuggestion[] = [];

  const hasSetPriorityFee = summary.instructions.some(
    (ix) => ix.programId === COMPUTE_BUDGET_PROGRAM && ix.description.includes("compute"),
  );

  if (!hasSetPriorityFee && summary.primaryAction === "swap") {
    suggestions.push({
      id: "add-priority-fee",
      severity: "warning",
      category: "priority_fee",
      title: "No priority fee set",
      description: `Swap transaction without a priority fee may be slow to confirm or get dropped ` +
        `during congestion. Consider adding a SetComputeUnitPrice instruction.`,
      autoFixAvailable: true,
    });
  }

  return suggestions;
}

function checkGeneralRisks(decision: Decision): TransactionSuggestion[] {
  const suggestions: TransactionSuggestion[] = [];

  const highFindings = decision.riskFindings.filter((f) => f.severity === "high");
  if (highFindings.length > 0 && decision.safe) {
    suggestions.push({
      id: "review-high-findings",
      severity: "warning",
      category: "general",
      title: "High-severity findings present",
      description: `Transaction passed policy check but has ${highFindings.length} high-severity ` +
        `finding(s): ${highFindings.map((f) => f.code).join(", ")}. Review before signing.`,
      autoFixAvailable: false,
    });
  }

  return suggestions;
}
