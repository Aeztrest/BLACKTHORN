---
title: Browser extension
nextjs:
  metadata:
    title: Browser extension
    description: How the BLACKTHORN browser extension is structured — service worker, popup, content script, inpage provider.
---

The browser extension (`apps/extension`) is the canonical product surface. It registers as a Wallet Standard wallet, intercepts every dApp signature request, runs the analyze pipeline, enforces the policy, manages the Swig sub-key ledger, and monitors post-sign drift via WebSocket. {% .lead %}

---

## Targets

- **Chrome MV3** — manifest v3, ESM service worker, output in `apps/extension/dist/`
- **Firefox MV3** — 128.0+, output in `apps/extension/dist-firefox/`, uses `webextension-polyfill` for the `browser` namespace

The build is unified: `manifest.config.ts` is the single source of truth, and `vite.config.ts` produces both targets in one pass via `@crxjs/vite-plugin` (Chrome) and a separate Firefox build step.

---

## Surface map

| Surface | Path | Dimensions | Purpose |
|---|---|---|---|
| Popup | `src/popup/` | 360×600 | Default toolbar UI; four tabs (Home, Activity, Allowances, Settings) |
| Sign Request | popup override | 360×600 | Full-bleed overlay when a dApp is signing; verdict + findings + sign button |
| Options | `src/options/` | 1280×800+ | Full wallet UI; expanded versions of every popup tab plus Policies and x402 dashboard |
| Onboarding | options route | full screen | Eight-step setup wizard |
| Background | `src/background/` | service worker | State machine, IndexedDB, monitor, crypto custody, message router |
| Content script | `src/content/` | per-page | Injects inpage provider; mediates postMessage |
| Inpage | `src/inpage/` | page context | Wallet Standard registration; fetch interceptor for x402 |

Each surface is a separate Vite entry point.

---

## State machine

The background service worker holds a single `WalletState` reducer:

```
uninitialized
  ↓ onboarding completes
locked
  ↓ user enters passphrase
ready
  ↓ dApp calls signTransaction
signing  ──→  ready  (after sign or cancel)
  ↓
alert    (drift detected)
  ↓ user dismisses
ready
```

The state machine lives at `src/background/state/machine.ts`. Every transition emits an event that the popup subscribes to, so the UI is always consistent with the worker's truth.

---

## Storage layout

The extension uses three IndexedDB stores plus `chrome.storage.local` for non-sensitive prefs:

- **`keystore`** — encrypted authority keypair (PBKDF2 100k iterations + AES-GCM); decrypted with the user's passphrase into an in-memory session key with a configurable idle timeout
- **`ledger`** — allowance rows: `{ origin, subKeyPubkey, asset, perTx, perHour, perDay, spendThisHour, spendToday, paused, createdAt, lastUsedAt }`
- **`history`** — every signature request: `{ id, origin, decision, findings, estimatedChanges, signature?, signedAt, status }`
- **`alerts`** — drift events from the monitor: `{ id, signature, kind, observedAt, dismissed }`

Schemas live in `src/background/db/`.

---

## The crypto custody story

The authority keypair never leaves the service worker. On first install the wallet either generates a fresh ed25519 keypair or imports a 24-word mnemonic; in both cases the resulting bytes are encrypted with PBKDF2(passphrase) → AES-GCM and written to the keystore. The decryption key lives in the worker's memory only while the wallet is unlocked; an idle timeout (default 15 min) wipes it.

Sub-keys are derived deterministically from the master mnemonic + merchant origin via Swig's standard derivation path. They're stored unencrypted in the ledger because they're scoped — losing a sub-key only loses access to that merchant's spend.

---

## Wallet Standard registration

The inpage script registers the extension as a Wallet Standard wallet:

```ts
import { registerWallet } from '@wallet-standard/wallet'

registerWallet({
  version: '1.0.0',
  name: 'BLACKTHORN',
  icon: 'data:image/svg+xml;base64,...',
  chains: ['solana:mainnet', 'solana:devnet', 'solana:testnet'],
  features: {
    'standard:connect': { version: '1.0.0', connect },
    'standard:disconnect': { version: '1.0.0', disconnect },
    'solana:signTransaction': { version: '1.0.0', signTransaction },
    'solana:signAndSendTransaction': { version: '1.0.0', signAndSendTransaction },
    'solana:signMessage': { version: '1.0.0', signMessage },
    'standard:events': { version: '1.0.0', on },
  },
  accounts: [],
})
```

Any dApp using `@solana/wallet-adapter-react`'s auto-discovery picks BLACKTHORN up automatically. No integration on the dApp side.

---

## Message protocol

Inpage ↔ content ↔ background communicate via structured messages defined in `packages/ext-protocol`:

```ts
type Message =
  | { type: 'wallet.connect_request', origin: string }
  | { type: 'wallet.sign_request', origin: string, transactionBase64: string, options?: SignOptions }
  | { type: 'wallet.sign_message_request', origin: string, message: Uint8Array }
  | { type: 'x402.payment_request', origin: string, requirements: PaymentRequirements }
  | { type: 'analysis.result', requestId: string, result: AnalyzeResponse }
  | { type: 'sign.complete', requestId: string, signature: string }
  | { type: 'sign.cancelled', requestId: string }
  | { type: 'monitor.alert', alert: Alert }
```

The protocol package is consumed by both the extension and the web wallet, so they speak the same language.

---

## How an analyze call is made

`src/background/blackthorn/analyze-client.ts` is a thin HTTP client:

```ts
async function analyze(req: {
  cluster: Cluster,
  transactionBase64: string,
  userWallet?: string,
  policy?: GuardPolicy,
}): Promise<AnalyzeResponse> {
  const url = `${BASE_URL}/v1/analyze`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) throw new AnalyzeError(res.status, await res.text())
  return res.json()
}
```

The default `BASE_URL` is `http://localhost:8080` for development; production builds bake in a deployed URL. The user can override the URL in the **Settings** tab to point at a self-hosted server.

---

## The post-sign monitor

`src/background/x402/handlers.ts` opens WebSocket subscriptions on startup:

```ts
connection.onAccountChange(authorityPubkey, callback)
for (const subKey of allSubKeys) {
  connection.onAccountChange(subKey, callback)
}
```

When an account changes, the monitor fetches recent signatures for that account and cross-references them against the local request log. Any signature *not* in the log is flagged as drift and lands in the alerts store.

For x402 specifically, the monitor also tracks pending settles: every signed payment is added to a watch list with a 60-second deadline; if the on-chain confirmation doesn't arrive in time, an `x402.verify_not_settle` alert fires.

---

## Building

```shell
pnpm --filter @blackthorn/extension build       # production build, both browsers
pnpm --filter @blackthorn/extension dev         # watch mode for Chrome
pnpm --filter @blackthorn/extension build:firefox  # Firefox-only artifact
```

The Chrome build hot-reloads via `@crxjs/vite-plugin` when the dev server is running. Firefox requires a manual reload via `about:debugging` after each rebuild.

---

## Source map

| Path | Purpose |
|---|---|
| `manifest.config.ts` | Manifest source of truth (Chrome + Firefox) |
| `src/background/index.ts` | Service worker entry point |
| `src/background/state/machine.ts` | WalletState reducer |
| `src/background/crypto/keystore.ts` | PBKDF2 + AES-GCM encryption |
| `src/background/db/ledger.ts` | IndexedDB allowances |
| `src/background/db/history.ts` | IndexedDB signature history |
| `src/background/blackthorn/analyze-client.ts` | HTTP client to /v1/analyze |
| `src/background/x402/handlers.ts` | x402 ledger + monitor |
| `src/background/wallet-standard/` | Swig sub-key derivation + signing |
| `src/popup/Home.tsx` | Default popup tab |
| `src/popup/SignRequest.tsx` | Sign verdict + findings UI |
| `src/popup/Allowances.tsx` | Per-merchant allowance management |
| `src/options/OptionsApp.tsx` | Full options page (two-column layout) |
| `src/content/index.ts` | Content script (postMessage bridge) |
| `src/inpage/index.ts` | Inpage provider + Wallet Standard registration |
| `src/inpage/fetch-intercept.ts` | window.fetch / XHR patching for x402 |
