---
title: Pre-sign simulation
nextjs:
  metadata:
    title: Pre-sign simulation
    description: How BLACKTHORN turns a base64 transaction into a verdict — decode, ALT resolution, RPC simulate, delta extraction.
---

The simulation pipeline is the heart of the analyze server. It takes one base64 string and produces a structured object describing exactly what the transaction will do to the user's accounts. Every detector and every policy rule runs on top of this output. {% .lead %}

---

## Pipeline stages

The orchestrator lives at `apps/server/src/application/analyze-transaction.ts`. It walks the transaction through six stages in order:

### 1. Decode

`apps/server/src/simulation/tx-decode.ts` accepts a base64 string and produces a `VersionedTransaction` (Solana web3.js). Both legacy and v0 messages are supported. Malformed input fails fast with a 400 — no simulation is attempted.

### 2. Resolve Address Lookup Tables

For v0 transactions, every account index can resolve through an ALT. `apps/server/src/simulation/account-keys.ts` fetches the referenced lookup tables from RPC and inlines their addresses, producing a flat list of every account the transaction will touch. Account lists longer than 64 entries are truncated and trigger a `LOW_CONFIDENCE_INCOMPLETE_DATA` finding so the client knows the analysis is partial.

### 3. Pre-fetch state

The simulator calls `getMultipleAccountsInfo` to snapshot every involved account *before* simulation. This snapshot is what the delta extractor diffs against — without it, post-simulation state has nothing to be compared against.

### 4. Simulate

`apps/server/src/simulation/solana-simulator.ts` calls `connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, accounts: { encoding: 'base64', addresses: [...] } })`. The `sigVerify: false` flag lets us simulate transactions that haven't been signed yet (the whole point — we're deciding whether to sign). RPC returns:

- Per-account post-state (`accounts` field)
- Compute units consumed (`unitsConsumed`)
- Inner instructions tree (`innerInstructions`)
- Logs (`logs`)
- An error, if simulation failed

If RPC reports an error or returns a failure status, the pipeline emits `SIMULATION_FAILED` and short-circuits the rest. The default `requireSuccessfulSimulation` policy rule will block the signature.

### 5. Decode and trace

Two parallel decoders run on the simulation output:

- **`extract-deltas.ts`** — diffs pre vs post account state and produces `estimatedChanges` rows: `{ owner, mint, decimals, deltaBaseUnits, deltaUi, kind: 'sol' | 'token' }`. This is what the popup shows in the **What changes** section.
- **`cpi-parser.ts`** — walks the `innerInstructions` tree and produces a `CpiTrace`: every program invocation, every depth level, every account it touched. This is what the CPI detectors operate on.
- **`instruction-decoder.ts`** — semantically decodes ~30 known programs (System, SPL Token, Token-2022, ALT, ComputeBudget, Memo, Stake, Jupiter v6, Raydium, Orca, Marinade, Lido, etc.) into named operations like "TransferChecked" or "InitializeMint2".

### 6. Detect, evaluate, suggest

The final stage runs three things in parallel:

1. **`risk/index.ts`** orchestrates seven detector modules and merges their findings.
2. **`policy/engine.ts`** evaluates the merged findings against the policy and produces `{ safe, reasons }`.
3. **`analysis/suggestion-engine.ts`** generates user-facing improvement suggestions ("Consider adding a budget limit", "Lower compute unit price", etc.).

The combined output is the response body.

---

## Response shape

```ts
type AnalyzeResponse = {
  decision: {
    safe: boolean
    reasons: string[]
  }
  findings: RiskFinding[]
  estimatedChanges: EstimatedChange[]
  simulationWarnings: string[]
  cpiTrace?: CpiTrace
  programIds: string[]
  unitsConsumed?: number
  primaryAction?: string
  confidence: 'high' | 'medium' | 'low'
}

type RiskFinding = {
  code: string                 // e.g. "RISKY_PROGRAM_INTERACTION"
  severity: 'high' | 'medium' | 'low'
  message: string              // human-readable summary
  details?: Record<string, unknown>
}

type EstimatedChange = {
  owner: string                // pubkey
  mint?: string                // SOL omits this
  decimals: number
  deltaBaseUnits: bigint
  deltaUi: number              // signed; negative = leaving owner
  kind: 'sol' | 'token'
  symbol?: string              // when known via reputation DB
}
```

---

## Confidence levels

The pipeline returns a `confidence` field that helps the client weight the verdict:

| Level | Meaning | Triggers |
|---|---|---|
| **high** | Full simulation succeeded, all account state was captured | Default |
| **medium** | Simulation succeeded but some data is incomplete | Account list truncated, missing balance for a policy rule that needs it |
| **low** | Simulation failed or large pieces of state are unknown | RPC error, all relevant accounts truncated |

A medium-confidence safe verdict is still safe — it just tells the popup to render an info badge so the user knows the analysis was partial.

---

## Why pre-fetch?

Solana RPC's `simulateTransaction` returns post-state for the addresses you ask about, but it does *not* return pre-state. To compute a delta, you need both. The pipeline fetches pre-state explicitly via `getMultipleAccountsInfo` instead of relying on the simulator's optional `accounts` echo, so we always have a baseline even if the simulator's output is missing fields.

This adds one RPC round-trip per analyze call. On a co-located RPC (Helius, Triton dedicated), the full pipeline runs in ~150 ms median; on the public devnet endpoint, expect ~600 ms. The 12-second client timeout is set generously to absorb tail latency on congested RPCs.

{% callout type="warning" title="Simulation is not a guarantee" %}
RPC simulation runs against the *current* slot. By the time the user signs and the transaction lands on-chain, the world may have moved. A swap might fill at a different price; an account might have been closed. BLACKTHORN's verdict is a strong prediction, not a contract. See [Design principles & limits](/design-principles) for the full list of caveats.
{% /callout %}

---

## Source map

| File | Responsibility |
|---|---|
| `apps/server/src/application/analyze-transaction.ts` | Orchestrator |
| `apps/server/src/simulation/tx-decode.ts` | Base64 → VersionedTransaction |
| `apps/server/src/simulation/account-keys.ts` | ALT resolution + account collection |
| `apps/server/src/simulation/solana-simulator.ts` | RPC simulateTransaction wrapper |
| `apps/server/src/simulation/cpi-parser.ts` | Inner instruction tree → CpiTrace |
| `apps/server/src/analysis/extract-deltas.ts` | Pre/post state diff → EstimatedChange[] |
| `apps/server/src/analysis/instruction-decoder.ts` | Semantic decoders for 30+ programs |
| `apps/server/src/analysis/token2022.ts` | Token-2022 extension introspection |
| `apps/server/src/infra/solana-rpc.ts` | Connection pool + timeout/retry |
