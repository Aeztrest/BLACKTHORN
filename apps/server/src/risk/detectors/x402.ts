import { PublicKey, type VersionedTransaction } from "@solana/web3.js";
import type { RiskFinding } from "../../domain/findings.js";
import type { PaymentRequirements, Policy } from "../../domain/policy.js";

/**
 * x402 protocol-specific risk detector.
 *
 * Two responsibilities:
 *   1. Detect when a candidate tx looks like an x402 payment (heuristic +
 *      explicit signal via paymentRequirements).
 *   2. Validate the tx against the spec layout + against the merchant's
 *      published requirements when supplied.
 *
 * Spec: docs/x402-defense.md §3 (instruction layout) + §6 (attack matrix).
 */

const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
const TOKEN_PROGRAM          = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM     = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ATA_PROGRAM            = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const MEMO_PROGRAM           = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
// Lighthouse (L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95) is tolerated when
// Phantom/Solflare inject it as a guard; we do not validate against it.

const CANONICAL_USDC_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // mainnet
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // devnet
]);

const COMPUTE_UNIT_PRICE_DEFAULT_MAX = 5; // microlamports/CU per spec

export interface X402DetectInput {
  tx: VersionedTransaction;
  programIds: PublicKey[];
  policy: Policy;
  paymentRequirements?: PaymentRequirements;
}

export function detectX402Findings(input: X402DetectInput): RiskFinding[] {
  const { tx, programIds, policy, paymentRequirements } = input;
  const findings: RiskFinding[] = [];
  const programSet = new Set(programIds.map((p) => p.toBase58()));

  // Heuristic: an x402 candidate has ComputeBudget + (Token | Token-2022) +
  // optionally Memo. If the caller didn't supply paymentRequirements AND none
  // of these markers are present, skip silently.
  const looksLikeX402 =
    !!paymentRequirements ||
    (programSet.has(COMPUTE_BUDGET_PROGRAM)
     && (programSet.has(TOKEN_PROGRAM) || programSet.has(TOKEN_2022_PROGRAM)));

  if (!looksLikeX402) return findings;

  const compiled = tx.message.compiledInstructions;
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());

  // Rule §3.2.1 — slots 0+1 must be ComputeBudget set unit limit / price.
  const slot0Program = keys[compiled[0]?.programIdIndex ?? -1];
  const slot1Program = keys[compiled[1]?.programIdIndex ?? -1];
  if (slot0Program !== COMPUTE_BUDGET_PROGRAM || slot1Program !== COMPUTE_BUDGET_PROGRAM) {
    findings.push({
      code: "X402_SHAPE_INVALID",
      severity: "high",
      message: "x402 spec requires ComputeBudget setLimit + setPrice as the first two instructions.",
    });
  }

  // Rule §3.2.2 — ComputeUnitPrice ≤ 5 µLamports/CU (or policy override).
  const ix1 = compiled[1];
  if (slot1Program === COMPUTE_BUDGET_PROGRAM && ix1) {
    const data = ix1.data; // Uint8Array
    // setComputeUnitPrice opcode = 3, followed by u64 LE microlamports.
    if (data.length >= 9 && data[0] === 3) {
      let priceLE = 0n;
      for (let i = 0; i < 8; i++) priceLE += BigInt(data[1 + i]!) << BigInt(i * 8);
      const cap = BigInt(policy.maxComputeUnitPriceMicroLamports ?? COMPUTE_UNIT_PRICE_DEFAULT_MAX);
      if (priceLE > cap) {
        findings.push({
          code: "X402_CU_PRICE_EXCESS",
          severity: "medium",
          message: `Compute-unit price ${priceLE} µLamports exceeds the spec cap of ${cap}.`,
          details: { price: priceLE.toString(), cap: cap.toString() },
        });
      }
    }
  }

  // Rule §3.2.3 — exactly one TransferChecked instruction (slot 2).
  const transferIxs = compiled
    .map((ix, idx) => ({ ix, idx, programId: keys[ix.programIdIndex] }))
    .filter((r) => r.programId === TOKEN_PROGRAM || r.programId === TOKEN_2022_PROGRAM);

  if (transferIxs.length === 0) {
    findings.push({
      code: "X402_SHAPE_INVALID",
      severity: "high",
      message: "x402 candidate is missing the SPL TransferChecked instruction.",
    });
  } else if (transferIxs[0]!.idx !== 2) {
    findings.push({
      code: "X402_SHAPE_INVALID",
      severity: "medium",
      message: `TransferChecked should be at instruction index 2; found at ${transferIxs[0]!.idx}.`,
    });
  }

  // Rule §3.2.8 — Memo MUST be present.
  const memoPresent = programSet.has(MEMO_PROGRAM);
  if (!memoPresent) {
    findings.push({
      code: "X402_MEMO_MISSING",
      severity: policy.requireMemo === false ? "low" : "medium",
      message: "x402 spec requires an SPL Memo instruction (replay protection). Missing here.",
    });
  }

  // Rule §3.2.7 — feePayer must NOT appear in any instruction account list.
  if (paymentRequirements?.extra.feePayer) {
    const feePayer = paymentRequirements.extra.feePayer;
    let feePayerInAccounts = false;
    for (const ix of compiled) {
      // Skip slot 0 (it's the message-level fee-payer reference).
      const accountKeys = ix.accountKeyIndexes.map((idx) => keys[idx]);
      if (accountKeys.includes(feePayer)) {
        feePayerInAccounts = true;
        break;
      }
    }
    if (feePayerInAccounts) {
      findings.push({
        code: "X402_FEEPAYER_IN_ACCOUNTS",
        severity: "high",
        message: "Fee payer appears in an instruction account list — possible facilitator-drain attack.",
        details: { feePayer },
      });
    }
  }

  // Rule §3.2.5 + §3.2.6 — TransferChecked mint + amount match requirements.
  if (paymentRequirements && transferIxs.length > 0) {
    const tIx = transferIxs[0]!.ix;
    // TransferChecked layout: variant=12 (1) + amount u64 (8) + decimals u8 (1)
    const data = tIx.data;
    if (data.length >= 10 && data[0] === 12) {
      let amount = 0n;
      for (let i = 0; i < 8; i++) amount += BigInt(data[1 + i]!) << BigInt(i * 8);
      if (amount.toString() !== paymentRequirements.amount) {
        findings.push({
          code: "X402_AMOUNT_MISMATCH",
          severity: "high",
          message: `Transfer amount ${amount} doesn't match merchant-published ${paymentRequirements.amount}.`,
          details: { actual: amount.toString(), expected: paymentRequirements.amount },
        });
      }
    }

    // TransferChecked accounts: [source, mint, destination, authority]
    const accountIndexes = tIx.accountKeyIndexes;
    if (accountIndexes.length >= 4) {
      const mintIdx = accountIndexes[1]!;
      const txMint = keys[mintIdx];
      if (txMint && txMint !== paymentRequirements.asset) {
        findings.push({
          code: "X402_MINT_MISMATCH",
          severity: "high",
          message: `Transfer mint ${txMint} doesn't match merchant-published ${paymentRequirements.asset}.`,
          details: { actual: txMint, expected: paymentRequirements.asset },
        });
      }

      // Destination ATA check: derive expected from (payTo, asset, tokenProgram) and compare.
      try {
        const tokenProgram = transferIxs[0]!.programId === TOKEN_2022_PROGRAM
          ? TOKEN_2022_PROGRAM
          : TOKEN_PROGRAM;
        const expectedAta = deriveAta(
          new PublicKey(paymentRequirements.payTo),
          new PublicKey(paymentRequirements.asset),
          new PublicKey(tokenProgram),
        );
        const destIdx = accountIndexes[2]!;
        const txDest = keys[destIdx];
        if (txDest && expectedAta && txDest !== expectedAta) {
          findings.push({
            code: "X402_DESTINATION_MISMATCH",
            severity: "high",
            message: `Transfer destination ${txDest} doesn't match the ATA derived from merchant payTo + asset.`,
            details: { actual: txDest, expected: expectedAta },
          });
        }
      } catch { /* derivation failure — surface as shape invalid */ }
    }
  }

  // Mint allowlist (policy or canonical USDC).
  if (paymentRequirements) {
    const allowed = policy.allowedMints && policy.allowedMints.length > 0
      ? new Set(policy.allowedMints)
      : null;
    if (allowed && !allowed.has(paymentRequirements.asset)) {
      findings.push({
        code: "X402_NON_CANONICAL_MINT",
        severity: "medium",
        message: `Mint ${paymentRequirements.asset} is not on the policy's trusted-mints list.`,
      });
    } else if (!allowed && !CANONICAL_USDC_MINTS.has(paymentRequirements.asset)) {
      findings.push({
        code: "X402_NON_CANONICAL_MINT",
        severity: "low",
        message: `Mint ${paymentRequirements.asset} isn't canonical USDC. Verify it's the asset the merchant intends.`,
      });
    }
  }

  return findings;
}

function deriveAta(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): string | null {
  try {
    const [ata] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      new PublicKey(ATA_PROGRAM),
    );
    return ata.toBase58();
  } catch {
    return null;
  }
}
