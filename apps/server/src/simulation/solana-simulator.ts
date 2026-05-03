import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { AppConfig, Cluster } from "../config/index.js";
import { SolanaRpcAdapter } from "../infra/solana-rpc.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";
import { normalizeSimulation } from "./normalize-simulation.js";

export type SimulateParams = {
  cluster: Cluster;
  tx: VersionedTransaction;
  accountKeysForAccountsField: PublicKey[];
};

export class SolanaSimulator {
  constructor(
    _config: AppConfig,
    private readonly adapterFactory: (cluster: Cluster) => SolanaRpcAdapter,
  ) {}

  async simulate(params: SimulateParams): Promise<NormalizedSimulation> {
    const { cluster, tx, accountKeysForAccountsField } = params;
    const adapter = this.adapterFactory(cluster);
    const ordered = accountKeysForAccountsField.map((k) => k.toBase58());
    const raw = await adapter.simulateVersionedTransaction(
      tx,
      accountKeysForAccountsField,
    );
    return normalizeSimulation(raw, ordered);
  }
}

export function pickAccountsForSimulation(
  staticKeys: PublicKey[],
  max: number,
): PublicKey[] {
  return staticKeys.slice(0, max);
}
