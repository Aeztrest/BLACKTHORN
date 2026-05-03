import type { NormalizedSimulation } from "../../domain/simulation-normalized.js";
import type { RiskFinding } from "../../domain/findings.js";

export function detectSimulationFindings(
  simulation: NormalizedSimulation,
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  if (simulation.status === "failed") {
    findings.push({
      code: "SIMULATION_FAILED",
      severity: "high",
      message: "Transaction simulation failed; execution is unlikely to succeed as simulated",
      details: { err: simulation.err },
    });
  }
  return findings;
}
