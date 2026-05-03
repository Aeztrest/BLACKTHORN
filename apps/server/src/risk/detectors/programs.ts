import type { PublicKey } from "@solana/web3.js";
import type { AppConfig } from "../../config/index.js";
import type { RiskFinding } from "../../domain/findings.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const SYSVAR_RENT = "SysvarRent111111111111111111111111111111111";
const SYSVAR_CLOCK = "SysvarC1ock11111111111111111111111111111111";
const SYSVAR_STAKE_HISTORY = "SysvarStakeHistory111111111111111111111111111111";
const BPF_LOADER = "BPFLoaderUpgradeab1e111111111111111111111111111111";
const BPF_LOADER2 = "BPFLoader2111111111111111111111111111111111";
const BPF_LOADER3 = "BPFLoaderUpgradeab1e111111111111111111111111111111";

const IMPLICIT_ALLOW = new Set([
  SYSTEM_PROGRAM,
  SYSVAR_RENT,
  SYSVAR_CLOCK,
  SYSVAR_STAKE_HISTORY,
  BPF_LOADER,
  BPF_LOADER2,
  BPF_LOADER3,
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ComputeBudget111111111111111111111111111111",
  "Vote111111111111111111111111111111111111111",
  "Stake11111111111111111111111111111111111111",
]);

export function detectProgramFindings(
  programIds: PublicKey[],
  config: AppConfig,
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const risky = config.riskyProgramIds;

  for (const p of programIds) {
    const id = p.toBase58();
    if (risky.has(id)) {
      findings.push({
        code: "RISKY_PROGRAM_INTERACTION",
        severity: "high",
        message: `Transaction invokes program on risky list: ${id}`,
        details: { programId: id },
      });
    }
  }

  const knownSafe = config.knownSafeProgramIds;
  if (knownSafe.size > 0) {
    for (const p of programIds) {
      const id = p.toBase58();
      if (IMPLICIT_ALLOW.has(id) || knownSafe.has(id)) continue;
      findings.push({
        code: "UNKNOWN_PROGRAM_EXPOSURE",
        severity: "medium",
        message: `Transaction invokes program not in known-safe list: ${id}`,
        details: { programId: id },
      });
    }
  }

  return findings;
}
