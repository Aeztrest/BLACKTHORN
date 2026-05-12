---
title: Local development & testing
nextjs:
  metadata:
    title: Local development & testing
    description: How to run the test suites, simulate edge-case transactions, and develop against a local stack.
---

The repo's tests live in three places: server unit/integration tests under `apps/server/test`, package-level tests in `packages/*/test`, and end-to-end scenarios reproduced as live transactions in `apps/showcase`. This page is the quick reference for running them and adding new ones. {% .lead %}

---

## Running the test suite

The server uses Vitest. Run from the workspace root:

```shell
pnpm --filter @blackthorn/server test           # one-shot
pnpm --filter @blackthorn/server test --watch   # watch mode
pnpm --filter @blackthorn/server test:cov       # coverage report
```

Package tests run the same way:

```shell
pnpm --filter @blackthorn/swig-guard test
pnpm --filter @blackthorn/ext-protocol test
```

Run *every* workspace's tests:

```shell
pnpm -r test
```

---

## Test layout

```
apps/server/test/
├── application/
│   └── analyze-transaction.test.ts    # full pipeline integration
├── simulation/
│   ├── tx-decode.test.ts
│   ├── account-keys.test.ts
│   └── solana-simulator.test.ts       # mocked RPC
├── analysis/
│   ├── extract-deltas.test.ts
│   └── instruction-decoder.test.ts
├── risk/
│   ├── detectors/
│   │   ├── simulation.test.ts
│   │   ├── programs.test.ts
│   │   ├── cpi.test.ts
│   │   ├── deltas.test.ts
│   │   ├── reputation.test.ts
│   │   ├── compute.test.ts
│   │   ├── token2022.test.ts
│   │   └── x402.test.ts
│   └── index.test.ts
├── policy/
│   └── engine.test.ts
├── infra/
│   ├── x402.test.ts
│   └── solana-rpc.test.ts
└── api/
    ├── analyze.test.ts
    ├── batch.test.ts
    ├── replay.test.ts
    ├── audit.test.ts
    └── health.test.ts
```

Each detector test file follows the same shape: a fixture-based set of `describe` blocks, one per finding code, each with a "fires" and a "doesn't fire" case.

---

## Fixtures

Transaction fixtures live in `apps/server/test/fixtures/`. They're real `VersionedTransaction` blobs captured from devnet and serialised to base64. Each fixture has a sibling `.json` describing the expected pipeline output (programs, deltas, findings).

To regenerate a fixture from a live tx:

```shell
pnpm --filter @blackthorn/server fixture:capture --signature <sig> --cluster devnet
```

This pulls the tx via RPC, normalises it, writes the base64 + the captured pre/post state to the fixtures directory.

---

## Mocking RPC

`apps/server/test/helpers/mock-connection.ts` provides a `MockConnection` that replays canned RPC responses. Most detector tests use it so they don't depend on devnet uptime:

```ts
import { MockConnection } from '../helpers/mock-connection'
import { describe, it, expect } from 'vitest'

describe('SIMULATION_FAILED', () => {
  it('fires when RPC returns err', async () => {
    const conn = new MockConnection({
      simulate: { value: { err: { InstructionError: [0, 'Custom 6001'] } } }
    })
    const findings = await runPipeline(conn, drainerTx)
    expect(findings.map(f => f.code)).toContain('SIMULATION_FAILED')
  })
})
```

Integration tests in `apps/server/test/integration/` opt into a real connection by setting `BLACKTHORN_TEST_RPC` in the env. Without that var, they skip.

---

## End-to-end via showcase

Because every showcase site has both a safe and a malicious transaction, they double as e2e fixtures. To run a regression check:

1. `pnpm --filter @blackthorn/server dev` — analyze server on :8080
2. `pnpm --filter @blackthorn/showcase dev` — showcase on :5174
3. Load the unpacked extension in Chrome
4. Visit each site, toggle scenario, sign, observe verdict
5. Cross-check against the expected outcomes table in `docs/showcase-briefs.md`

For automated coverage, the repo includes a Playwright suite under `apps/showcase/e2e/` that walks every site in both scenarios using a stubbed-wallet fixture (no real signing) and asserts the analyze response shape:

```shell
pnpm --filter @blackthorn/showcase e2e
```

---

## Adding a detector test

Each detector test file is self-contained. The minimal shape:

```ts
import { describe, it, expect } from 'vitest'
import { runRiskDetection } from '../../../src/risk'
import { loadFixture } from '../helpers/load-fixture'

describe('MY_NEW_FINDING', () => {
  it('fires for the failure fixture', async () => {
    const input = await loadFixture('my-new-finding-failure')
    const findings = runRiskDetection(input)
    expect(findings.map(f => f.code)).toContain('MY_NEW_FINDING')
  })

  it('does not fire for the safe fixture', async () => {
    const input = await loadFixture('my-new-finding-safe')
    const findings = runRiskDetection(input)
    expect(findings.map(f => f.code)).not.toContain('MY_NEW_FINDING')
  })
})
```

Capture both fixtures via `fixture:capture`, drop them in `test/fixtures/`, run the test.

---

## Local dev workflow

The most productive loop while iterating on the server:

```shell
# Terminal 1
pnpm --filter @blackthorn/server dev   # tsx watch + Pino pretty logs

# Terminal 2
pnpm --filter @blackthorn/server test --watch  # vitest watch

# Terminal 3
pnpm --filter @blackthorn/extension dev  # Vite + @crxjs hot reload
```

The Chrome extension hot-reloads when you save a `popup/` or `background/` file, so you can iterate on the UI and the analyzer in parallel without rebuilding manually.

---

## Tools that help

- **Pino pretty logs** — server dev output is piped through `pino-pretty` so structured logs are human-readable
- **Vitest UI** — `pnpm --filter @blackthorn/server test:ui` opens a browser with the test tree + diff view
- **Playwright trace viewer** — for showcase e2e failures, `pnpm --filter @blackthorn/showcase e2e:trace <test-name>` opens the trace
- **Solana Explorer custom RPC** — point Solana Explorer at your local validator (`solana-test-validator`) to inspect simulated transactions during debugging

---

## solana-test-validator

For reproducible tests that depend on specific account state, run a local validator:

```shell
solana-test-validator --reset
solana config set --url localhost
```

The server picks up `DELTAG_RPC_URL=http://localhost:8899`. Test fixtures can then be deterministic — you control the slot, the accounts, and the program deployments.

---

## What's not yet tested

- **Mainnet-only programs** — fixtures are devnet-captured; some detector behaviour around mainnet-specific programs (Jupiter v6 mainnet route, real Marinade) is exercised via mocked RPC only
- **Long-tail Token-2022 extensions** — the test suite covers TransferHook and PermanentDelegate; ConfidentialTransfer and InterestBearing have schemas wired up but no fixtures yet
- **Sustained x402 load** — the x402 detector has unit coverage but no benchmark for sustained payment flow at high QPS

See [Audit logs & replay](/compile-time-caching) for the post-sign tooling that picks up where unit tests leave off.
