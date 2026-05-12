import type { PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { AppConfig } from "../config/index.js";
import type { EstimatedChanges } from "../domain/estimated-changes.js";
import type { RiskFinding } from "../domain/findings.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";
import type { PaymentRequirements, Policy } from "../domain/policy.js";
import type { CpiTrace } from "../domain/cpi-trace.js";
import { detectDelegateAndApprovalFindings, detectIncompleteDataFinding } from "./detectors/deltas.js";
import { detectProgramFindings } from "./detectors/programs.js";
import { detectSimulationFindings } from "./detectors/simulation.js";
import { detectCpiFindings } from "./detectors/cpi.js";
import { detectReputationFindings } from "./detectors/reputation.js";
import { detectComputeFindings } from "./detectors/compute.js";
import { detectX402Findings } from "./detectors/x402.js";

export type RiskDetectionInput = {
  config: AppConfig;
  policy: Policy;
  simulation: NormalizedSimulation;
  programIds: PublicKey[];
  estimatedChanges: EstimatedChanges;
  truncatedAccounts: boolean;
  userWallet: PublicKey | null;
  cpiTrace?: CpiTrace;
  /** When present, run x402-specific detector against the candidate tx. */
  tx?: VersionedTransaction;
  paymentRequirements?: PaymentRequirements;
};

export function runRiskDetection(input: RiskDetectionInput): RiskFinding[] {
  const {
    config,
    policy,
    simulation,
    programIds,
    estimatedChanges,
    truncatedAccounts,
    userWallet,
    cpiTrace,
  } = input;

  const findings: RiskFinding[] = [];
  findings.push(...detectSimulationFindings(simulation));
  findings.push(...detectProgramFindings(programIds, config));

  // x402 protocol detector — runs when paymentRequirements is supplied OR
  // when the tx shape looks like an x402 payment (heuristic).
  if (input.tx) {
    findings.push(...detectX402Findings({
      tx: input.tx,
      programIds,
      policy,
      paymentRequirements: input.paymentRequirements,
    }));
  }

  if (cpiTrace) {
    findings.push(...detectCpiFindings(cpiTrace, config));
  }

  findings.push(...detectReputationFindings(
    cpiTrace?.allProgramIds ?? programIds.map((p) => p.toBase58()),
    simulation.accounts.map((a) => a.pubkey),
  ));

  findings.push(...detectComputeFindings(simulation));

  const needsWalletForPolicy =
    policy.minPostUsdcBalance != null ||
    policy.maxLossPercent != null;

  const userWalletMissingForBalanceRules =
    needsWalletForPolicy && userWallet == null;

  const incomplete = detectIncompleteDataFinding({
    truncatedAccounts,
    userWalletMissingForBalanceRules,
  });
  if (incomplete) findings.push(incomplete);

  findings.push(...detectDelegateAndApprovalFindings(estimatedChanges));

  return findings;
}
