import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { AppConfig, Cluster } from "../config/index.js";
import type { SolanaRpcAdapter } from "../infra/solana-rpc.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";
import { normalizeSimulation } from "./normalize-simulation.js";

export type ReplayParams = {
  cluster: Cluster;
  tx: VersionedTransaction;
  accountKeysForAccountsField: PublicKey[];
  slot?: number;
  commitment?: "processed" | "confirmed" | "finalized";
};

export type ReplayResult = {
  simulation: NormalizedSimulation;
  replaySlot: number | null;
  replayedAt: string;
  isHistorical: boolean;
};

export class SimulationReplayEngine {
  constructor(
    _config: AppConfig,
    private readonly adapterFactory: (cluster: Cluster) => SolanaRpcAdapter,
  ) {}

  async replayAtSlot(params: ReplayParams): Promise<ReplayResult> {
    const { cluster, tx, accountKeysForAccountsField, slot } = params;
    const adapter = this.adapterFactory(cluster);
    const ordered = accountKeysForAccountsField.map((k) => k.toBase58());

    const raw = await adapter.simulateVersionedTransaction(
      tx,
      accountKeysForAccountsField,
    );

    const simulation = normalizeSimulation(raw, ordered);

    return {
      simulation,
      replaySlot: slot ?? null,
      replayedAt: new Date().toISOString(),
      isHistorical: slot != null,
    };
  }

  async compareSlots(
    params: ReplayParams,
    slots: number[],
  ): Promise<{
    comparisons: Array<{
      slot: number;
      result: ReplayResult;
      statusChanged: boolean;
    }>;
  }> {
    const baseline = await this.replayAtSlot(params);
    const comparisons = [];

    for (const slot of slots) {
      const result = await this.replayAtSlot({ ...params, slot });
      comparisons.push({
        slot,
        result,
        statusChanged: result.simulation.status !== baseline.simulation.status,
      });
    }

    return { comparisons };
  }
}
