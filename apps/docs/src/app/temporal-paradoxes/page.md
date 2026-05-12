---
title: Showcase apps
nextjs:
  metadata:
    title: Showcase apps
    description: The six demo dApps that demonstrate real attack patterns BLACKTHORN catches.
---

`apps/showcase` is a portal of six fake-but-plausible Solana dApps. Each one ships a benign-looking transaction shape and a malicious counterpart, toggleable in the header. Used for hands-on demos, regression testing, and letting new users feel the protection before trusting it with real funds. {% .lead %}

---

## The portal

`http://localhost:5174` opens the portal landing page (`src/components/Hub.tsx`): a hero, a grid of six product cards (each summarising the attack scenario in user-facing language), and a three-step "How it works" sequence (install BLACKTHORN → visit a site → wallet intervenes).

The portal is intentionally not BLACKTHORN-branded. It looks like an aggregator of real dApps, so the protection demonstration feels organic — the user sees that BLACKTHORN works against arbitrary unmodified dApps, not against pre-cooperated demo content.

---

## The six demos

### 1. SolSwap — DEX aggregator

**Route:** `/solswap` &nbsp;·&nbsp; **Source:** `src/sites/solswap/`

A Jupiter-style swap UI. Pick an input token, pick an output token, click Swap.

- **Safe scenario:** standard Jupiter v6 route. Quotes accurate, simulation matches UI.
- **Malicious scenario:** the route is silently swapped to a custom program that takes the input but sends the output to the attacker's wallet. The UI still shows the user receiving the output. Simulation reveals the truth: input gone, attacker wallet credited, user's output ATA unchanged.

**Detector hits:** `RISKY_PROGRAM_INTERACTION`, large negative `EstimatedChange` for input mint, no positive change for output mint, often `maxLossPercent` block.

### 2. PixelDrop — NFT mint

**Route:** `/pixeldrop` &nbsp;·&nbsp; **Source:** `src/sites/pixeldrop/`

A pixel-art NFT mint page.

- **Safe scenario:** Metaplex Candy Machine v3 mint. Pays the listed mint price; receives the NFT.
- **Malicious scenario:** the "mint" tx contains a hidden `Approve` instruction granting unlimited spend on the user's USDC account to the attacker's pubkey. The NFT is still minted; the approval is what matters.

**Detector hits:** `APPROVAL_CHANGE_DETECTED` (high), often combined with `UNKNOWN_PROGRAM_EXPOSURE`.

### 3. SolYield — liquid staking

**Route:** `/solyield` &nbsp;·&nbsp; **Source:** `src/sites/solyield/`

A Marinade/Lido-clone staking interface.

- **Safe scenario:** legitimate stake — receive mSOL/jitoSOL/etc. in return.
- **Malicious scenario:** "Saturn Pool" alternative. SOL goes in, no liquid staking token comes back. One-way drain disguised as a stake.

**Detector hits:** large negative SOL delta, no compensating positive token delta, often a `RISKY_PROGRAM_INTERACTION` against the fake pool program.

### 4. ClaimHub — airdrop claim

**Route:** `/claimhub` &nbsp;·&nbsp; **Source:** `src/sites/claimhub/`

An airdrop checker. Enter your wallet, see if you're eligible, claim.

- **Safe scenario:** clean Merkle-proof claim, receive the airdropped token.
- **Malicious scenario:** the claim tx also includes an `Approve` for unlimited USDC spend. The user gets a small airdrop and doesn't notice the approval rider.

**Detector hits:** `APPROVAL_CHANGE_DETECTED`, often paired with `DELEGATE_CHANGE_DETECTED` if the attacker also rotates an existing delegate.

### 5. LaunchPad — token launchpad

**Route:** `/launchpad` &nbsp;·&nbsp; **Source:** `src/sites/launchpad/`

A pump.fun-style token discovery and purchase page.

- **Safe scenario:** buy into a token whose mint authority is revoked and whose LP is locked.
- **Malicious scenario:** ScamCoin — mint authority is *not* revoked, LP is *not* locked. The dev can mint infinite tokens or pull liquidity at any time. The buy itself succeeds, but the user is now holding a rug-able asset.

**Detector hits:** the showcase ships an extension to the simulator that decodes mint metadata; produces a custom finding when mint authority is non-null. The bare server only flags this if the rug actually happens during simulation.

### 6. Scrybe — x402 AI console

**Route:** `/scrybe` &nbsp;·&nbsp; **Source:** `src/sites/scrybe/`

An AI-agent console paywalled with x402 micropayments. Each query costs USDC.

This is the most complex demo — three attack layers:

- **Silent drift:** the merchant gradually increases the price per query. Without `blockAmountAnomalies`, this is invisible. With it, BLACKTHORN flags the deviation.
- **Mint swap:** the merchant requests payment in a USDC look-alike (same symbol, different mint). `X402_MINT_MISMATCH` and `X402_NON_CANONICAL_MINT` fire.
- **Verify-not-settle:** the merchant validates the payment to satisfy the protocol but never broadcasts it to the chain. The monitor's 60-second deadline fires `x402.verify_not_settle`.

**Detector hits:** the full x402 detector suite plus the monitor.

---

## Toggling scenarios

Every showcase site has a header dropdown labelled **Scenario: Safe / Malicious**. Selecting a scenario only changes how the next transaction is constructed; the UI is identical between modes. This is the point: from the user's perspective, both transactions look the same; only BLACKTHORN's simulation reveals the difference.

The transaction builders live at `src/blackthorn/transactions.ts` and expose a uniform API:

```ts
type ShowcaseTxBuilder = (
  context: { connection: Connection, owner: PublicKey, scenario: 'safe' | 'malicious' }
) => Promise<VersionedTransaction>
```

---

## Wallet discovery

The showcase doesn't bundle BLACKTHORN. It uses `@wallet-standard/app` to discover whatever wallets the browser has registered:

```ts
import { getWallets } from '@wallet-standard/app'

const { get } = getWallets()
const all = get()
const blackthorn = all.find(w => w.name === 'BLACKTHORN')
```

If BLACKTHORN isn't installed, the showcase falls back to whatever wallet is available (Phantom, Backpack, etc.) — useful for demonstrating that competing wallets *don't* catch the attacks. A "BLACKTHORN not detected" banner appears with an install link.

---

## Result overlay

After each sign attempt, the showcase renders `src/blackthorn/ResultOverlay.tsx`: a modal that shows whether the wallet allowed or blocked the tx, the findings list, and a "Try the other scenario" button. This is the closing beat of every demo — the user sees the contrast between the two flows in seconds.

---

## Running locally

```shell
pnpm --filter @blackthorn/showcase dev
```

The dev server listens on `http://localhost:5174`. Each route is lazy-loaded via React.lazy + Suspense, so the initial bundle is small and the per-site code only loads when visited.

---

## Source map

| Path | Purpose |
|---|---|
| `src/App.tsx` | Root router with lazy routes |
| `src/components/Hub.tsx` | Portal landing page |
| `src/components/ScenarioToggle.tsx` | Safe / Malicious switch |
| `src/sites/solswap/SolSwap.tsx` | DEX aggregator demo |
| `src/sites/pixeldrop/PixelDrop.tsx` | NFT mint demo |
| `src/sites/solyield/SolYield.tsx` | Liquid staking demo |
| `src/sites/claimhub/ClaimHub.tsx` | Airdrop demo |
| `src/sites/launchpad/LaunchPad.tsx` | Token launchpad demo |
| `src/sites/scrybe/Scrybe.tsx` | x402 AI console demo |
| `src/wallet/context.tsx` | WalletProvider (bridges to installed wallets) |
| `src/wallet/standard-bridge.ts` | Wallet Standard discovery |
| `src/blackthorn/transactions.ts` | Per-site safe + malicious tx builders |
| `src/blackthorn/ResultOverlay.tsx` | Post-sign verdict modal |

The showcase doubles as the firewall's regression test surface — every attack scenario in the repo is reproduced as a live, signable transaction here.
