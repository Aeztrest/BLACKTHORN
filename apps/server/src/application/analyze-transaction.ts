import { PublicKey } from "@solana/web3.js";
import type { AppConfig, Cluster } from "../config/index.js";
import type { AnalyzeRequestBody } from "../domain/policy.js";
import type { Decision } from "../domain/decision.js";
import { SolanaRpcAdapter, SolanaRpcError } from "../infra/solana-rpc.js";
import {
  collectProgramIdsFromInstructions,
  resolveAllAccountKeys,
} from "../simulation/account-keys.js";
import { decodeVersionedTransactionBase64 } from "../simulation/tx-decode.js";
import { pickAccountsForSimulation, SolanaSimulator } from "../simulation/solana-simulator.js";
import {
  buildPreAccountsMap,
  enrichTokenDecimals,
  extractEstimatedChanges,
} from "../analysis/extract-deltas.js";
import { runRiskDetection } from "../risk/index.js";
import { evaluatePolicy } from "../policy/engine.js";
import { parseCpiTrace } from "../simulation/cpi-parser.js";
import { decodeTransactionInstructions } from "../analysis/instruction-decoder.js";
import { generateSuggestions } from "../analysis/suggestion-engine.js";
import { getAuditStore } from "../data/audit-store.js";

export type AnalyzeTimings = {
  preFetchMs: number;
  simulateMs: number;
  postSimMs: number;
  totalMs: number;
};

export type AnalyzeDeps = {
  config: AppConfig;
  createRpc: (cluster: Cluster) => SolanaRpcAdapter;
  onAnalyzeTimings?: (t: AnalyzeTimings) => void;
};

function simulationWarningsFromLogs(logs: string[]): string[] {
  return logs.filter((l) => /warn/i.test(l));
}

function usdcMintForCluster(config: AppConfig, cluster: Cluster): string {
  const fromEnv = config.usdcMintByCluster[cluster];
  if (fromEnv) return fromEnv;
  const defaults: Record<Cluster, string> = {
    "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    testnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  };
  return defaults[cluster];
}

export async function analyzeTransaction(
  body: AnalyzeRequestBody,
  deps: AnalyzeDeps,
): Promise<Decision> {
  const { config, createRpc, onAnalyzeTimings } = deps;
  const t0 = performance.now();
  const cluster = body.cluster;
  const rpcUrl = config.rpcByCluster[cluster];
  if (!rpcUrl) {
    throw new SolanaRpcError(
      "RPC_UNAVAILABLE",
      `No RPC endpoint configured for cluster ${cluster}`,
    );
  }

  let tx;
  try {
    tx = decodeVersionedTransactionBase64(body.transactionBase64);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AnalyzeValidationError(`Invalid transaction base64: ${msg}`);
  }

  const adapter = createRpc(cluster);

  const resolved = await resolveAllAccountKeys(tx, adapter);
  const allKeys = resolved.allKeys;
  const accountKeys = pickAccountsForSimulation(
    allKeys,
    config.maxSimulationAccounts,
  );
  const truncatedAccounts = allKeys.length > accountKeys.length;
  const preInfos = await adapter.getMultipleAccountsInfo(accountKeys);
  const t1 = performance.now();
  const preFetchMs = t1 - t0;
  const preMap = buildPreAccountsMap(
    accountKeys.map((k) => k.toBase58()),
    preInfos,
  );

  const simulator = new SolanaSimulator(config, createRpc);
  const simulation = await simulator.simulate({
    cluster,
    tx,
    accountKeysForAccountsField: accountKeys,
  });
  const t2 = performance.now();
  const simulateMs = t2 - t1;

  let userWalletPk: PublicKey | null = null;
  if (body.userWallet) {
    try {
      userWalletPk = new PublicKey(body.userWallet);
    } catch {
      throw new AnalyzeValidationError("Invalid userWallet public key");
    }
  }

  const estimatedChanges = extractEstimatedChanges(
    preMap,
    simulation,
    userWalletPk,
  );
  enrichTokenDecimals(estimatedChanges, preMap, simulation);

  const cpiTrace = parseCpiTrace(tx, simulation.logs);

  const programIds = collectProgramIdsFromInstructions(tx);
  const riskFindings = runRiskDetection({
    config,
    policy: body.policy,
    simulation,
    programIds,
    estimatedChanges,
    truncatedAccounts,
    userWallet: userWalletPk,
    cpiTrace,
  });

  const simWarnings = simulationWarningsFromLogs(simulation.logs);

  const usdcMint = usdcMintForCluster(config, cluster);

  const txSummary = decodeTransactionInstructions(tx);

  const decision = evaluatePolicy({
    cluster,
    policy: body.policy,
    simulation,
    estimatedChanges,
    riskFindings,
    simulationWarnings: simWarnings,
    usdcMint,
    userWallet: userWalletPk?.toBase58() ?? null,
    integratorRequestId: body.integratorRequestId,
  });

  decision.annotation = {
    summary: txSummary,
    cpiTrace,
  };

  const suggestionResult = generateSuggestions(tx, decision, simulation, txSummary);
  decision.suggestions = suggestionResult.suggestions;
  const t3 = performance.now();
  const postSimMs = t3 - t2;

  try {
    getAuditStore().record(decision, {
      durationMs: t3 - t0,
      userWallet: userWalletPk?.toBase58() ?? null,
    });
  } catch {
    /* audit is best-effort */
  }

  onAnalyzeTimings?.({
    preFetchMs,
    simulateMs,
    postSimMs,
    totalMs: t3 - t0,
  });
  return decision;
}

export class AnalyzeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyzeValidationError";
  }
}
