import type { AnalysisResult, ScenarioId } from "./types";

export const SCENARIOS: Record<ScenarioId, AnalysisResult> = {
  "solswap-safe": {
    safe: true,
    riskLevel: "NONE",
    summary: "Transaction verified — standard Jupiter swap",
    reasons: ["Program verified: Jupiter Aggregator V6", "Token accounts match expected owners"],
    riskFindings: [],
    estimatedChanges: [
      { asset: "SOL", delta: "-0.5", direction: "out", usdValue: "-$87.50" },
      { asset: "USDC", delta: "+87.23", direction: "in", usdValue: "+$87.23" },
    ],
    simulationWarnings: [],
    demoMode: true,
  },
  "solswap-danger": {
    safe: false,
    riskLevel: "CRITICAL",
    summary: "Fund drain detected — transaction will empty your wallet",
    reasons: [
      "All SOL transferred to unknown address",
      "Destination not a recognized program or DEX",
      "No swap output detected in simulation",
    ],
    riskFindings: [
      {
        id: "fund_drain",
        label: "Fund Drain",
        detail: "100% of wallet SOL transferred to 7xKp...mN3q — not a DEX program",
        severity: "CRITICAL",
      },
      {
        id: "unknown_program",
        label: "Unknown Program",
        detail: "Program D4rk...1337 has no verified source or audit history",
        severity: "HIGH",
      },
    ],
    estimatedChanges: [
      { asset: "SOL", delta: "-12.45", direction: "out", usdValue: "-$2,178.75" },
    ],
    simulationWarnings: ["Simulation: destination account has no SOL return instructions"],
    demoMode: true,
  },

  "pixeldrop-safe": {
    safe: true,
    riskLevel: "NONE",
    summary: "Standard NFT mint — Candy Machine v3 verified",
    reasons: [
      "Candy Machine v3 program verified",
      "NFT metadata URI matches collection",
      "Mint price matches advertised 0.1 SOL",
    ],
    riskFindings: [],
    estimatedChanges: [
      { asset: "SOL", delta: "-0.1", direction: "out", usdValue: "-$17.50" },
      { asset: "NFT #4821", delta: "+1", direction: "in" },
    ],
    simulationWarnings: [],
    demoMode: true,
  },
  "pixeldrop-danger": {
    safe: false,
    riskLevel: "CRITICAL",
    summary: "Wallet drainer — this is not an NFT mint",
    reasons: [
      "SetAuthority instruction transfers token ownership",
      "No NFT minted — only assets drained",
      "Pattern matches known wallet drainer contracts",
    ],
    riskFindings: [
      {
        id: "wallet_drainer",
        label: "Wallet Drainer",
        detail: "SetAuthority instruction transfers all token authority to attacker's address",
        severity: "CRITICAL",
      },
      {
        id: "token_approval",
        label: "Unauthorized Token Approval",
        detail: "Delegation of USDC token account with unlimited amount",
        severity: "CRITICAL",
      },
      {
        id: "no_mint",
        label: "No NFT Created",
        detail: "Simulation shows no NFT mint — only asset transfers out",
        severity: "HIGH",
      },
    ],
    estimatedChanges: [
      { asset: "SOL", delta: "-4.2", direction: "out", usdValue: "-$735.00" },
      { asset: "USDC", delta: "-1,200", direction: "out", usdValue: "-$1,200.00" },
    ],
    simulationWarnings: ["SetAuthority on token accounts detected", "Unlimited delegation scope"],
    demoMode: true,
  },

  "solyield-safe": {
    safe: true,
    riskLevel: "LOW",
    summary: "Safe staking transaction — Marinade Finance",
    reasons: [
      "Marinade Finance program verified (audited)",
      "Stake delegation to top-20 validator",
      "mSOL receipt will be credited to your wallet",
    ],
    riskFindings: [
      {
        id: "cpi_depth",
        label: "CPI Depth: 3",
        detail: "Transaction uses 3 cross-program invocations — within normal range for liquid staking",
        severity: "LOW",
      },
    ],
    estimatedChanges: [
      { asset: "SOL", delta: "-10", direction: "out", usdValue: "-$1,750.00" },
      { asset: "mSOL", delta: "+9.94", direction: "in", usdValue: "+$1,742.50" },
    ],
    simulationWarnings: [],
    demoMode: true,
  },
  "solyield-warn": {
    safe: false,
    riskLevel: "HIGH",
    summary: "Suspicious staking contract — unverified program",
    reasons: [
      "Staking program has no verified source",
      "Validator has 0% uptime history",
      "No unstake mechanism found in program",
    ],
    riskFindings: [
      {
        id: "unverified_program",
        label: "Unverified Staking Program",
        detail: "Program F4k3...S7ak has no audit, no source code, deployed 2 days ago",
        severity: "HIGH",
      },
      {
        id: "no_unstake",
        label: "No Unstake Function",
        detail: "Program bytecode contains no withdraw or unstake instruction path",
        severity: "HIGH",
      },
    ],
    estimatedChanges: [
      { asset: "SOL", delta: "-10", direction: "out", usdValue: "-$1,750.00" },
    ],
    simulationWarnings: ["No return path for staked SOL detected"],
    demoMode: true,
  },

  "claimhub-safe": {
    safe: true,
    riskLevel: "NONE",
    summary: "Legitimate airdrop claim — Merkle proof verified",
    reasons: [
      "Merkle proof verified on-chain",
      "Distributor program audited by OtterSec",
      "Claim amount matches allocation",
    ],
    riskFindings: [],
    estimatedChanges: [
      { asset: "TOKEN", delta: "+2,500", direction: "in", usdValue: "+$250.00" },
    ],
    simulationWarnings: [],
    demoMode: true,
  },
  "claimhub-danger": {
    safe: false,
    riskLevel: "CRITICAL",
    summary: "Phishing — this claim steals your tokens",
    reasons: [
      "Approve instruction grants unlimited token spend",
      "Beneficiary is attacker, not the token distributor",
      "No tokens will be received by your wallet",
    ],
    riskFindings: [
      {
        id: "phishing",
        label: "Phishing Pattern",
        detail: "Site impersonates official airdrop. Contract address differs from official distribution.",
        severity: "CRITICAL",
      },
      {
        id: "unlimited_approval",
        label: "Unlimited Token Approval",
        detail: "Approve instruction for MAX_UINT64 amount — gives attacker full control of your tokens",
        severity: "CRITICAL",
      },
      {
        id: "no_claim",
        label: "No Airdrop Received",
        detail: "Simulation shows zero tokens sent to your wallet",
        severity: "HIGH",
      },
    ],
    estimatedChanges: [
      { asset: "USDC", delta: "-3,400", direction: "out", usdValue: "-$3,400.00" },
      { asset: "SOL", delta: "-0.05", direction: "out", usdValue: "-$8.75" },
    ],
    simulationWarnings: ["Unlimited delegate approval detected", "Beneficiary mismatch"],
    demoMode: true,
  },

  "launchpad-safe": {
    safe: true,
    riskLevel: "LOW",
    summary: "Verified token sale — liquidity locked 1 year",
    reasons: [
      "Launchpad contract audited by Sec3",
      "Liquidity locked for 365 days",
      "Mint authority renounced post-launch",
    ],
    riskFindings: [
      {
        id: "new_token",
        label: "New Token",
        detail: "Token created 3 days ago — standard for a launch event",
        severity: "LOW",
      },
    ],
    estimatedChanges: [
      { asset: "USDC", delta: "-500", direction: "out", usdValue: "-$500.00" },
      { asset: "LAUNCH", delta: "+50,000", direction: "in" },
    ],
    simulationWarnings: [],
    demoMode: true,
  },
  "launchpad-danger": {
    safe: false,
    riskLevel: "HIGH",
    summary: "Rug pull indicators — do not invest",
    reasons: [
      "Mint authority retained by deployer",
      "Liquidity can be withdrawn immediately",
      "90% token supply held by single wallet",
    ],
    riskFindings: [
      {
        id: "mint_authority",
        label: "Mint Authority Retained",
        detail: "Team wallet retains ability to mint unlimited tokens, destroying your position",
        severity: "HIGH",
      },
      {
        id: "no_liquidity_lock",
        label: "No Liquidity Lock",
        detail: "Pool liquidity has no time lock — can be withdrawn in same block as launch",
        severity: "HIGH",
      },
      {
        id: "supply_concentration",
        label: "Supply Concentration",
        detail: "87% of token supply held in 1 wallet with no vesting schedule",
        severity: "HIGH",
      },
    ],
    estimatedChanges: [
      { asset: "USDC", delta: "-500", direction: "out", usdValue: "-$500.00" },
      { asset: "SCAM", delta: "+100,000", direction: "in" },
    ],
    simulationWarnings: ["Mint authority active", "No LP lock contract found"],
    demoMode: true,
  },
};
