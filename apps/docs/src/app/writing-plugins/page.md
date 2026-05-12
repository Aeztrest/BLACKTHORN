---
title: Writing custom policies
nextjs:
  metadata:
    title: Writing custom policies
    description: Recipes and patterns for tuning the policy DSL to specific user profiles and risk tolerances.
---

The three built-in templates (Strict, Balanced, Permissive) cover the common cases. This page is for everything else — the recipes you reach for when you have a concrete user profile and need a policy that matches it. {% .lead %}

---

## Recipe: high-net-worth user

User holds significant SOL and tokens; values false-positive blocks over false-negative signs. Want every meaningful change to surface, x402 capped tightly.

```json
{
  "maxLossPercent": 10,
  "blockApprovalChanges": true,
  "blockDelegateChanges": true,
  "blockRiskyPrograms": true,
  "blockUnknownProgramExposure": true,
  "requireSuccessfulSimulation": true,
  "minPostUsdcBalance": 100,
  "x402HourlyCap": 0.10,
  "x402DailyCap": 0.50,
  "requireMemo": true,
  "maxComputeUnitPriceMicroLamports": 3
}
```

This blocks anything that loses more than 10% of SOL, every approval, every delegate change, any program not on the safe-list, and caps x402 spend at 50¢/day. The CU price ceiling stops priority-fee drains.

---

## Recipe: API agent operator

Server-side agent calling x402-paywalled APIs. Doesn't sign DeFi transactions at all; only signs micropayments. Wants the strictest possible x402 rules and the loosest pre-sign rules (because no DeFi).

```json
{
  "maxLossPercent": 100,
  "blockApprovalChanges": false,
  "blockRiskyPrograms": false,
  "x402HourlyCap": 5.00,
  "x402DailyCap": 50.00,
  "maxX402PerTx": 0.05,
  "allowedMints": [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  ],
  "allowedFacilitators": [
    "<facilitator-pubkey-1>",
    "<facilitator-pubkey-2>"
  ],
  "requireMemo": true,
  "blockAmountAnomalies": true,
  "anomalyStdDev": 3
}
```

Tight per-tx cap, USDC-only, allowlist of trusted facilitators, anomaly detection at 3σ to catch silent price bumps.

---

## Recipe: NFT collector

Mints frequently; expects approvals to NFT marketplaces; wants delegate changes blocked because they're rarely legitimate for collectors.

```json
{
  "maxLossPercent": 30,
  "blockApprovalChanges": false,
  "blockDelegateChanges": true,
  "blockRiskyPrograms": true,
  "blockUnknownProgramExposure": false,
  "requireSuccessfulSimulation": true
}
```

Approvals are allowed (Magic Eden, Tensor need them); delegate changes are blocked (those are usually drainer signatures); risky programs blocked; unknown programs allowed (new mint contracts come and go).

---

## Recipe: developer testing on devnet

Building a Solana program; needs to send transactions that touch unknown programs (their own work-in-progress) and intentionally reproduce malicious shapes for testing. Wants the firewall to *report* findings without blocking.

```json
{
  "maxLossPercent": 99,
  "blockApprovalChanges": false,
  "blockDelegateChanges": false,
  "blockRiskyPrograms": false,
  "blockUnknownProgramExposure": false,
  "requireSuccessfulSimulation": false,
  "allowWarnings": true
}
```

Effectively bypasses the policy. The findings are still computed and surfaced in the popup so you can verify your detector logic, but nothing is blocked.

---

## Recipe: institutional treasury

Multi-sig treasury where every signature is reviewed by a human signer. Want the firewall to be the second pair of eyes — block anything anomalous, never allow a soft-fail.

```json
{
  "maxLossPercent": 5,
  "blockApprovalChanges": true,
  "blockDelegateChanges": true,
  "blockRiskyPrograms": true,
  "blockUnknownProgramExposure": true,
  "requireSuccessfulSimulation": true,
  "minPostUsdcBalance": 10000,
  "allowWarnings": false
}
```

5% loss cap, full block-list, $10k USDC floor, and `allowWarnings: false` ensures medium-severity findings still require explicit confirmation rather than passing silently.

---

## Composition pattern: per-network policies

The DSL doesn't have conditionals, but the wallet can pick a different policy object per network. The extension's settings UI exposes one policy slot per (mainnet, devnet, testnet); the active policy is sent with every analyze request.

A common pattern:
- **mainnet** — Strict template (real money)
- **devnet** — Permissive template (developer playground)
- **testnet** — Balanced template (staging)

---

## Composition pattern: per-merchant overrides

The Allowances tab lets the user override `maxX402PerTx`, `x402HourlyCap`, and `x402DailyCap` per merchant. The override is stored in the ledger and applied only to that merchant's payment requests; everything else falls back to the global policy.

This is how you support "ChatGPT-tier APIs" (high cap) and "experimental APIs" (tight cap) without rewriting the policy every time you discover a new merchant.

---

## Anti-patterns

### Setting `maxLossPercent` above 90

A 90% loss cap blocks almost no real-world drainer (most extract everything). Numbers above 90 are equivalent to disabling the rule entirely. If you want to disable it, set it to 100; if you want it active, keep it under 70.

### Empty `allowedMints` with x402 enabled

`allowedMints: []` blocks every x402 payment because no mint matches. To allow any mint, omit the field; to allow specific mints, list them.

### `blockUnknownProgramExposure: true` without populating `KNOWN_SAFE_PROGRAM_IDS`

The safe-list is empty by default. Turning on the rule without populating it blocks every transaction that touches anything other than System and SPL Token. Populate the env var first or leave the rule off.

### Mixing client and server policy

If both the client (extension) and the server (operator) have policies, the server's policy wins on the verdict. The client's policy is for additional client-only rules (e.g. UI-level confirmations) — don't try to use it to *loosen* the server's verdict, because the server has the final say on whether the API succeeds.

---

## Programmatic policy management

Policies are plain JSON. To manage them programmatically (e.g. push policy changes to a fleet of agents), serialise the GuardPolicy object and send it inline with each analyze call. There is no `/v1/policies` endpoint to update — policies live with the client, not the server.

For agents that need a single source of truth, fetch the policy from your own configuration store at startup and pass it through the analyze body on every call.

---

## Validating policies

The Zod schema in `apps/server/src/domain/policy.ts` validates incoming policies and rejects malformed input with a 400. To validate a policy locally before sending:

```ts
import { GuardPolicySchema } from '@blackthorn/swig-guard'

const result = GuardPolicySchema.safeParse(myPolicy)
if (!result.success) {
  console.error(result.error.issues)
}
```

The schema is shared between server and client via the `@blackthorn/swig-guard` package, so a policy that parses on the client always parses on the server.

---

## Related reading

- [Policy DSL](/introduction-to-string-theory) — full schema reference and evaluator semantics
- [Risk detectors](/basics-of-time-travel) — the codes the policy references
- [POST /v1/analyze](/cacheadvance-predict) — how to send a policy to the server
