---
title: POST /v1/replay
nextjs:
  metadata:
    title: POST /v1/replay
    description: Re-simulate a transaction against a historical Solana slot to reproduce or counterfactually re-evaluate it.
---

`/v1/replay` runs the standard analyze pipeline but pins the simulator to a specific historical slot. Used for forensics, regression testing, and counterfactual policy comparisons. {% .lead %}

---

## Request

```http
POST /v1/replay
Content-Type: application/json
Authorization: Bearer <key>

{
  "cluster": "devnet",
  "transactionBase64": "AQAAA...",
  "slot": 312456789,
  "policy": { ... }      // optional override; if omitted uses request defaults
}
```

| Field | Required | Notes |
|---|---|---|
| `cluster` | yes | Must match the cluster the original tx targeted |
| `transactionBase64` | yes | The same `VersionedTransaction` you'd send to `/v1/analyze` |
| `slot` | no | Historical slot; if omitted, behaves like `/v1/analyze` against the current tip |
| `policy` | no | Override the default policy for the replay |
| `userWallet` | no | Same semantics as `/v1/analyze` |

---

## Response

Identical schema to `/v1/analyze`:

```ts
type ReplayResponse = AnalyzeResponse & {
  replay: {
    slot: number          // the slot actually used (may be ≤ requested if RPC rounded)
    blockTime?: number    // unix seconds, if known
  }
}
```

The extra `replay` block tells you which slot the simulator pinned to. Some RPCs round to the nearest available snapshot; the response confirms the actual context.

---

## When to use it

### Forensic — was this drainer detectable last week?

A user signed a tx five days ago and got drained. You want to know if BLACKTHORN, with today's detector set, would have caught it. Replay the tx against the slot that was current when they signed:

```json
{
  "cluster": "mainnet-beta",
  "transactionBase64": "AQAAA...",
  "slot": 305120000
}
```

If the result is `safe: false` with `RISKY_PROGRAM_INTERACTION`, you have your answer — and you have evidence to add the program to the public risky list.

### Regression — did upgrading the detector change behaviour?

When iterating on detector code, replay a fixture set against a fixed slot to ensure the verdict is stable.

### Counterfactual — what would Strict have done?

Take a real tx the user signed under Permissive, replay it with Strict policy, see what would have been blocked.

```json
{
  "cluster": "mainnet-beta",
  "transactionBase64": "AQAAA...",
  "policy": {
    "maxLossPercent": 25,
    "blockApprovalChanges": true,
    "blockUnknownProgramExposure": true
  }
}
```

---

## Slot retention caveats

Solana RPC nodes don't keep historical state forever. Defaults vary by provider:

| Provider | Retention |
|---|---|
| Public mainnet endpoint | ~2 days (~432,000 slots) |
| Public devnet endpoint | ~2 days |
| Helius standard | ~7 days |
| Helius dedicated archive | unbounded |
| Triton archive | unbounded |
| Self-hosted with `--no-snapshot-fetch` | as long as you keep the snapshot |

If the requested slot is older than the RPC can serve, replay returns:

```http
HTTP/1.1 409 Conflict

{
  "error": "slot_unavailable",
  "message": "RPC does not retain slot 305120000",
  "earliestAvailableSlot": 312000000
}
```

Use the `earliestAvailableSlot` hint to retry against the closest reachable point.

---

## Differences from `/v1/analyze`

| Behaviour | `/v1/analyze` | `/v1/replay` |
|---|---|---|
| RPC slot context | current tip | the requested historical slot |
| Pre-state source | live RPC | RPC's snapshot at slot |
| ALT resolution | live | resolved against state at slot |
| Audit log | recorded | recorded with `replay: true` flag |
| x402 detectors | active when paymentRequirements provided | same |
| Settle / payment side-effects | yes (if x402 mode) | **never** — replay is read-only |
| Rate limit | shared `/v1/analyze` quota | shared |

The "never settle" guarantee on replay is critical: replays must not move money. If the original transaction was an x402 payment, the replay computes the would-be verdict but never broadcasts.

---

## Example

```http
POST /v1/replay
Authorization: Bearer dev-key-1

{
  "cluster": "devnet",
  "transactionBase64": "AQAAA...",
  "slot": 312456789
}

→ {
  "decision": { "safe": false, "reasons": ["blockApprovalChanges (APPROVAL_CHANGE_DETECTED)"] },
  "findings": [
    {
      "code": "APPROVAL_CHANGE_DETECTED",
      "severity": "high",
      "message": "...",
      "details": { ... }
    }
  ],
  "estimatedChanges": [...],
  "simulationWarnings": ["RPC returned snapshot for slot 312456788 (requested 312456789)"],
  "programIds": [...],
  "unitsConsumed": 18420,
  "primaryAction": "approve",
  "confidence": "high",
  "replay": {
    "slot": 312456788,
    "blockTime": 1731442821
  }
}
```

---

## Error responses

| Status | Body | Meaning |
|---|---|---|
| 400 | `{ error: "validation_failed" }` | Body failed Zod validation |
| 401 | `{ error: "unauthorized" }` | API key missing/invalid |
| 409 | `{ error: "slot_unavailable", earliestAvailableSlot }` | RPC retention exceeded |
| 408 | `{ error: "rpc_timeout" }` | Simulation exceeded RPC timeout |
| 429 | `{ error: "rate_limited" }` | Shared quota |

---

## Source map

| File | Purpose |
|---|---|
| `apps/server/src/api/routes/replay.ts` | Route handler |
| `apps/server/src/application/replay-transaction.ts` | Slot-aware orchestrator |
| `apps/server/src/simulation/solana-simulator.ts` | Simulator (accepts `slot` param) |
