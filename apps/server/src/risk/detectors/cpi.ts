import type { CpiTrace } from "../../domain/cpi-trace.js";
import type { RiskFinding } from "../../domain/findings.js";
import type { AppConfig } from "../../config/index.js";

const MAX_SAFE_CPI_DEPTH = 4;
const HIGH_INSTRUCTION_COUNT = 30;

export function detectCpiFindings(
  trace: CpiTrace,
  config: AppConfig,
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  if (trace.maxDepth > MAX_SAFE_CPI_DEPTH) {
    findings.push({
      code: "DEEP_CPI_NESTING",
      severity: "medium",
      message: `CPI call depth of ${trace.maxDepth} exceeds safe threshold of ${MAX_SAFE_CPI_DEPTH}`,
      details: { maxDepth: trace.maxDepth },
    });
  }

  if (trace.totalInstructions > HIGH_INSTRUCTION_COUNT) {
    findings.push({
      code: "HIGH_INSTRUCTION_COUNT",
      severity: "low",
      message: `Transaction contains ${trace.totalInstructions} total instructions (including CPI)`,
      details: { totalInstructions: trace.totalInstructions },
    });
  }

  for (const pid of trace.allProgramIds) {
    if (config.riskyProgramIds.has(pid)) {
      findings.push({
        code: "RISKY_PROGRAM_INTERACTION",
        severity: "high",
        message: `CPI chain invokes program on risky list: ${pid}`,
        details: { programId: pid, detectedVia: "cpi_trace" },
      });
    }
  }

  return findings;
}
