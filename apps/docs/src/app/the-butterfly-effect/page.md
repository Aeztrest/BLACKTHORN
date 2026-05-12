---
title: x402 payment defense
nextjs:
  metadata:
    title: x402 payment defense
    description: How BLACKTHORN handles HTTP 402 micropayments — verification, settlement, sub-key isolation, drift monitoring.
---

x402 is Coinbase's HTTP micropayment protocol: a server returns `402 Payment Required` with a structured payload describing what the client must pay; the client builds a Solana transaction matching the spec, signs it, and retries the request with the signed payment in the header. BLACKTHORN integrates x402 at three layers — server, extension, and policy — so that the user is never charged for a request that didn't succeed and never spends more than they authorised. {% .lead %}

---

## The protocol in one paragraph

When a client hits a paywalled endpoint without a valid payment, the server responds `402` with a body that includes one or more `PaymentRequirements`: the asset (USDC mint), the amount, the network (`solana:devnet` or `solana:mainnet`), the recipient (`payTo` pubkey), the facilitator URL, the resource being purchased, and a nonce. The client constructs a `VersionedTransaction` containing a `ComputeBudget.SetLimit`, a `ComputeBudget.SetPrice`, an SPL `TransferChecked` to the recipient's ATA, and a Memo holding the nonce. It signs the tx, base64-encodes it, and retries the request with `X-Payment: <base64>`. The server forwards to the facilitator for verification, processes the resource, then asks the facilitator to settle (broadcast) the payment. The facilitator returns the on-chain signature; the server returns the resource.

---

## Where BLACKTHORN sits

```
┌─────────┐  signTransaction  ┌─────────────┐  POST /v1/analyze  ┌──────────┐
│  dApp   │ ─────────────────►│  Extension  │ ──────────────────►│  Server  │
│  with   │                    │  (popup +   │                    │ analyze  │
│  402    │ ◄──────signed──── │  ledger +   │ ◄──findings──────  │ pipeline │
└─────────┘                    │  monitor)   │                    └──────────┘
                               └─────────────┘                          │
                                       │                                │
                                       │  facilitator /verify           │
                                       │  facilitator /settle           │
                                       ▼                                ▼
                              ┌─────────────────┐              ┌─────────────────┐
                              │  PayAI / Coinbase│              │   Solana RPC    │
                              │   facilitator    │              │ (simulate, send)│
                              └─────────────────┘              └─────────────────┘
```

The extension catches the 402 response in its inpage `fetch` interceptor, resolves it through the ledger (sub-key allowance check), routes the resulting transaction through the analyze server, and only then exposes the bytes to the signing key.

---

## Server-side: paywalling /v1/analyze

The analyze endpoint can paywall itself with x402. Configure via env:

```shell
DELTAG_AUTH_MODE=x402              # or "both" to also accept API keys
X402_ENABLED=true
X402_NETWORK=solana:devnet
X402_FACILITATOR_URL=https://facilitator.payai.network
X402_PAY_TO=YourMerchantPubkey
X402_ANALYZE_PRICE=0.001            # USDC per call
```

`apps/server/src/infra/x402.ts` registers a Fastify `preHandler` for `POST /v1/analyze` that:

1. Inspects the incoming request for an `X-Payment` header
2. If absent: returns `402` with the PaymentRequirements payload
3. If present: forwards to the facilitator `/verify` endpoint to validate the signature
4. If invalid: returns `402` with the challenge again
5. If valid: marks `req.x402Payment = <verified>`, lets the handler run
6. After the handler returns successfully: calls facilitator `/settle` to broadcast the payment on-chain
7. If the handler errored or the response failed to validate: skips settlement (the user is *not* charged for a failed request)

The settle-after-success semantic is the key safety property. Earlier x402 implementations settled before processing; ours never does.

---

## Client-side: the extension's x402 flow

The extension's inpage script patches `window.fetch` and `XMLHttpRequest`. When a response comes back with status 402, the patched fetch:

1. Parses the PaymentRequirements
2. Routes to the background via `postMessage` with `{ type: 'x402.payment_request', requirements, origin }`
3. Background looks up the merchant in the IndexedDB ledger
4. If no allowance exists: opens the Sign Request popup as an "Authorize this merchant" surface — user picks a per-tx, per-hour, and per-day cap; on approval, background derives a fresh Swig sub-key for this merchant and writes the allowance row
5. If an allowance exists: checks the current spend window against the caps; rejects with `cap_exceeded` if the new payment would breach
6. If allowed: builds the payment tx using the merchant's sub-key, calls `/v1/analyze` for verdict, opens the Sign Request popup with the analyze findings
7. On user approval: signs with the sub-key, base64-encodes, returns to inpage
8. Inpage retries the original fetch with `X-Payment: <signed>`
9. Background subscribes the resulting signature to the WebSocket monitor for settle confirmation

If the merchant returns 200 but the monitor never observes settlement on-chain within 60 seconds, the alert subsystem fires "verify-not-settle" — the canonical x402 attack where a malicious merchant validates the payment to satisfy the protocol but never broadcasts, hoping to extract free work.

---

## The eight x402 detectors

When a transaction is flagged as x402 (the analyze request includes `paymentRequirements`), the x402 detector module in `apps/server/src/risk/detectors/x402.ts` runs eight cross-checks. Any of them can produce a finding the policy can block on.

| Code | Severity | What it catches |
|---|---|---|
| `X402_SHAPE_INVALID` | high | Tx is missing a required instruction (ComputeBudget setLimit/setPrice or TransferChecked) |
| `X402_DESTINATION_MISMATCH` | high | TransferChecked recipient is *not* the announced merchant's ATA — payment going to wrong place |
| `X402_MINT_MISMATCH` | high | TransferChecked mint differs from the announced asset — paying USDC-look-alike instead of USDC |
| `X402_AMOUNT_MISMATCH` | high | TransferChecked amount differs from the announced amount — secret overcharge |
| `X402_FEEPAYER_IN_ACCOUNTS` | high | Fee payer pubkey appears in the tx account list — spec violation that enables ATA hijack |
| `X402_CU_PRICE_EXCESS` | medium | ComputeUnitPrice > 5 µLamports/CU — drains the user via priority fees |
| `X402_MEMO_MISSING` | medium | No SPL Memo instruction — payment can be replayed |
| `X402_NON_CANONICAL_MINT` | medium | Asset mint not in canonical USDC list or wallet allowlist — possible look-alike token |

Each one corresponds to a real attack class observed in early x402 deployments. See `docs/x402-defense.md` in the repo for the full attack-defense matrix.

---

## Sub-key isolation

Every merchant that the user authorises gets its own Swig sub-key. The advantages:

- **Blast radius is bounded** — if a merchant turns malicious or its facilitator is compromised, only that sub-key's signing authority is at risk. The user's main authority key never signs an x402 payment.
- **Caps are enforced cryptographically** — Swig's policy actions can encode the per-tx cap on-chain. An attacker who steals a sub-key still can't exceed the cap.
- **Pause and revoke are atomic** — the user can pause a sub-key in the **Allowances** tab, which immediately stops it from signing anything new. Revoke goes one step further and removes the sub-key from the Swig authority list on-chain.

Sub-keys are derived deterministically from the master mnemonic + merchant origin, so a wallet restore reproduces them without needing to back up each one separately.

---

## Settlement semantics

The facilitator owns settlement. The flow:

1. Extension sends signed tx to merchant via `X-Payment` header
2. Merchant calls facilitator `/verify` with the signature → facilitator confirms the tx is well-formed and pays the right amount to the right address
3. Merchant runs the protected handler (returns the resource)
4. Merchant calls facilitator `/settle` → facilitator broadcasts the tx to Solana RPC, waits for confirmation, returns the on-chain signature
5. Merchant returns the resource + the on-chain signature in the response

The extension's monitor watches the Solana network for the signature directly. If it never appears within 60s, an alert fires regardless of what the merchant claims.

{% callout type="warning" title="Verify is not settle" %}
A merchant that calls `/verify` but never calls `/settle` has obtained the resource without paying. The user signed a transaction that's valid on-chain but never broadcast. Without monitoring, this attack is invisible. With monitoring, BLACKTHORN catches it within one minute.
{% /callout %}

---

## Anomaly detection

The Allowances tab tracks per-merchant payment history. When `blockAmountAnomalies` is enabled in the policy, the analyze pipeline computes the running mean and standard deviation of the merchant's recent payments and rejects any new payment that deviates by more than `anomalyStdDev` (default 4σ) from the mean. This catches the "silently bumped price" attack where a merchant gradually increases the cost of an API call.

---

## Source map

| File | Responsibility |
|---|---|
| `apps/server/src/infra/x402.ts` | Server-side preHandler, settle-after-success, facilitator client |
| `apps/server/src/infra/x402-fastify-adapter.ts` | Fastify request adapter for x402 |
| `apps/server/src/risk/detectors/x402.ts` | The eight x402 detectors |
| `apps/extension/src/inpage/fetch-intercept.ts` | window.fetch / XMLHttpRequest patching |
| `apps/extension/src/background/x402/handlers.ts` | Ledger lookup, sub-key derivation, settle monitor |
| `apps/extension/src/background/db/ledger.ts` | IndexedDB allowance schema |
| `packages/swig-guard/src/x402.ts` | Client-side payment policy evaluator |
| `docs/x402-defense.md` | Full attack-defense matrix in the repo |
