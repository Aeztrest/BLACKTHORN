---
title: POST /v1/analyze/batch & /v1/analyze/stream
nextjs:
  metadata:
    title: Batch and stream analyze
    description: Analyze up to 25 transactions in one request, or stream results as they finish via SSE.
---

When an agent or backend needs to analyze multiple transactions, the batch and stream endpoints save round-trips. Both run the same per-tx pipeline as `/v1/analyze` — they differ only in transport. {% .lead %}

---

## `POST /v1/analyze/batch`

Run up to 25 analyses in parallel and return all results in one JSON body.

### Request

```http
POST /v1/analyze/batch
Content-Type: application/json
Authorization: Bearer <key>

{
  "transactions": [
    {
      "cluster": "devnet",
      "transactionBase64": "AQAAA...",
      "userWallet": "5xG...abc",
      "policy": { ... }
    },
    {
      "cluster": "devnet",
      "transactionBase64": "BQAAB..."
    },
    ...
  ]
}
```

Each item in `transactions[]` is a full `AnalyzeRequest` body. Per-item policy and per-item cluster are supported, so a single batch can mix mainnet and devnet.

| Field | Required | Notes |
|---|---|---|
| `transactions` | yes | Length 1–25; longer requests return 400 |

### Response

```ts
type BatchResponse = {
  count: number
  results: BatchResult[]
  summary: {
    safe: number
    blocked: number
    failed: number
    durationMs: number
  }
}

type BatchResult =
  | { ok: true,  index: number, result: AnalyzeResponse }
  | { ok: false, index: number, error: { code: string, message: string } }
```

`results[]` preserves request order. Individual failures don't fail the whole batch — they appear inline as `{ ok: false }` entries.

### Example

```http
POST /v1/analyze/batch
Authorization: Bearer dev-key-1

{ "transactions": [<3 txs>] }

→ {
  "count": 3,
  "results": [
    { "ok": true, "index": 0, "result": { "decision": { "safe": true, ... }, ... } },
    { "ok": false, "index": 1, "error": { "code": "rpc_timeout", "message": "..." } },
    { "ok": true, "index": 2, "result": { "decision": { "safe": false, ... }, ... } }
  ],
  "summary": { "safe": 1, "blocked": 1, "failed": 1, "durationMs": 421 }
}
```

### When to use batch

- Backend agents pre-flighting a queue of pending transactions
- Bulk historical analysis (combined with `/v1/replay` per-tx)
- CI/regression sweeps over a fixture set

---

## `POST /v1/analyze/stream`

Same input shape as batch, but results are streamed back as Server-Sent Events as each completes.

### Request

```http
POST /v1/analyze/stream
Content-Type: application/json
Accept: text/event-stream
Authorization: Bearer <key>

{
  "transactions": [
    { "cluster": "devnet", "transactionBase64": "AQAAA..." },
    ...
  ]
}
```

### Response

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

event: start
data: { "count": 3, "startedAt": 1731442821934 }

event: result
data: { "index": 0, "ok": true, "result": { "decision": { "safe": true, ... }, ... } }

event: result
data: { "index": 2, "ok": true, "result": { "decision": { "safe": false, ... }, ... } }

event: result
data: { "index": 1, "ok": false, "error": { "code": "rpc_timeout", "message": "..." } }

event: complete
data: { "summary": { "safe": 1, "blocked": 1, "failed": 1, "durationMs": 421 } }
```

Notes:

- `event: start` arrives immediately; client knows total count and can render N skeleton rows
- `event: result` events fire in completion order, *not* request order — use the `index` field to slot into the right position
- `event: complete` is the terminator; clients should close the connection on receiving it
- The stream times out after 60s if no event has been emitted (configurable via `DELTAG_SSE_TIMEOUT_MS`)

### When to use stream

- UIs that want to render results progressively (showcase Replay tab, dashboard live tail)
- Long batches where the user wants partial feedback before everything finishes
- Agents that can act on the first blocked verdict without waiting for the rest

### Example client

```ts
const res = await fetch('/v1/analyze/stream', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
  body: JSON.stringify({ transactions }),
})

const reader = res.body!.getReader()
const decoder = new TextDecoder()
let buffer = ''
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  const events = buffer.split('\n\n')
  buffer = events.pop()!
  for (const ev of events) {
    const lines = ev.split('\n')
    const type = lines.find(l => l.startsWith('event:'))?.slice(7).trim()
    const data = JSON.parse(lines.find(l => l.startsWith('data:'))!.slice(6))
    handle(type, data)
  }
}
```

---

## Limits

| Limit | Value | Notes |
|---|---|---|
| Max batch size | 25 | Returns 400 if exceeded |
| Per-item timeout | 12s | Same as `/v1/analyze` |
| Whole-batch timeout | 60s | Returns whatever completed |
| Concurrency | 8 in-flight per batch | RPC-friendly; configurable via `DELTAG_BATCH_CONCURRENCY` |
| Rate limit | shared with `/v1/analyze` (200/60s) | Counts per-batch as 1 request |

---

## Errors

| Status | Body | Meaning |
|---|---|---|
| 400 | `{ error: "validation_failed" }` | Empty array or > 25 items |
| 401 | `{ error: "unauthorized" }` | API key missing/invalid |
| 429 | `{ error: "rate_limited" }` | IP exceeded per-minute quota |

Per-item errors are reported inline; they don't change the HTTP status of the whole batch/stream.

---

## Source map

| File | Purpose |
|---|---|
| `apps/server/src/api/routes/batch.ts` | Both batch and stream handlers |
| `apps/server/src/application/analyze-transaction.ts` | Per-item pipeline (shared with /v1/analyze) |
| `apps/server/src/infra/sse.ts` | SSE writer helpers |
