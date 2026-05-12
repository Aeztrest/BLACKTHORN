---
title: Audit logs & replay
nextjs:
  metadata:
    title: Audit logs & replay
    description: The audit subsystem — ring-buffered analyses, per-program reputation, and historical-slot replay.
---

Every analyze call is logged to an in-memory ring buffer. Operators can query recent activity, aggregate stats across the whole run, and inspect per-program patterns. Replay re-runs an analysis against a historical slot to compare verdicts over time. {% .lead %}

---

## What gets logged

Each successful analyze emits one `AuditEntry`:

```ts
type AuditEntry = {
  id: string                       // ULID
  timestamp: number                // ms since epoch
  cluster: 'mainnet-beta' | 'devnet' | 'testnet'
  safe: boolean                    // policy verdict
  confidence: 'high' | 'medium' | 'low'
  riskCodes: string[]              // finding codes that fired
  programIds: string[]             // every program touched (top + CPI)
  primaryAction?: string           // best-guess label ("swap", "mint", "transfer", ...)
  userWallet?: string              // when supplied
  durationMs: number               // analyze pipeline wall-clock
  blockedReason?: string           // first reasons[] entry when safe=false
}
```

Storage: `apps/server/src/data/audit-store.ts`. Ring buffer capacity is **10,000 entries** (configurable via `DELTAG_AUDIT_BUFFER_SIZE`). The store also maintains a per-program rollup: `{ programId → { totalSeen, blockedCount, riskCodes: { code → count }, lastSeen } }`.

{% callout type="warning" title="In-memory only" %}
The audit store is process-local and resets on restart. There is no persistent backend in v1. Operators who want long-term retention should either ship the entries to their own log pipeline (Loki, Datadog) via a Pino transport, or wire up a Postgres adapter — the store interface is small and pluggable.
{% /callout %}

---

## Endpoints

Three GETs expose the audit data:

### `GET /v1/audit/recent`

Returns the last 100 `AuditEntry` records, newest first. Used by the dashboard's live tail.

```http
GET /v1/audit/recent
Authorization: Bearer <key>

→ {
  "count": 100,
  "entries": [
    {
      "id": "01HZ...",
      "timestamp": 1731442821934,
      "cluster": "devnet",
      "safe": false,
      "confidence": "high",
      "riskCodes": ["APPROVAL_CHANGE_DETECTED"],
      "programIds": ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", ...],
      "primaryAction": "approve",
      "durationMs": 142,
      "blockedReason": "blockApprovalChanges"
    },
    ...
  ]
}
```

### `GET /v1/audit/aggregate`

Cross-buffer rollups.

```http
GET /v1/audit/aggregate
Authorization: Bearer <key>

→ {
  "totalAnalyses": 8472,
  "blocked": 1208,
  "safe": 7264,
  "blockedRate": 0.1426,
  "topRisks": [
    { "code": "APPROVAL_CHANGE_DETECTED", "count": 421 },
    { "code": "RISKY_PROGRAM_INTERACTION", "count": 318 },
    { "code": "DEEP_CPI_NESTING", "count": 187 },
    ...
  ],
  "topPrograms": [
    { "programId": "TokenkegQ...", "totalSeen": 6201, "blockedCount": 88 },
    { "programId": "JUP6Lkbz...", "totalSeen": 1842, "blockedCount": 12 },
    ...
  ],
  "avgDurationMs": 168
}
```

### `GET /v1/audit/program/:programId`

Per-program detail.

```http
GET /v1/audit/program/TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
Authorization: Bearer <key>

→ {
  "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "totalSeen": 6201,
  "blockedCount": 88,
  "blockedRate": 0.0142,
  "riskCodes": {
    "APPROVAL_CHANGE_DETECTED": 51,
    "DELEGATE_CHANGE_DETECTED": 23,
    "DEEP_CPI_NESTING": 14
  },
  "lastSeen": 1731442821934,
  "firstSeen": 1731180420019
}
```

---

## Replay

`POST /v1/replay` re-simulates a transaction against a historical slot. Use cases:

- **Forensic** — was this drainer detectable when the user signed it last week?
- **Regression** — did upgrading a detector change the verdict on a known fixture?
- **Counterfactual** — what would the verdict have been with a different policy?

```http
POST /v1/replay
Content-Type: application/json
Authorization: Bearer <key>

{
  "cluster": "devnet",
  "transactionBase64": "AQAAA...",
  "slot": 312456789,
  "policy": { ... }       // optional override
}
```

Response is identical to `/v1/analyze` — same Decision, Findings, EstimatedChanges. The slot context affects:

- Account state used as the simulation pre-state
- Program versions deployed at that slot (relevant for upgradeable programs)
- Recent blockhash window

If the requested slot is older than the RPC's retention (default 432,000 slots ≈ 2 days for the public devnet endpoint), replay returns `409 Conflict` with `error: "slot_unavailable"`.

---

## Suggested operator workflow

The audit endpoints are designed to support a simple "what's broken" loop:

1. Watch `topRisks` daily — if a finding code starts climbing, you have a new threat in the wild
2. Filter `topPrograms` by `blockedRate` desc to surface programs whose interactions are mostly blocks (likely drainers)
3. For any program that looks suspicious, hit `/v1/audit/program/:id` for the breakdown
4. Pull a representative `transactionBase64` from `/v1/audit/recent` matching that program, replay it locally, walk the findings

---

## Streaming the log out

To preserve audit data beyond the buffer, attach a Pino transport in `apps/server/src/index.ts`:

```ts
const logger = pino({
  transport: {
    targets: [
      { target: 'pino-pretty', options: { ... } },
      { target: 'pino-loki', options: { host: 'http://loki:3100' } },
    ]
  }
})
```

Every audit entry is also emitted as a structured log line at `info` level with `event: 'analyze.completed'`, so a Loki/ES sink picks them up automatically.

---

## Source map

| File | Purpose |
|---|---|
| `apps/server/src/data/audit-store.ts` | Ring buffer + per-program rollup |
| `apps/server/src/api/routes/audit.ts` | The three GET endpoints |
| `apps/server/src/api/routes/replay.ts` | POST /v1/replay handler |
| `apps/server/src/application/replay-transaction.ts` | Replay orchestrator (slot-aware simulator) |
| `apps/server/src/infra/solana-rpc.ts` | RPC adapter, timeout/retry |
