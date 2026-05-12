---
title: How to contribute
nextjs:
  metadata:
    title: How to contribute
    description: Guidelines for filing issues, opening pull requests, and adding new detectors or showcase scenarios.
---

BLACKTHORN is a Colosseum hackathon project that we plan to harden into a production release. Contributions are welcome — particularly new detectors backed by real attack data, additional showcase scenarios, and operator integrations. {% .lead %}

---

## Before you start

1. Read [How BLACKTHORN works](/understanding-caching) — the three-layer model is load-bearing for almost every code change
2. Read [Architecture](/architecture-guide) — understand which workspace owns what before opening a PR
3. Read [Design principles & limits](/design-principles) — the explicit non-goals and known false negatives
4. Run the full local stack ([Installation](/installation)) and exercise the showcase to confirm your environment matches what you'll be modifying

---

## Filing an issue

Open issues at `https://github.com/<your-org>/DeltaProtokol/issues`. Include:

- **For bugs** — repro steps, observed vs expected, environment (OS, browser, server version, RPC endpoint), the request body and response if it involves the analyze endpoint
- **For false negatives** (a malicious tx the firewall said was safe) — the transaction signature on mainnet/devnet, the policy in effect, and ideally a captured fixture
- **For false positives** — same as above; we want to know which detector fired and why it shouldn't have
- **For feature requests** — the user problem first, the proposed solution second; we routinely reject solutions that don't have a stated user

---

## Pull request flow

1. Fork and branch from `main`
2. `pnpm install` at the workspace root
3. Make your changes in the relevant workspace
4. Add tests — every change should land with at least one new test or update an existing one to cover the change
5. Run `pnpm -r test` and `pnpm -r typecheck`
6. Open a PR with a description matching the [PR template](https://github.com/<your-org>/DeltaProtokol/blob/main/.github/PULL_REQUEST_TEMPLATE.md)

PR description should answer: what user problem does this solve, what's the test coverage, what's the migration story (if any).

### Commit messages

Follow Conventional Commits:

```
feat(server): add TOKEN2022_INTEREST_BEARING detector
fix(extension): debounce sign requests during popup re-render
docs(api): document /v1/replay slot retention
```

Scopes: `server`, `extension`, `wallet`, `showcase`, `swig-guard`, `ext-protocol`, `ui`, `docs`.

---

## Adding a new detector

The most common contribution. Steps:

1. Add the new code to `apps/server/src/domain/findings.ts`
2. Create `apps/server/src/risk/detectors/<your-detector>.ts` exporting `(input: RiskDetectionInput) => RiskFinding[]`
3. Register it in `apps/server/src/risk/index.ts`
4. Capture safe + failure fixtures via `pnpm --filter @blackthorn/server fixture:capture`
5. Add tests in `apps/server/test/risk/detectors/<your-detector>.test.ts`
6. Update [Risk detectors](/basics-of-time-travel) docs with the new code, severity, and detector file path
7. Open the PR

If your detector needs a new policy field to gate it, also update `apps/server/src/domain/policy.ts`, `packages/swig-guard/src/types.ts`, and `apps/server/src/policy/engine.ts` — and make sure the new field is documented in [Policy DSL](/introduction-to-string-theory).

---

## Adding a showcase scenario

The showcase doubles as the firewall's regression suite. To add a new attack pattern:

1. Pick an existing `apps/showcase/src/sites/<site>/` to extend, or create a new site directory
2. Implement the safe and malicious transaction builders in `src/blackthorn/transactions.ts`
3. Add the safe + malicious flows to the site's React component, gated by `useScenario()`
4. Add the site to the portal grid in `src/components/Hub.tsx`
5. Document the scenario in `docs/showcase-briefs.md`
6. Add the e2e test under `apps/showcase/e2e/`

---

## Adding a known program (safe or malicious)

Two registries, both static:

- `apps/server/src/data/reputation-db.ts` — the hardcoded malicious + scam database. Add an entry with the program ID (or account), a tag (`drainer`, `phishing`, `scam_token`, `sanctioned`, `exploit`, `suspicious`), and a brief explanation
- Operator deployments use the `RISKY_PROGRAM_IDS` and `KNOWN_SAFE_PROGRAM_IDS` env vars for site-local additions. PRs to the static DB should include evidence (incident report, on-chain trace, public disclosure)

---

## Code style

The repo uses `prettier` and `eslint`; config lives at the root. Pre-commit hook (Husky + lint-staged) runs both on staged files. To run manually:

```shell
pnpm format          # write
pnpm format:check    # check only
pnpm lint            # eslint --max-warnings 0
```

Server code is strict TypeScript with no `any` allowed; React components use functional + hooks only; everything is ESM.

---

## Documentation changes

Docs live at `apps/docs/src/app/`. Each page is Markdoc (`page.md`) with a frontmatter block. Add new pages by:

1. Creating `apps/docs/src/app/<slug>/page.md`
2. Adding a link in `apps/docs/src/lib/navigation.ts`
3. Running `pnpm --filter @blackthorn/docs dev` to preview at `http://localhost:5174/docs`

Markdoc tags available out of the box: `{% callout %}`, `{% quick-links %}`, `{% quick-link %}`. Code fences support a `language` token.

---

## Triage and review

PRs are reviewed by the maintainers. Expect:

- A typecheck + test run on CI before any human review
- A request for additional fixtures if a detector PR ships with thin coverage
- A request for showcase scenarios for any new detector that catches a class we haven't demoed yet
- A discussion if your change overlaps with the [Limits](/design-principles) page — we'd rather extend the limits doc than ship a half-fix that creates a false sense of security

---

## Code of conduct

Be excellent to each other. Disagreements are fine and expected; ad hominem attacks are not. The maintainers have final say on contested calls.
