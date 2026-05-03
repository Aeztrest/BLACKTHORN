import type { NormalizedSimulation } from "../../domain/simulation-normalized.js";
import type { RiskFinding } from "../../domain/findings.js";

const EXCESSIVE_CU_THRESHOLD = 1_200_000;

export function detectComputeFindings(
  simulation: NormalizedSimulation,
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  if (simulation.unitsConsumed != null && simulation.unitsConsumed > EXCESSIVE_CU_THRESHOLD) {
    findings.push({
      code: "EXCESSIVE_COMPUTE_USAGE",
      severity: "medium",
      message: `Transaction consumed ${simulation.unitsConsumed} compute units, exceeding threshold of ${EXCESSIVE_CU_THRESHOLD}`,
      details: { unitsConsumed: simulation.unitsConsumed, threshold: EXCESSIVE_CU_THRESHOLD },
    });
  }

  return findings;
}
