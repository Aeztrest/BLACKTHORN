import type { EstimatedChanges } from "../../domain/estimated-changes.js";
import type { RiskFinding } from "../../domain/findings.js";

export function detectDelegateAndApprovalFindings(
  changes: EstimatedChanges,
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  if (changes.approvals.length > 0) {
    findings.push({
      code: "APPROVAL_CHANGE_DETECTED",
      severity: "high",
      message: "Simulation indicates a new SPL token delegate (approval) was set",
      details: { count: changes.approvals.length },
    });
  }
  if (changes.delegates.length > 0) {
    findings.push({
      code: "DELEGATE_CHANGE_DETECTED",
      severity: "high",
      message: "Simulation indicates SPL token delegate state changed",
      details: { count: changes.delegates.length },
    });
  }
  return findings;
}

export function detectIncompleteDataFinding(params: {
  truncatedAccounts: boolean;
  userWalletMissingForBalanceRules: boolean;
}): RiskFinding | null {
  if (!params.truncatedAccounts && !params.userWalletMissingForBalanceRules) {
    return null;
  }
  return {
    code: "LOW_CONFIDENCE_INCOMPLETE_DATA",
    severity: "medium",
    message:
      "Analysis used truncated account set or missing wallet context; confidence reduced",
    details: {
      truncatedAccounts: params.truncatedAccounts,
      userWalletMissingForBalanceRules: params.userWalletMissingForBalanceRules,
    },
  };
}
