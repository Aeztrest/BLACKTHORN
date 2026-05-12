---
title: Policy DSL
nextjs:
  metadata:
    title: Policy DSL
    description: The rules that turn detector findings into a sign/block decision — schema, templates, evaluator semantics.
---

A policy is the contract between the user and BLACKTHORN. It tells the firewall which findings to block, which to warn on, and which to ignore. The DSL is intentionally small: a flat object with named fields, no nesting, no expressions to parse. {% .lead %}

---

## Schema

The full policy type lives in `apps/server/src/domain/policy.ts` and is mirrored client-side in `packages/swig-guard/src/types.ts`. Every field is optional; missing fields fall back to defaults that match the **Balanced** template.

```ts
type GuardPolicy = {
  // Pre-sign rules — apply to every transaction
  maxLossPercent?: number              // 0–100; block if SOL loss > this percent of pre-balance
  blockApprovalChanges?: boolean       // reject new SPL Token approvals
  blockDelegateChanges?: boolean       // reject delegate changes
  blockRiskyPrograms?: boolean         // reject any RISKY_PROGRAM_INTERACTION
  blockUnknownProgramExposure?: boolean // reject programs not on KNOWN_SAFE_PROGRAM_IDS
  requireSuccessfulSimulation?: boolean // default true; block on simulation failure
  allowWarnings?: boolean              // allow medium-severity findings without confirmation
  minPostUsdcBalance?: number          // floor: block if post-tx USDC < this amount

  // x402 rules — only apply to x402 payment transactions
  maxX402PerTx?: number                // per-payment cap (USD equivalent)
  x402HourlyCap?: number               // rolling 1-hour cap per (merchant, asset)
  x402DailyCap?: number                // rolling 24-hour cap
  allowedMints?: string[]              // payment token mint allowlist
  allowedFacilitators?: string[]       // feePayer pubkey allowlist
  requireMemo?: boolean                // demand SPL Memo (replay protection)
  maxComputeUnitPriceMicroLamports?: number  // default 5
  blockAmountAnomalies?: boolean       // flag payments deviating >σ×N from merchant mean
  anomalyStdDev?: number               // multiplier (default 4)
}
```

---

## Built-in templates

Three templates ship in `apps/server/src/policy/profiles.ts`. Users pick one during onboarding; advanced users can override individual fields after.

| Template | Loss cap | Approvals | Unknown programs | x402 hourly | x402 daily |
|---|---|---|---|---|---|
| **Strict** | 25% | block | block | $1 | $5 |
| **Balanced** | 50% | block | allow | $5 | $25 |
| **Permissive** | 90% | allow | allow | $50 | $250 |

Strict suits power users with large balances; Balanced is the default for new users; Permissive is for developers who need to test malicious-shaped transactions without the firewall blocking them.

---

## Evaluator semantics

`apps/server/src/policy/engine.ts` evaluates rules in a fixed order and returns the first blocking reason. There's no scoring, no threshold accumulation — each rule is a yes/no check.

```ts
function evaluate(policy: GuardPolicy, findings: RiskFinding[]): {
  safe: boolean
  reasons: string[]
}
```

### Order of evaluation

1. `requireSuccessfulSimulation` (default true) → block if `SIMULATION_FAILED` present
2. `blockRiskyPrograms` → block if `RISKY_PROGRAM_INTERACTION` present
3. `blockUnknownProgramExposure` → block if `UNKNOWN_PROGRAM_EXPOSURE` present
4. `blockApprovalChanges` → block if `APPROVAL_CHANGE_DETECTED` present
5. `blockDelegateChanges` → block if `DELEGATE_CHANGE_DETECTED` present
6. `maxLossPercent` → compute `(preSOL − postSOL) / preSOL`; block if greater than the cap
7. `minPostUsdcBalance` → block if user's USDC post-balance falls below the floor
8. *(x402 only)* `maxX402PerTx`, hourly cap, daily cap, mint allowlist, facilitator allowlist, memo requirement, CU price ceiling
9. Otherwise → `safe: true` with `reasons: []`

The output `reasons` array always contains short human strings the popup renders verbatim under "Why blocked".

---

## Example policies

### Default user (Balanced)

No explicit policy needed — the server falls back to the Balanced template.

```http
POST /v1/analyze
Content-Type: application/json
Authorization: Bearer <key>

{
  "cluster": "devnet",
  "transactionBase64": "AQAAA...",
  "userWallet": "5xG...abc"
}
```

### Power user (Strict + custom floor)

```json
{
  "cluster": "devnet",
  "transactionBase64": "AQAAA...",
  "userWallet": "5xG...abc",
  "policy": {
    "maxLossPercent": 25,
    "blockApprovalChanges": true,
    "blockDelegateChanges": true,
    "blockRiskyPrograms": true,
    "blockUnknownProgramExposure": true,
    "minPostUsdcBalance": 50.0,
    "requireSuccessfulSimulation": true
  }
}
```

### x402 micropayment user

```json
{
  "cluster": "devnet",
  "transactionBase64": "AQAAA...",
  "userWallet": "5xG...abc",
  "policy": {
    "maxX402PerTx": 0.05,
    "x402HourlyCap": 1.00,
    "x402DailyCap": 5.00,
    "allowedMints": [
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    ],
    "requireMemo": true,
    "maxComputeUnitPriceMicroLamports": 5
  }
}
```

### Developer testing malicious flows

```json
{
  "cluster": "devnet",
  "transactionBase64": "AQAAA...",
  "policy": {
    "maxLossPercent": 99,
    "blockApprovalChanges": false,
    "blockRiskyPrograms": false,
    "requireSuccessfulSimulation": false,
    "allowWarnings": true
  }
}
```

---

## Server-side vs client-side

The same DSL is enforced in two places:

- **Server** (`apps/server/src/policy/engine.ts`) — runs on every analyze call, returns the canonical verdict in the response. This is the source of truth.
- **Client** (`packages/swig-guard/src/evaluator.ts`) — runs in the extension and the web wallet, lets the wallet enforce the policy even if the server is unreachable or the user wants to override the response. The evaluator is identical TypeScript code shared via the workspace.

If the two ever disagree (a server upgrade adds a new rule the client doesn't know), the client falls back to the server's verdict. The client's job is to *not be more permissive* than the server, never the other way around.

---

## Why a flat schema?

Earlier iterations had a nested rule DSL with conditions, operators, and templates. That version was richer but produced footguns: users could write rules that contradicted each other, and the order of evaluation depended on parser internals. The flat schema sacrifices expressiveness for predictability — every field has a documented effect, evaluation order is fixed, and there's no way to accidentally write a rule that's always-true or always-false.

If you need conditional logic ("block approvals on mainnet but allow on devnet"), set the policy per-network in the wallet rather than encoding the condition in the DSL.

{% callout title="Policies are user-owned" %}
The wallet sends the policy with every analyze request. The server doesn't store user policies — they live in extension storage (encrypted) and travel inline. This means a user can change their policy without the server knowing, and operators don't have to ship a per-user database.
{% /callout %}

---

## Related reading

- [How BLACKTHORN works](/understanding-caching) — the request lifecycle that policy lives inside
- [Risk detectors](/basics-of-time-travel) — the codes the policy references
- [Writing custom policies](/writing-plugins) — recipes and patterns
- [x402 payment defense](/the-butterfly-effect) — the x402-specific rules in context
