---
title: GET /v1/audit/*
nextjs:
  metadata:
    title: Audit endpoints
    description: Recent analyses, cross-buffer rollups, and per-program breakdowns from the in-memory audit store.
---

The audit endpoints expose the analyze server's ring-buffered log of every analysis it has run. Three GETs cover the three common questions: what just happened, what's the overall picture, and what does this specific program look like? {% .lead %}

---

## `GET /v1/audit/recent`

Most recent 100 analyses, newest first.

### Request

```http
GET /v1/audit/recent
Authorization: Bearer <key>

# Optional query params
?limit=50          # default 100, max 1000
?safe=false        # filter to blocked only
?cluster=devnet    # filter by cluster
?since=1731440000  # unix-ms; only entries newer
```

### Response

```ts
type RecentResponse = {
  count: number
  entries: AuditEntry[]
}

type AuditEntry = {
  id: string                       // ULID
  timestamp: number                // ms since epoch
  cluster: 'mainnet-beta' | 'devnet' | 'testnet'
  safe: boolean
  confidence: 'high' | 'medium' | 'low'
  riskCodes: string[]              // every code that fired
  programIds: string[]             // every program touched
  primaryAction?: string
  userWallet?: string
  durationMs: number
  blockedReason?: string           // reasons[0] when safe=false
  replay?: boolean                 // true when entry came from /v1/replay
}
```

### Example

```http
GET /v1/audit/recent?limit=3&safe=false
Authorization: Bearer dev-key-1

→ {
  "count": 3,
  "entries": [
    {
      "id": "01HZ7K...",
      "timestamp": 1731442821934,
      "cluster": "devnet",
      "safe": false,
      "confidence": "high",
      "riskCodes": ["APPROVAL_CHANGE_DETECTED"],
      "programIds": ["TokenkegQ...", "ATokenGPv..."],
      "primaryAction": "approve",
      "durationMs": 142,
      "blockedReason": "blockApprovalChanges"
    },
    ...
  ]
}
```

---

## `GET /v1/audit/aggregate`

Cross-buffer rollups. Useful for dashboards and operator at-a-glance views.

### Request

```http
GET /v1/audit/aggregate
Authorization: Bearer <key>

# Optional
?cluster=mainnet-beta
?since=1731440000
```

### Response

```ts
type AggregateResponse = {
  totalAnalyses: number
  blocked: number
  safe: number
  blockedRate: number              // 0..1
  topRisks: { code: string, count: number }[]      // top 10
  topPrograms: {                                   // top 10 by totalSeen
    programId: string
    totalSeen: number
    blockedCount: number
  }[]
  avgDurationMs: number
  windowStart: number              // earliest entry in buffer (ms)
  windowEnd: number                // latest entry (ms)
}
```

### Example

```http
GET /v1/audit/aggregate

→ {
  "totalAnalyses": 8472,
  "blocked": 1208,
  "safe": 7264,
  "blockedRate": 0.1426,
  "topRisks": [
    { "code": "APPROVAL_CHANGE_DETECTED", "count": 421 },
    { "code": "RISKY_PROGRAM_INTERACTION", "count": 318 },
    { "code": "DEEP_CPI_NESTING", "count": 187 }
  ],
  "topPrograms": [
    { "programId": "TokenkegQ...", "totalSeen": 6201, "blockedCount": 88 },
    { "programId": "JUP6Lkbz...", "totalSeen": 1842, "blockedCount": 12 }
  ],
  "avgDurationMs": 168,
  "windowStart": 1731180420019,
  "windowEnd": 1731442821934
}
```

---

## `GET /v1/audit/program/:programId`

Per-program breakdown.

### Request

```http
GET /v1/audit/program/TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
Authorization: Bearer <key>
```

### Response

```ts
type ProgramSummary = {
  programId: string
  totalSeen: number
  blockedCount: number
  blockedRate: number              // 0..1
  riskCodes: Record<string, number> // { code → times fired against this program }
  primaryActions: Record<string, number>
  firstSeen: number
  lastSeen: number
}
```

### Example

```http
GET /v1/audit/program/TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA

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
  "primaryActions": {
    "transfer": 4821,
    "approve": 891,
    "mint": 489
  },
  "firstSeen": 1731180420019,
  "lastSeen": 1731442821934
}
```

If the program ID hasn't been seen, returns `404 Not Found`.

---

## Buffer characteristics

- **Capacity** — 10,000 entries (configurable via `DELTAG_AUDIT_BUFFER_SIZE`)
- **Eviction** — FIFO ring buffer; when full, the oldest entry is dropped
- **Persistence** — none. The buffer lives in process memory and resets on restart. To preserve audit history, ship the structured logs to an external sink (every analyze emits a Pino log line at `info` with `event: 'analyze.completed'` containing the same payload).
- **Locking** — internal mutex; concurrent writes are safe but writes block briefly while the rollup index updates

---

## Auth

All three audit endpoints require an API key. The x402 paywall does *not* apply — these are operator-only endpoints. There is no per-user audit isolation: every analyze across every API key is in the same buffer.

---

## Error responses

| Status | Body | Meaning |
|---|---|---|
| 401 | `{ error: "unauthorized" }` | API key missing/invalid |
| 404 | `{ error: "not_found" }` | `/v1/audit/program/:id` for an unseen program |
| 429 | `{ error: "rate_limited" }` | Per-IP quota |

---

## Operator workflow

A practical loop for monitoring the firewall in production:

1. **Daily** — scrape `/v1/audit/aggregate` and chart `blockedRate` and `topRisks`. Sudden spikes indicate either a new attack pattern or a regression in your detector code.
2. **Weekly** — sort `topPrograms` by `blockedRate` desc. Programs with > 50% block rate are likely drainers; consider adding them to the static `RISKY_PROGRAM_IDS` list.
3. **Per-incident** — when a user reports a missed attack, pull `/v1/audit/recent` for their `userWallet`, find the corresponding entry, then `/v1/replay` the transaction with the latest detector code to confirm whether the gap is fixed.

---

## Source map

| File | Purpose |
|---|---|
| `apps/server/src/data/audit-store.ts` | Ring buffer + per-program rollup |
| `apps/server/src/api/routes/audit.ts` | All three GET handlers |
