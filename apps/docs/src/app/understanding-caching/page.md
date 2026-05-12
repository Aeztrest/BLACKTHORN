---
title: How BLACKTHORN works
nextjs:
  metadata:
    title: How BLACKTHORN works
    description: The three-layer model — pre-sign simulation, stateful grants ledger, and post-sign drift monitor.
---

BLACKTHORN sits between the dApp and the wallet's signing key. Every signature request is intercepted, simulated against the live Solana state, decoded into human-readable balance deltas, and gated by a policy. Nothing is signed until the policy says yes. {% .lead %}

---

## The three layers

The product is built around three independent layers that compose into a single defence:

### 1. Pre-sign simulation

Before the user's key ever touches the transaction bytes, BLACKTHORN sends the transaction to the analyze server. The server decodes it, resolves Address Lookup Tables, simulates it on Solana RPC with `sigVerify: false`, extracts the resulting SOL and SPL-token balance deltas, decodes inner instructions into a CPI tree, and runs every detector in parallel. The verdict and the supporting findings come back to the wallet *before* the popup ever asks the user to confirm.

### 2. Stateful grants ledger

For x402 micropayments and any other repeat-signature scenario, the extension keeps an IndexedDB ledger of authorisations. Each merchant gets its own Swig sub-key with per-tx, per-hour, and per-day caps. The ledger tracks every spend, every cap hit, and exposes pause and revoke controls in the **Allowances** tab. Sub-keys can be rotated or removed on-chain via Swig's `RemoveAuthority` instruction.

### 3. Post-sign drift monitor

After signing, the extension's service worker subscribes via WebSocket to the user's authority pubkey *and* every issued sub-key. Any transaction the user didn't initiate from this device fires a browser notification and lands in the **Activity** tab as an alert. The monitor also catches the verify-but-don't-settle x402 attack where a merchant validates the payment but never broadcasts it.

---

## Request lifecycle

Here's what happens between a dApp calling `wallet.signTransaction(tx)` and the user seeing a result:

1. **Inpage provider intercepts** — the extension's inpage script (registered as a Wallet Standard wallet) receives the signTransaction call from the dApp.
2. **Forwarded to background** — content script relays the unsigned transaction (base64) and origin to the service worker via `postMessage`.
3. **Analyze call** — background calls `POST http://localhost:8080/v1/analyze` with `{ cluster, transactionBase64, userWallet, policy }`. Default timeout 12 seconds.
4. **Server simulates** — Fastify receives the request, decodes the tx, resolves ALTs, calls `simulateTransaction` on RPC, extracts deltas, builds a CPI trace, runs the detector suite, evaluates the policy.
5. **Verdict returned** — server responds with `{ decision: { safe, reasons }, findings, estimatedChanges, simulationWarnings }`.
6. **Popup re-renders** — the extension popup opens (or re-renders if already open) as a Sign Request: green hero if safe, red hero if blocked. Findings are listed; estimated changes are shown row-by-row.
7. **User decides** — Sign and send, or Cancel. If the user clicks Sign, the background signs with either the authority key or a per-merchant sub-key, then broadcasts via RPC.
8. **Monitor subscribes** — the WebSocket monitor adds the resulting signature to its watch list and waits for confirmation. Once confirmed, the **Activity** tab appends an entry.

---

## Why simulate, not parse?

Parsing instruction bytes alone is unsafe. Solana programs can execute arbitrary CPI: a transaction whose top-level instruction looks like a benign token transfer can, mid-execution, invoke a different program that drains an unrelated account. The only way to know what a transaction actually does is to *run it* and inspect the resulting state.

BLACKTHORN's simulator runs the full transaction against current chain state (including pre-fetched account data and resolved ALTs), then computes the delta between pre-state and post-state. That delta is what the user sees — not what the dApp claims will happen.

{% callout title="Trust the simulation, not the UI" %}
The "What changes" rows in the popup come from the simulation diff, not from the dApp's UI strings. If the dApp says "Swap 1 SOL for 100 USDC" but the simulation shows your USDC account staying flat and an unknown wallet receiving 1 SOL, the popup will display the second version. The first one is marketing copy.
{% /callout %}

---

## The three-app surface area

The same analyze pipeline powers three different client surfaces:

- **Browser extension** (`apps/extension`) — the canonical product. Lives in Chrome and Firefox, intercepts every Wallet Standard signTransaction call, runs the full ledger + monitor.
- **Web wallet** (`apps/wallet`) — same Swig smart wallet, hosted at a URL. No service worker (state lives in React hooks), no IndexedDB (localStorage), no WebSocket monitor (polling). For users who can't install the extension.
- **Showcase apps** (`apps/showcase`) — six demo dApps that don't ship BLACKTHORN themselves; they auto-discover whatever Wallet Standard wallet the user has installed. Used for testing and for letting new users feel the protection before trusting it with real funds.

All three call the same `POST /v1/analyze` endpoint and use the same `@blackthorn/swig-guard` policy evaluator.

---

## What lives where

| Concern | Lives in | Why |
|---|---|---|
| Transaction simulation | `apps/server/src/simulation/` | Needs Solana RPC, runs hot on every sign |
| Risk detection | `apps/server/src/risk/detectors/` | Pure functions over simulation output |
| Policy evaluation | `apps/server/src/policy/engine.ts` + `packages/swig-guard` | Server-side default; client-side evaluator for offline use |
| Allowance ledger | `apps/extension/src/background/db/ledger.ts` | Must persist across browser restarts |
| Drift monitor | `apps/extension/src/background/x402/handlers.ts` | Needs WebSocket, lives in service worker |
| Sub-key derivation | `apps/extension/src/background/wallet-standard/` | Swig-specific, client-side custody |
| Audit log | `apps/server/src/data/audit-store.ts` | In-memory ring buffer, exposed via `/v1/audit/*` |

Read [Pre-sign simulation](/predicting-user-behavior) next for the simulation pipeline in depth, or [Risk detectors](/basics-of-time-travel) for the catalogue of finding codes.
