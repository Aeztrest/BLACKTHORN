---
title: Installation
nextjs:
  metadata:
    title: Installation
    description: Bring up the BLACKTHORN analyze server, browser extension, web wallet, and showcase apps.
---

BLACKTHORN is a pnpm monorepo. One command installs every workspace; individual apps are run with `pnpm --filter <name>`. This page walks through the full local setup.

---

## Requirements

- **Node.js** ≥ 20 (the server uses native fetch and Node 20 features)
- **pnpm** ≥ 9 (workspace + filter syntax depends on it)
- **A Solana RPC endpoint** — the public devnet (`https://api.devnet.solana.com`) is fine for local dev; mainnet workloads should use Helius, Triton, QuickNode, or a self-hosted validator
- **Chrome 120+ or Firefox 128+** to load the unpacked extension
- *(Optional)* an x402 facilitator URL — the project defaults to PayAI's hosted facilitator at `https://facilitator.payai.network`; only required if you want the analyze endpoint to be paywalled

---

## Clone and install

```shell
git clone https://github.com/<your-org>/DeltaProtokol.git
cd DeltaProtokol
pnpm install
```

`pnpm install` resolves every workspace under `apps/*` and `packages/*` in one pass, builds the shared TypeScript packages (`@blackthorn/swig-guard`, `@blackthorn/ext-protocol`, `@blackthorn/ui`), and writes a single root `node_modules` with hoisted deps.

---

## Run the analyze server

```shell
pnpm --filter @blackthorn/server dev
```

The server listens on `http://localhost:8080`. Verify it's up:

```shell
curl http://localhost:8080/health
# → { "status": "ok" }

curl http://localhost:8080/health/ready
# → { "status": "ready", "checks": { "rpc": "ok", "x402": "disabled" } }
```

### Required environment variables

The server validates its config with Zod at startup. The minimum to run on devnet is a single env var pointing at an RPC URL:

```shell
DELTAG_RPC_URL=https://api.devnet.solana.com
```

A complete `.env` for a paywalled deployment looks like:

```shell
# Server
DELTAG_PORT=8080
DELTAG_RPC_URL=https://api.devnet.solana.com
DELTAG_API_KEYS=dev-key-1,dev-key-2
DELTAG_AUTH_MODE=both          # api_key | x402 | both
DELTAG_RATE_LIMIT_MAX=200      # 0 to disable

# x402 (only required when AUTH_MODE includes x402)
X402_ENABLED=true
X402_NETWORK=solana:devnet
X402_FACILITATOR_URL=https://facilitator.payai.network
X402_PAY_TO=YourMerchantPubkeyHere
X402_ANALYZE_PRICE=0.001       # USDC per analyze call

# Risk lists (comma-separated program IDs, optional)
RISKY_PROGRAM_IDS=
KNOWN_SAFE_PROGRAM_IDS=
```

{% callout type="warning" title="Authentication mode" %}
When `DELTAG_AUTH_MODE=api_key` (the default), every `/v1/*` endpoint requires `Authorization: Bearer <key>` or the `x-api-key` header. When set to `x402`, only the analyze endpoint can be hit without a key — but it requires a valid x402 payment instead. `both` enables either path.
{% /callout %}

---

## Build the browser extension

```shell
pnpm --filter @blackthorn/extension build
```

This produces two builds:

- `apps/extension/dist/` — Chrome MV3 (service worker background)
- `apps/extension/dist-firefox/` — Firefox MV3 with the `browser` namespace polyfill

### Load in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**, select `apps/extension/dist/`
4. Pin BLACKTHORN to the toolbar

### Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `apps/extension/dist-firefox/manifest.json`

The extension's onboarding flow opens automatically on first install. Walk through the eight-step setup (passphrase → keypair → backup → Swig provisioning → policy template) to get a working wallet on devnet.

---

## Run the web wallet (optional)

```shell
pnpm --filter @blackthorn/wallet dev
```

Opens at `http://localhost:5180`. Same onboarding flow as the extension; useful for browsers where you can't sideload an extension or for CI screenshots.

---

## Run the showcase

```shell
pnpm --filter @blackthorn/showcase dev
```

Opens at `http://localhost:5174`. The portal page links to all six demo dApps. Each one auto-discovers any installed Wallet Standard wallet (so make sure the extension is loaded first), and each one has a **Safe / Malicious** toggle in the header so you can flip between the benign and the attack-shaped versions of the same transaction.

---

## Run this docs site

```shell
pnpm --filter @blackthorn/docs dev
```

Opens at `http://localhost:5174/docs`. Hot-reloads on every Markdoc edit.

---

## Verify the full stack

With all four processes running, visit `http://localhost:5174/solswap`:

1. Connect — the SolSwap UI should pick up BLACKTHORN as the recommended wallet.
2. Build a swap — pick any input and output token, click **Swap**.
3. The extension popup opens with a green "Safe to sign" hero, the **What changes** rows showing the actual token deltas, and an empty findings list. Click **Sign and send**.
4. Toggle to **Malicious** in the SolSwap header. Run the swap again. The popup re-renders red, lists `RISKY_PROGRAM_INTERACTION` plus the implied loss percentage, and disables the Sign button.

If both flows behave as described, your installation is wired correctly.

---

## Docker (server only)

A Dockerfile lives in `apps/server/Dockerfile`. The repo's root `docker-compose.yml` brings up just the analyze server on port `8080`:

```shell
docker compose up server
```

Mount or pass through the same env vars listed above.
