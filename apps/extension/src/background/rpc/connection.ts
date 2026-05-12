/**
 * Pooled web3.js Connection per cluster. Reused across handlers, monitor,
 * and reconciliation so we don't open redundant sockets.
 */

import { Connection } from "@solana/web3.js";
import type { Cluster } from "@blackthorn/ext-protocol";
import { getState } from "../state/store";

const ENDPOINTS: Record<Cluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  "devnet":       "https://api.devnet.solana.com",
  "testnet":      "https://api.testnet.solana.com",
};

const cache = new Map<Cluster, Connection>();

export function getConnection(cluster?: Cluster): Connection {
  const c = cluster ?? getState().network;
  let conn = cache.get(c);
  if (!conn) {
    conn = new Connection(ENDPOINTS[c], { commitment: "confirmed" });
    cache.set(c, conn);
  }
  return conn;
}
