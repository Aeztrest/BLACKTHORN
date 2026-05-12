---
title: POST /v1/analyze
nextjs:
  metadata:
    title: POST /v1/analyze
    description: The core endpoint — submit a base64 transaction, receive a verdict with findings and estimated changes.
---

The single endpoint that powers the wallet, the showcase, and the MCP bridge. Accepts one base64 `VersionedTransaction`, runs the full simulation + risk + policy pipeline, returns a structured Decision. {% .lead %}

---

## Request

```http
POST /v1/analyze
Content-Type: application/json
Authorization: Bearer <key>      # required unless x402 mode is active
```

### Body

```ts
type AnalyzeRequest = {
  cluster: 'mainnet-beta' | 'devnet' | 'testnet'
  transactionBase64: string         // base64 VersionedTransaction
  userWallet?: string               // pubkey; required for balance-floor rules
  policy?: GuardPolicy              // omit for the Balanced default
  paymentRequirements?: PaymentRequirements   // x402 only — enables x402 detectors
}
```

| Field | Required | Notes |
|---|---|---|
| `cluster` | yes | Selects which RPC the simulator hits |
| `transactionBase64` | yes | Either legacy or v0; ALTs are resolved server-side |
| `userWallet` | no | Required when policy uses `minPostUsdcBalance` or balance-relative rules |
| `policy` | no | Inline policy overrides; defaults to Balanced when omitted |
| `paymentRequirements` | no | Only set for x402 payment txs; activates the eight x402 detectors |

### Headers

- `Content-Type: application/json`
- `Authorization: Bearer <key>` *or* `x-api-key: <key>` — required unless `DELTAG_AUTH_MODE` is `x402` (in which case an `X-Payment` header replaces it)
- `X-Request-Id: <uuid>` — optional; echoed in the response and logged for tracing

---

## Response

```ts
type AnalyzeResponse = {
  decision: { safe: boolean, reasons: string[] }
  findings: RiskFinding[]
  estimatedChanges: EstimatedChange[]
  simulationWarnings: string[]
  programIds: string[]
  cpiTrace?: CpiTrace
  unitsConsumed?: number
  primaryAction?: string
  confidence: 'high' | 'medium' | 'low'
}
```

### `decision`

The bottom line.

- `safe: true` — the wallet should let the user sign
- `safe: false` — the wallet should block (or, if Permissive policy + double-confirm, warn)
- `reasons` — short strings the popup renders verbatim under "Why blocked" / "Why safe"

### `findings`

Array of every detector hit, in no particular order. The popup groups by `severity` for display.

```ts
type RiskFinding = {
  code: string              // e.g. "RISKY_PROGRAM_INTERACTION"
  severity: 'high' | 'medium' | 'low'
  message: string           // human-readable
  details?: Record<string, unknown>  // detector-specific payload
}
```

See [Risk detectors](/basics-of-time-travel) for the full code catalogue.

### `estimatedChanges`

The simulation diff.

```ts
type EstimatedChange = {
  owner: string             // pubkey
  mint?: string             // omitted for SOL
  symbol?: string           // when known via reputation DB
  decimals: number
  deltaBaseUnits: bigint    // signed; negative = leaving owner
  deltaUi: number           // human units
  kind: 'sol' | 'token'
}
```

The popup renders one row per change, ordered with the user's wallet first.

### `simulationWarnings`

Non-blocking notes from the simulator: ALT resolution issues, account list truncation, RPC retries, etc.

### `programIds`

Every program touched by the transaction, including via CPI. Top-level programs first; CPI-only programs after.

### `cpiTrace`

Optional. The full CPI tree when `?include=cpi-trace` is set. Useful for debugging detector behaviour or for downstream tooling that wants the full call graph.

### `unitsConsumed`

Compute units the simulator reports were used. Compare against the policy's `maxComputeUnitPriceMicroLamports` × this value to estimate the priority-fee cost of the tx.

### `primaryAction`

A best-guess label: `swap`, `mint`, `transfer`, `approve`, `stake`, `claim`, `payment`, etc. Heuristic; not authoritative.

### `confidence`

How much of the analysis was on solid data:

- `high` — full simulation, full account state
- `medium` — partial truncation or missing optional inputs (e.g. `userWallet`)
- `low` — simulation failed or major data gaps

---

## Examples

### Minimal call

```http
POST /v1/analyze
Content-Type: application/json
Authorization: Bearer dev-key-1

{
  "cluster": "devnet",
  "transactionBase64": "AQAAA..."
}
```

### Safe verdict

```json
{
  "decision": { "safe": true, "reasons": [] },
  "findings": [],
  "estimatedChanges": [
    { "owner": "5xG...abc", "kind": "sol", "decimals": 9, "deltaBaseUnits": -5000n, "deltaUi": -0.000005 }
  ],
  "simulationWarnings": [],
  "programIds": ["11111111111111111111111111111111"],
  "unitsConsumed": 450,
  "primaryAction": "transfer",
  "confidence": "high"
}
```

### Blocked verdict

```json
{
  "decision": {
    "safe": false,
    "reasons": ["blockApprovalChanges (APPROVAL_CHANGE_DETECTED)"]
  },
  "findings": [
    {
      "code": "APPROVAL_CHANGE_DETECTED",
      "severity": "high",
      "message": "New SPL Token approval to G7Hf...xyz for unlimited amount",
      "details": {
        "tokenAccount": "5xG...abc",
        "delegate": "G7Hf...xyz",
        "amount": "18446744073709551615"
      }
    }
  ],
  "estimatedChanges": [
    { "owner": "5xG...abc", "kind": "sol", "decimals": 9, "deltaBaseUnits": -5000n, "deltaUi": -0.000005 },
    { "owner": "5xG...abc", "kind": "token", "mint": "EPjFW...t1v", "symbol": "USDC", "decimals": 6, "deltaBaseUnits": 0n, "deltaUi": 0 }
  ],
  "simulationWarnings": [],
  "programIds": ["TokenkegQ...", "ATokenGPv..."],
  "unitsConsumed": 18420,
  "primaryAction": "approve",
  "confidence": "high"
}
```

---

## Error responses

| Status | Body | Meaning |
|---|---|---|
| 400 | `{ error: "validation_failed", issues: [...] }` | Body failed Zod validation; `issues` is the path-message pairs |
| 401 | `{ error: "unauthorized" }` | API key missing or invalid (when not in x402 mode) |
| 402 | `{ error: "payment_required", requirements: {...} }` | x402 mode active and no valid payment header |
| 408 | `{ error: "rpc_timeout" }` | Simulation exceeded RPC timeout |
| 429 | `{ error: "rate_limited", retryAfterMs: 1234 }` | Per-IP rate limit (default 200/60s) |
| 500 | `{ error: "internal", requestId: "..." }` | Unexpected server error; the requestId matches the log line |

---

## Rate limiting

Default: 200 requests / 60s per IP. Configurable via `DELTAG_RATE_LIMIT_MAX` (set to `0` to disable). Health endpoints (`/health*`) are excluded from the limit.

---

## Source map

| File | Purpose |
|---|---|
| `apps/server/src/api/routes/analyze.ts` | Route handler |
| `apps/server/src/application/analyze-transaction.ts` | Pipeline orchestrator |
| `apps/server/src/domain/policy.ts` | Request body schema (Zod) |
| `apps/server/src/domain/decision.ts` | Response schema |
