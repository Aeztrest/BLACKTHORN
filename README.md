# BLACKTHORN

> The Solana smart wallet that simulates every signature before your keys touch it — and watches what happens after.

A browser-extension wallet built on the [Swig](https://onswig.com) protocol
with a transaction firewall in the signing path. Pre-sign simulation,
per-site policies, on-chain sub-key revoke, and the first wallet-level
defense for the **x402** HTTP-402 payment protocol.

---

## What's in the box

| Package | What it is |
|---|---|
| `apps/extension` | Chrome MV3 + Firefox MV3 extension. Popup, Options page, background service worker, Wallet Standard implementation, x402 fetch interceptor. |
| `apps/server`    | Fastify analyze server. `POST /v1/analyze` returns a structured risk verdict; `GET /demo/scrybe` is the merchant side of the x402 demo, backed by [PayAI's](https://facilitator.payai.network) public devnet facilitator. |
| `apps/showcase`  | Five demo dApps + a Scrybe x402 paywall site + an `/install` page that downloads the extension build with browser-aware install steps. |
| `apps/wallet`    | Optional standalone web wallet (Vite SPA) — not required for the extension flow. |
| `packages/swig-guard`     | Policy DSL + analyzer. Pre-sign rules, x402 rules, allowance rules, behavioral alerts. |
| `packages/ext-protocol`   | Type-safe message envelope shared by every extension surface. |
| `packages/blackthorn-adapter` | Wallet Standard adapter the showcase consumes. |
| `packages/ui`             | Design tokens (`tokens.css`) — single source of truth for the monochrome white-on-black palette. |

---

## Quick start (≈ 5 minutes)

### Requirements
- Node.js ≥ 20
- [pnpm](https://pnpm.io) (`corepack enable` works)
- Chrome / Brave / Edge / Firefox (≥ 128) — the extension targets MV3

### 1. Install deps

```bash
pnpm install
```

### 2. Bootstrap the x402 merchant (one-time)

Generates a devnet merchant keypair, requests an airdrop, creates the
merchant's USDC ATA, persists everything to `apps/server/.env`. Idempotent —
re-running is safe.

```bash
pnpm --filter @deltag/server x402-setup
```

If devnet airdrop is rate-limited, the script prints the merchant address;
send ~0.05 devnet SOL there from any wallet, then rerun.

### 3. Start the server

```bash
pnpm dev:server
```

Listens on `http://localhost:8080`. Logs `x402 demo paywall live` when ready.

### 4. Start the showcase

In another terminal:

```bash
pnpm dev:showcase
```

Open <http://localhost:5174>. Five demo dApps + Scrybe x402 paywall.

### 5. Install the extension

Either:

- Visit <http://localhost:5174/install> — auto-detects your browser, gives
  you a one-click download of the zipped build + the right "load unpacked"
  steps, OR
- Build manually:

  ```bash
  pnpm build:extension
  ```

  Then load `apps/extension/dist/` as an unpacked extension (Chrome) or
  load `apps/extension/dist-firefox/manifest.json` as a Temporary Add-on
  (Firefox).

After install:

1. Click the BLACKTHORN icon → create wallet, save the mnemonic.
2. From the popup, use **Airdrop** to fund the authority on devnet, or
   grab USDC from <https://faucet.circle.com> (Solana / devnet) to test
   the x402 flow.
3. Visit any showcase site → **Connect Wallet** → pick BLACKTHORN → trigger
   a swap / mint / paywall payment. The popup shows pre-sign analysis;
   the **Options → Sites** page tracks every origin you've touched;
   **Options → Policies** is the live policy editor.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ 1. PRE-SIGN GUARD                                       │
│    Pre-sign simulation + 25+ risk detectors,            │
│    rendered to the user as plain-language verdicts.     │
├─────────────────────────────────────────────────────────┤
│ 2. STATEFUL ALLOWANCE LEDGER                            │
│    Per-merchant Swig sub-keys with rolling caps,        │
│    on-chain revoke, drift alerts.                       │
├─────────────────────────────────────────────────────────┤
│ 3. x402 FIREWALL                                        │
│    HTTP-402 interceptor + policy gate: per-tx cap,      │
│    hourly/daily caps, anomaly check, facilitator        │
│    allowlist, memo enforcement. No other wallet         │
│    protects this layer today.                           │
└─────────────────────────────────────────────────────────┘
```

Full design notes live in [`docs/`](./docs) and
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Useful commands

```bash
pnpm dev:server          # Fastify server on :8080
pnpm dev:showcase        # showcase + /install on :5174
pnpm dev:extension       # vite-plugin-crxjs HMR (rare — usually just build)
pnpm build:extension     # Chrome dist + Firefox dist + zip them for /install
pnpm typecheck           # tsc across every workspace
pnpm test                # vitest in @deltag/server
pnpm --filter @deltag/server x402-setup   # rerun merchant bootstrap
```

---

## Status

Hackathon-stage. Devnet only.
The extension is unpacked / temporary-add-on install today — not yet on the
Chrome Web Store or AMO.

Known limits and follow-on work in [`LIMITATIONS.md`](./LIMITATIONS.md).

---

## License

MIT — see [`LICENSE`](./LICENSE).
