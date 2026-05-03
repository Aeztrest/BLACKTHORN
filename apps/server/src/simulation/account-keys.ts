import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { SolanaRpcAdapter } from "../infra/solana-rpc.js";

export function collectStaticAccountKeys(tx: VersionedTransaction): PublicKey[] {
  const msg = tx.message;
  const keys = msg.getAccountKeys();
  const staticKeys = keys.staticAccountKeys;
  const out: PublicKey[] = [...staticKeys];
  const lookupTables = msg.addressTableLookups ?? [];
  for (const lut of lookupTables) {
    out.push(lut.accountKey);
  }
  return dedupePubkeys(out);
}

export type ResolvedAccountKeys = {
  allKeys: PublicKey[];
  altResolved: boolean;
  altCount: number;
};

export async function resolveAllAccountKeys(
  tx: VersionedTransaction,
  rpc: SolanaRpcAdapter,
): Promise<ResolvedAccountKeys> {
  const msg = tx.message;
  const staticKeys = [...msg.getAccountKeys().staticAccountKeys];
  const lookups = msg.addressTableLookups ?? [];

  if (lookups.length === 0) {
    return { allKeys: dedupePubkeys(staticKeys), altResolved: true, altCount: 0 };
  }

  const altAddresses: PublicKey[] = [];
  let resolved = true;

  for (const lookup of lookups) {
    const table = await rpc.getAddressLookupTable(lookup.accountKey);
    if (!table) {
      resolved = false;
      altAddresses.push(lookup.accountKey);
      continue;
    }
    for (const idx of lookup.writableIndexes) {
      if (idx < table.addresses.length) altAddresses.push(table.addresses[idx]!);
    }
    for (const idx of lookup.readonlyIndexes) {
      if (idx < table.addresses.length) altAddresses.push(table.addresses[idx]!);
    }
  }

  return {
    allKeys: dedupePubkeys([...staticKeys, ...altAddresses]),
    altResolved: resolved,
    altCount: lookups.length,
  };
}

export function collectProgramIdsFromInstructions(
  tx: VersionedTransaction,
): PublicKey[] {
  const msg = tx.message;
  const keys = msg.getAccountKeys();
  const programs: PublicKey[] = [];

  if ("compiledInstructions" in msg && Array.isArray(msg.compiledInstructions)) {
    for (const ix of msg.compiledInstructions) {
      const pid = keys.get(ix.programIdIndex);
      if (pid) programs.push(pid);
    }
  } else if ("instructions" in msg && Array.isArray(msg.instructions)) {
    for (const ix of msg.instructions) {
      const pid = keys.get(ix.programIdIndex);
      if (pid) programs.push(pid);
    }
  }

  return dedupePubkeys(programs);
}

function dedupePubkeys(keys: PublicKey[]): PublicKey[] {
  const seen = new Set<string>();
  const out: PublicKey[] = [];
  for (const k of keys) {
    const s = k.toBase58();
    if (!seen.has(s)) {
      seen.add(s);
      out.push(k);
    }
  }
  return out;
}
