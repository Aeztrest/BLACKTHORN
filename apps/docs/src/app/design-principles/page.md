---
title: Design principles & limits
nextjs:
  metadata:
    title: Design principles & limits
    description: The product's load-bearing principles, explicit non-goals, and the known false negatives in v1.
---

BLACKTHORN is built around a small number of opinions. Knowing them helps decide what belongs in the product and what doesn't. The principles are followed by the explicit limits — things the firewall does *not* catch in the current version, and why. {% .lead %}

---

## Principles

### 1. Refuse to sign what you can't explain

Every transaction the wallet signs must produce a verdict the user could read aloud. If the simulation fails, the verdict is "I don't know" and the default is to block. We never silently sign on insufficient information.

### 2. Trust the simulation, not the UI

The popup's "What changes" rows come from the on-chain simulation diff, not from the dApp's marketing copy. A dApp that says "Swap 1 SOL for 100 USDC" but whose simulation shows your USDC ATA flat and an unknown wallet credited — the popup shows the simulation.

### 3. Pre-sign, not post-sign

The firewall lives between the user and the signing key. Once bytes are signed, the damage is done. Every protection is on the sign-time path.

### 4. Stateful authorisations, not blanket approvals

x402 payments use per-merchant Swig sub-keys with per-tx, per-hour, and per-day caps. The user never grants a merchant unlimited spend on the master authority key. Compromise of one merchant's facilitator can drain at most that merchant's cap.

### 5. The user owns the policy

Policies travel inline with each analyze request. The server doesn't store user policies; the client (extension or wallet) does, encrypted. A user can change their policy without telling the operator and the operator never has to ship a per-user database.

### 6. Detectors are pure functions

Every risk detector is a side-effect-free function over the simulation output. They never call RPC themselves, never share state. Adding a detector is one file plus one registration line; removing one breaks nothing else.

### 7. The same code runs everywhere

The policy evaluator in `packages/swig-guard` is the same TypeScript shipped to the server, the extension, the wallet, and the showcase. We never write parallel implementations that drift.

### 8. Fail closed

Default policies block on simulation failure, on missing required data, on unknown errors. "Allow on error" is opt-in via Permissive — never the default.

---

## Non-goals

Things BLACKTHORN deliberately does *not* try to be:

- **A general-purpose Solana wallet** — the extension is a wallet because it has to sign things, but the feature surface is intentionally small. We don't compete with Phantom on swap UX or NFT browsing.
- **A token-screening service** — we flag malicious *transactions*, not malicious *tokens*. A token's reputation matters only insofar as it affects the verdict on a tx that touches it.
- **A bridge / aggregator / DEX** — no in-wallet trading. The wallet shows you what a third-party dApp is asking you to sign and helps you decide.
- **A fully decentralised firewall** — the analyze server is operator-run. Decentralising the simulator is interesting but out of v1 scope.
- **A protection against compromised wallets** — if your private key is exfiltrated, BLACKTHORN can't help you sign. We protect the *signing decision*, not the key itself.

---

## Known false negatives (v1)

Things the firewall does *not* catch in the current release. These are documented openly so users don't get a false sense of security.

### Front-running by the RPC

The simulator and the eventual broadcast both go through Solana RPC. A malicious RPC could simulate the user's tx, swap in its own front-running tx with a higher priority fee, and then forward the user's tx. We assume the configured RPC is trusted; for adversarial environments, run your own validator.

### Slot-skew between simulation and execution

Simulation runs against the current slot; the tx may land 1–2 slots later. For most txs this is invisible (price moves are within the slippage tolerance), but for high-volatility swaps the actual fill may differ from the predicted change by more than the predicted slippage. The popup shows a slippage warning when the simulated price deviates >1% from a recent quote.

### Hidden state in upgradeable programs

When a program is upgradeable (most are), today's simulation reflects today's deployed code. If the program's authority pushes a malicious upgrade between sign and broadcast, the on-chain execution can differ from the simulation. We catch upgradeable-program risk via the reputation database and `RISKY_PROGRAM_INTERACTION`, but we can't predict the future.

### Cross-program reentrancy in non-standard programs

The CPI parser handles ~30 well-known programs natively. Unknown programs are treated as opaque — we can see the inner instruction tree but not its semantic intent. A custom program that reenters and drains via an unusual path may evade the deltas detector if the net SOL/token movement on the user's accounts is zero or balanced.

### Token-2022 extensions beyond TransferHook and PermanentDelegate

The Token-2022 spec defines ~14 extensions. We have detectors for TransferHook (type 14) and PermanentDelegate (type 19); the others (ConfidentialTransfer, InterestBearing, MetadataPointer, etc.) are parsed but not yet weaponised into findings. Some of them have legitimate adversarial use; we'll add detectors as we encounter exploits in the wild.

### Off-chain payment leaks

x402's verify-not-settle attack is detected via the on-chain monitor. But a malicious merchant that *does* settle and *also* sells the user's PII or query payload off-chain is outside the firewall's scope. We don't see what the merchant does with the response.

### Account list truncation > 64 accounts

The simulator's `accounts` echo array is limited to 64. Transactions with more than 64 distinct accounts trigger `LOW_CONFIDENCE_INCOMPLETE_DATA` — the analysis runs but with partial state. Default behaviour is to allow with a warning, not block; users on Strict can elect to block.

### Multi-sig that needs multiple machines

The wallet is single-machine. A multi-sig that requires the user to coordinate signatures from two devices is supported (each device signs its own approval), but the firewall on each device only sees its own context — it can't catch attacks that exploit the gap between approvals on different devices.

---

## Caveats around the simulator itself

The Solana RPC `simulateTransaction` method has its own quirks:

- **Priority fee not simulated** — the simulator runs without ComputeUnitPrice. The actual on-chain cost includes priority fees that simulation doesn't model. We surface CU usage and let the policy enforce a CU price ceiling, but the simulator's "cost" is fees-only.
- **Recent blockhash refresh** — we use `replaceRecentBlockhash: true` so simulation always succeeds even if the tx's blockhash is stale. This means the user's tx might fail to broadcast because the blockhash expired between sign and send. The wallet handles this with a clear error.
- **No mainnet-state on devnet RPC** — obvious but easy to forget. Always send `cluster: 'mainnet-beta'` for mainnet txs; devnet RPC has different account state.

See `LIMITATIONS.md` in the repo for the comprehensive list with code citations.

---

## What's in v2

Roadmap items we've committed to but not shipped:

- **Persistent audit storage** — current ring buffer is in-memory; v2 ships a Postgres adapter
- **Server-side policy templates per API key** — operators can pre-configure policies their users opt into without sending the policy inline
- **Confidential Transfer detector** — Token-2022 extension type 17, parsed but not yet weaponised
- **Mobile extension** — Chrome on Android works today but the popup geometry isn't optimised; v2 ships proper mobile sizing
- **Decentralised reputation database** — replace the hardcoded reputation DB with something on-chain that operators can write to

---

## When to deviate from a principle

Principles are guides, not laws. Three concrete cases where deviating is correct:

1. **A new attack pattern requires a stateful detector** — most detectors are pure, but if you encounter a class that genuinely needs cross-tx context, fine. Document the state explicitly and contain it.
2. **A user-facing feature needs server-side state** — if you need to remember something across requests for a user, build it server-side rather than asking the user to send it in every request. But ask first whether the feature is worth the operational complexity.
3. **A detector needs an RPC call** — the "no side effects" rule has one exception: detectors can call RPC if the call is cacheable and the cache is shared. Don't bolt on per-detector RPC — extend the orchestrator to fetch what every detector needs.

If you find yourself wanting to deviate more than these three cases, the principle might be wrong. File an issue.
