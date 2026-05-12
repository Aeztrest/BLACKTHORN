---
title: Getting started
---

BLACKTHORN is a pre-sign transaction firewall for Solana. It simulates every transaction before the user's wallet ever signs it, decodes what will actually happen on-chain, and blocks anything that violates the user's policy. {% .lead %}

{% quick-links %}

{% quick-link title="Installation" icon="installation" href="/installation" description="Run the analyze server locally, install the browser extension, and bring up the showcase apps." /%}

{% quick-link title="How it works" icon="presets" href="/understanding-caching" description="The three-layer architecture: pre-sign simulation, stateful grants ledger, post-sign drift monitor." /%}

{% quick-link title="Risk detectors" icon="plugins" href="/basics-of-time-travel" description="Twenty-plus detectors that flag drainers, hidden approvals, malicious CPI nesting, and Token-2022 traps." /%}

{% quick-link title="API reference" icon="theming" href="/cacheadvance-predict" description="Every server endpoint: /v1/analyze, /v1/analyze/batch, /v1/replay, /v1/audit/*, MCP." /%}

{% /quick-links %}

Solana wallet users sign blind. Once you click "Approve" on Phantom or Backpack, you have no idea whether the transaction will swap a token, drain your SOL, hand a stranger unlimited spend on your USDC, or invoke a Token-2022 transfer hook that locks you out forever. BLACKTHORN closes that gap by running every candidate transaction through a real Solana simulation, decoding the resulting balance deltas and inner instructions into human-readable findings, and enforcing a configurable policy *before* the wallet's signing key is ever exposed to the bytes.

---

## What you get

BLACKTHORN ships as a monorepo with one server and three client surfaces:

- **`apps/server`** — a Fastify API that accepts a base64 `VersionedTransaction`, runs the simulation + risk pipeline, and returns a verdict. Optionally paywalled with the x402 micropayment protocol.
- **`apps/extension`** — a Chrome MV3 / Firefox browser extension that registers as a Wallet Standard wallet. Every dApp signature request flows through it.
- **`apps/wallet`** — a web-hosted Swig smart wallet for users who can't (or won't) install the extension.
- **`apps/showcase`** — six fake-but-plausible Solana dApps that demonstrate real attack patterns the firewall catches.

{% callout title="The product, in one sentence" %}
A wallet that refuses to sign transactions it can't explain.
{% /callout %}

---

## Quick start

Bring up the analyze server, point the extension at it, and load a showcase site to see the full pre-sign flow end-to-end.

### 1. Run the server

```shell
pnpm install
pnpm --filter @blackthorn/server dev
```

The Fastify server listens on `http://localhost:8080`. Hit `GET /health` to confirm it's ready, then `GET /health/ready` to verify the Solana RPC and (optionally) the x402 facilitator are reachable.

### 2. Build the extension

```shell
pnpm --filter @blackthorn/extension build
```

Load the unpacked extension from `apps/extension/dist/` in `chrome://extensions` (or `apps/extension/dist-firefox/` via `about:debugging` in Firefox).

### 3. Visit the showcase

```shell
pnpm --filter @blackthorn/showcase dev
```

Open `http://localhost:5174`, pick any of the six demos (SolSwap, PixelDrop, SolYield, ClaimHub, LaunchPad, Scrybe), connect the extension, and toggle between the safe and malicious scenarios. The popup will block exactly the txs it should and let through exactly the txs it shouldn't.

---

## Where to go next

If you've never seen the codebase before, read [Understanding the architecture](/understanding-caching) first — it explains the three-layer model that the rest of the docs assume. If you're integrating BLACKTHORN into a different wallet or building your own client, jump straight to the [API reference](/cacheadvance-predict). If you want to write or modify the rules that gate signing, see the [Policy DSL](/introduction-to-string-theory).
