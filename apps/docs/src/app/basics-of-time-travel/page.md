---
title: Risk detectors
nextjs:
  metadata:
    title: Risk detectors
    description: The full catalogue of finding codes — what each detector looks for, when it fires, and the severity it emits.
---

A finding is the unit of evidence the policy engine consumes. Each detector is a pure function over the simulation output; together they emit ~20 distinct codes spanning program reputation, balance changes, CPI shape, compute budget, Token-2022 extensions, and x402 protocol conformance. {% .lead %}

---

## How detection runs

`apps/server/src/risk/index.ts` exposes `runRiskDetection(input: RiskDetectionInput): RiskFinding[]`. Internally it calls seven detector modules in parallel via `Promise.all` and concatenates the results. Detectors never block each other and never share state — adding a new one is a one-line registration.

```ts
type RiskDetectionInput = {
  config: AppConfig
  policy: GuardPolicy
  simulation: SimulationResult
  programIds: string[]
  estimatedChanges: EstimatedChange[]
  cpiTrace?: CpiTrace
  tx?: VersionedTransaction
  paymentRequirements?: PaymentRequirements   // x402 only
}

type RiskFinding = {
  code: string
  severity: 'high' | 'medium' | 'low'
  message: string
  details?: Record<string, unknown>
}
```

Severity is fixed per finding code — it does not depend on transaction context. The policy engine decides what to do with a given severity (block, warn, allow).

---

## Pre-sign findings

These are the codes a normal Solana transaction can produce. Each row links to the detector file.

| Code | Severity | Fires when | Detector |
|---|---|---|---|
| `SIMULATION_FAILED` | high | RPC simulation errored or returned failure status | `detectors/simulation.ts` |
| `RISKY_PROGRAM_INTERACTION` | high | Any program ID (top-level or via CPI) is in `RISKY_PROGRAM_IDS` | `detectors/programs.ts`, `detectors/cpi.ts` |
| `UNKNOWN_PROGRAM_EXPOSURE` | medium | A program is not in the configured `KNOWN_SAFE_PROGRAM_IDS` allowlist (off by default) | `detectors/programs.ts` |
| `KNOWN_MALICIOUS_ADDRESS` | high / medium / low | A program ID or account address matches the reputation database | `detectors/reputation.ts` |
| `APPROVAL_CHANGE_DETECTED` | high | A new SPL Token delegate appears post-simulation that wasn't in pre-state | `detectors/deltas.ts` |
| `DELEGATE_CHANGE_DETECTED` | high | An existing delegate was swapped for a different one | `detectors/deltas.ts` |
| `DEEP_CPI_NESTING` | medium | CPI trace depth > 4 (normal DeFi sits at 2–3) | `detectors/cpi.ts` |
| `HIGH_INSTRUCTION_COUNT` | low | Total instructions (CPI-inclusive) > 30 | `detectors/cpi.ts` |
| `EXCESSIVE_COMPUTE_USAGE` | medium | Simulated `unitsConsumed` > 1,200,000 (block limit is 1.4M) | `detectors/compute.ts` |
| `TOKEN2022_TRANSFER_HOOK` | high | A Token-2022 mint involved has the TransferHook extension (type 14) | `detectors/token2022.ts` |
| `TOKEN2022_PERMANENT_DELEGATE` | high | A Token-2022 mint has the PermanentDelegate extension (type 19) | `detectors/token2022.ts` |
| `LOW_CONFIDENCE_INCOMPLETE_DATA` | medium | Account list was truncated (>64 accounts) or `userWallet` missing for a balance rule | `detectors/simulation.ts` |

---

## x402 protocol findings

These only fire when the transaction is an x402 payment (i.e. it has a `paymentRequirements` payload alongside the tx). They live in `apps/server/src/risk/detectors/x402.ts`.

| Code | Severity | Fires when |
|---|---|---|
| `X402_SHAPE_INVALID` | high | Missing `ComputeBudget.SetLimit` / `SetPrice` or no `TransferChecked` instruction |
| `X402_DESTINATION_MISMATCH` | high | TransferChecked recipient ≠ ATA(payTo, asset) |
| `X402_MINT_MISMATCH` | high | TransferChecked mint ≠ announced asset mint |
| `X402_AMOUNT_MISMATCH` | high | TransferChecked amount ≠ announced amount |
| `X402_FEEPAYER_IN_ACCOUNTS` | high | The fee payer pubkey appears in the tx account list (spec violation) |
| `X402_CU_PRICE_EXCESS` | medium | ComputeUnitPrice > 5 µLamports/CU (spec ceiling) |
| `X402_MEMO_MISSING` | medium | Required SPL Memo instruction is absent (replay protection) |
| `X402_NON_CANONICAL_MINT` | medium | Asset mint not in canonical USDC list or wallet's allowlist |

See [x402 payment defense](/the-butterfly-effect) for the protocol context behind these codes.

---

## What each detector does

### Simulation detector

Reads `simulation.error`, `simulation.value.err`, and the logs. If any of them indicate failure, emits `SIMULATION_FAILED` with the on-chain error code. Also handles the `LOW_CONFIDENCE_INCOMPLETE_DATA` case when the account list was truncated upstream.

### Programs detector

Walks `programIds` (top-level invocations) and emits `RISKY_PROGRAM_INTERACTION` for any matches against `config.riskyProgramIds`. If `config.knownSafeProgramIds` is non-empty, also emits `UNKNOWN_PROGRAM_EXPOSURE` for any program that isn't on the allowlist (excluding the implicit safe set: System, SPL Token, ComputeBudget, ALT, Memo).

### CPI detector

Walks the `cpiTrace` recursively. Tracks max depth and total instruction count. Emits `DEEP_CPI_NESTING` when depth > 4 and `HIGH_INSTRUCTION_COUNT` when total > 30. Also re-checks every program in the trace against the risky list — a malicious program invoked via CPI will surface `RISKY_PROGRAM_INTERACTION` even if the top-level instruction looked clean.

### Reputation detector

Looks up every involved program ID and account address in `apps/server/src/data/reputation-db.ts`. The database tags entries with one of: `drainer`, `phishing`, `scam_token`, `sanctioned`, `exploit`, `suspicious`. Severity follows the tag (drainer/sanctioned = high, phishing/exploit = medium, suspicious = low).

### Compute detector

Reads `simulation.value.unitsConsumed`. If above the configured threshold (default 1.2M, leaving ~14% headroom under the 1.4M block limit), emits `EXCESSIVE_COMPUTE_USAGE`. Excessive compute is associated with malicious programs that try to exhaust block space or create DoS conditions; benign DeFi operations rarely exceed 600k.

### Deltas detector

Walks pre vs post token account state. For every SPL Token account:
- If `delegate` is non-zero in post but zero in pre → `APPROVAL_CHANGE_DETECTED`
- If both are non-zero but different → `DELEGATE_CHANGE_DETECTED`

This is the critical anti-drainer check: a transaction whose visible balance change is small but whose hidden side-effect is granting unlimited spend authority to an attacker.

### Token-2022 detector

For every Token-2022 mint touched, parses the mint's TLV extension list. Emits `TOKEN2022_TRANSFER_HOOK` if extension type 14 (TransferHook) is present — these run arbitrary code on every transfer and can lock the user out of moving the token. Emits `TOKEN2022_PERMANENT_DELEGATE` if extension type 19 (PermanentDelegate) is present — these let a designated key move tokens without owner consent, ever.

### x402 detector

Validates the transaction structure against the x402 spec when `paymentRequirements` is provided. Cross-checks the announced asset/amount/payTo against the actual TransferChecked, verifies presence of ComputeBudget and Memo instructions, enforces the spec's CU price ceiling.

---

## Adding a detector

A detector is a pure function. To add one:

1. Create `apps/server/src/risk/detectors/<name>.ts` exporting `(input: RiskDetectionInput) => RiskFinding[]`.
2. Add a new code to `apps/server/src/domain/findings.ts`.
3. Register the detector in `apps/server/src/risk/index.ts`.
4. Add a unit test under `apps/server/test/risk/`.

That's it. The policy engine doesn't need changes — operators reference the new code by name in their policy rules.

---

## Reading the findings

The popup groups findings by severity and renders them with one line each: the message, the code (in muted text), and a "details" expander when the detector emitted a `details` blob. The full structured form is what the API returns; the popup is a presentation layer over it.
