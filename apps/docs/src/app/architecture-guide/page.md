---
title: Architecture
nextjs:
  metadata:
    title: Architecture
    description: The monorepo layout, the data flow between processes, and the rules for which workspace owns what.
---

A high-level map of the codebase, intended for new contributors who need to find their way around before opening a PR. Pairs with [How BLACKTHORN works](/understanding-caching) (which is the user-facing version) and the in-repo `ARCHITECTURE.md` (which is the system-level reference). {% .lead %}

---

## Monorepo layout

```
DeltaProtokol/
├── apps/
│   ├── server/          # Fastify analyze API + x402 paywall
│   ├── extension/       # Chrome MV3 + Firefox browser extension
│   ├── wallet/          # Web-hosted Swig wallet (extension fallback)
│   ├── showcase/        # Six demo dApps
│   └── docs/            # This documentation site (Next.js + Tailwind Syntax)
├── packages/
│   ├── swig-guard/      # Shared policy DSL + evaluator
│   ├── ext-protocol/    # Message types between extension layers
│   ├── ui/              # Tailwind tokens + Lucide icon presets
│   ├── showcase-ui/     # NavBar, Footer, modals (showcase-only)
│   └── mcp-bridge/      # stdio↔HTTP shim for MCP clients
├── docs/                # Repo-level markdown specs (vision, x402, etc.)
├── ARCHITECTURE.md      # Top-level system reference (Turkish)
├── LIMITATIONS.md       # Known false negatives + simulator caveats
├── README.md            # Product positioning
└── pnpm-workspace.yaml
```

---

## The four runtime processes

A full local install runs four independent Node/browser processes:

1. **Analyze server** (`apps/server`) — Fastify on port 8080. Stateless except for the in-memory audit ring buffer. Talks to Solana RPC and (optionally) the x402 facilitator.
2. **Browser extension service worker** (`apps/extension`) — Chrome's background service worker (or Firefox's MV3 equivalent). Holds the encrypted keystore, the IndexedDB ledger, and the WebSocket monitor.
3. **Web wallet** (`apps/wallet`) — Vite dev server on port 5180, served as a static SPA in production. Stateless across sessions (localStorage only).
4. **Showcase** (`apps/showcase`) — Vite dev server on port 5174 in dev. Static SPA in production. No backend.

A fifth process — the docs site (`apps/docs`) — runs on `5174/docs` for development and is purely static. It doesn't participate in the runtime data flow.

---

## Data flow: a single sign

```
┌────────────────────────────────────────────────────────────┐
│ Browser tab (showcase or any dApp)                         │
│                                                            │
│  React app  ──► wallet.signTransaction(tx)                 │
│      │                                                     │
│      ▼  postMessage                                        │
│  Inpage script (registered Wallet Standard wallet)         │
│      │                                                     │
│      ▼  postMessage (cross-origin via window.postMessage)  │
│  Content script                                            │
│      │                                                     │
│      ▼  chrome.runtime.sendMessage                         │
└──────┼─────────────────────────────────────────────────────┘
       │
       ▼
┌──────┴─────────────────────────────────────────────────────┐
│ Extension service worker                                   │
│                                                            │
│  state machine: ready → signing                            │
│      │                                                     │
│      ▼  fetch                                              │
│   ┌─────────────────────────────────────┐                  │
│   │ POST http://localhost:8080/v1/analyze │  ◄──── 12s     │
│   └─────────────────────────────────────┘                  │
│      │                                                     │
│      ▼                                                     │
│  popup.render(SignRequest)                                 │
│      │                                                     │
│      ▼  user clicks Sign                                   │
│  ed25519 sign with authority or sub-key                    │
│      │                                                     │
│      ▼  Connection.sendTransaction                         │
└──────┼─────────────────────────────────────────────────────┘
       │
       ▼
┌──────┴─────────────────────────────────────────────────────┐
│ Solana RPC (Helius / public devnet / self-hosted)          │
│  - simulateTransaction (called by analyze server)          │
│  - sendTransaction (called by extension)                   │
│  - WebSocket subs (called by extension's monitor)          │
└────────────────────────────────────────────────────────────┘
```

---

## Workspace ownership rules

Each piece of functionality has a single home. If you find yourself implementing the same logic in two places, one of them is wrong.

| Concern | Owner | Why |
|---|---|---|
| Transaction simulation | `apps/server/src/simulation/` | Needs Solana RPC; runs hot per-sign |
| Risk detectors (server-canonical) | `apps/server/src/risk/detectors/` | Pure functions over simulation output |
| Policy evaluator | `apps/server/src/policy/engine.ts` (canonical) + `packages/swig-guard` (mirror) | Server is source of truth; client mirror enables offline overrides |
| Policy *type schema* | `packages/swig-guard` | Shared between server and clients via Zod |
| Allowance ledger | `apps/extension/src/background/db/ledger.ts` | IndexedDB; persists across browser restarts |
| Drift monitor | `apps/extension/src/background/x402/handlers.ts` | Needs persistent WebSocket; lives in service worker |
| Sub-key custody | `apps/extension/src/background/wallet-standard/` | Swig-specific; client-side cryptographic material |
| Audit ring buffer | `apps/server/src/data/audit-store.ts` | Aggregates across all clients hitting this server |
| Showcase tx builders | `apps/showcase/src/blackthorn/transactions.ts` | Per-site safe + malicious shapes |
| Documentation | `apps/docs/src/app/` (this site) + `docs/*.md` (specs in repo) | User docs vs internal specs |

---

## Shared packages

### `@blackthorn/swig-guard`

The policy DSL lives here. Both the server and the extension import the same Zod schema and evaluator. If the server's schema changes, the package version bumps; clients update at their own cadence (the evaluator is forward-compatible — unknown rules are ignored, so old clients still work against new servers).

### `@blackthorn/ext-protocol`

TypeScript message types for inpage ↔ content ↔ background. Pure types, no runtime. Shared between extension and web wallet so the two speak the same protocol.

### `@blackthorn/ui`

Tailwind config preset and a Lucide icon re-export. Imported by every UI workspace. The brand tokens (BLACKTHORN colours, fonts) live here.

### `@blackthorn/showcase-ui`

NavBar, Footer, and modal primitives shared across the six showcase sites. Intentionally *not* BLACKTHORN-branded — the showcase is meant to look like an aggregator of unrelated dApps.

### `@blackthorn/mcp-bridge`

stdio↔HTTP shim for MCP desktop clients. See [MCP integration](/predictive-data-generation).

---

## Why a monorepo?

The four apps share a lot of types: `AnalyzeRequest`, `AnalyzeResponse`, `GuardPolicy`, `EstimatedChange`, `RiskFinding`. Without a monorepo, every app would have its own copy that drifts.

The monorepo lets us:

- Share the policy schema between server and client (one source of truth)
- Run a single `pnpm install` for the whole stack
- Make a single PR that updates the server, the extension, and the docs together
- Ship breaking changes coherently — the server can never be "ahead" of a client because they release together

The tradeoff is that the repo is large; cloning is slow and CI fans out across multiple test suites. We accept that.

---

## Build pipeline

| Workspace | Tool | Output |
|---|---|---|
| `apps/server` | `tsc` for type-check, `tsx` in dev, `tsc` build for prod | `apps/server/dist/` |
| `apps/extension` | Vite + `@crxjs/vite-plugin` (Chrome) + Vite Firefox config | `apps/extension/dist/`, `apps/extension/dist-firefox/` |
| `apps/wallet` | Vite | `apps/wallet/dist/` |
| `apps/showcase` | Vite + lazy routes | `apps/showcase/dist/` |
| `apps/docs` | Next.js + Markdoc | `apps/docs/.next/` |
| Packages | `tsc` (with `bundler` moduleResolution) | `packages/*/dist/` |

CI builds every workspace in parallel and runs each workspace's test suite. A green build means: types check, all unit tests pass, no lint warnings, builds succeed for all four apps.

---

## Configuration

### Server env (Zod-validated at startup)

See [Installation → Required environment variables](/installation#required-environment-variables) for the full list.

### Extension config

The extension hard-codes `DEFAULT_BASE_URL = 'http://localhost:8080'` for development. Production builds rewrite this via Vite's `define` to point at the deployed analyze server. The user can override via the **Settings** tab.

### Wallet + showcase config

Same `BASE_URL` story. Both apps read `import.meta.env.VITE_BLACKTHORN_BASE_URL` if set; otherwise fall back to localhost.

---

## Where Solana web3.js lives

`@solana/web3.js@^1.98` is a workspace-level dep; every app imports the same major. The `Connection` instance is constructed differently per app:

- **Server** — pooled Connection in `apps/server/src/infra/solana-rpc.ts` with timeout/retry
- **Extension** — single Connection per cluster in the service worker; recreated on cluster switch
- **Wallet** — same as extension but in a React context
- **Showcase** — single Connection in the WalletProvider; provided to every site via context

There is no single "client SDK" wrapping these — the apps work directly against `@solana/web3.js` because the surface area is small enough not to warrant abstraction.

---

## Related reading

- `ARCHITECTURE.md` in the repo root — the comprehensive (Turkish) system reference
- `LIMITATIONS.md` in the repo root — explicit non-goals and known caveats
- [Design principles & limits](/design-principles) — the user-facing version of the same content
- [Browser extension](/neuralink-integration) — extension internals in depth
