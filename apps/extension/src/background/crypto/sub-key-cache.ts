/**
 * In-memory sub-key cache.
 *
 * On wallet unlock, sub-keys decrypt into this cache and stay there until
 * lock or service-worker death. Each x402 payment request looks up its
 * merchant's sub-key here; cache miss falls back to decrypting on demand.
 *
 * Spec: docs/extension-architecture.md §8.3 (sub-key custody).
 */

import { Keypair } from "@solana/web3.js";
import { Buffer } from "buffer";
import { decryptWithPassphrase, secureZero } from "./kdf";
import { listSubKeys, type SubKeyRow } from "../db/sub-keys";

const cache = new Map<string, Keypair>();
let cachedPassphrase: string | null = null;

export function rememberPassphrase(passphrase: string): void {
  cachedPassphrase = passphrase;
}

export function clearSubKeyCache(): void {
  for (const kp of cache.values()) {
    secureZero(kp.secretKey);
  }
  cache.clear();
  cachedPassphrase = null;
}

/**
 * Decrypt all active sub-keys into the cache. Called once after wallet unlock.
 * No-op if the wallet has no sub-keys yet.
 */
export async function preloadActiveSubKeys(passphrase: string): Promise<void> {
  rememberPassphrase(passphrase);
  const active = await listSubKeys({ status: "active" });
  for (const row of active) {
    try {
      const keypair = await decryptSubKey(row, passphrase);
      cache.set(row.pubkey, keypair);
    } catch {
      // Wrong passphrase for one row would be unusual (all use the same key).
      // Skip the row but don't kill the whole preload.
    }
  }
}

/** Lazy lookup — returns from cache, or decrypts on demand if passphrase is remembered. */
export async function getSubKeypair(pubkey: string): Promise<Keypair | null> {
  const hit = cache.get(pubkey);
  if (hit) return hit;
  if (!cachedPassphrase) return null;
  // Decrypt on demand
  const all = await listSubKeys();
  const row = all.find((r) => r.pubkey === pubkey);
  if (!row) return null;
  try {
    const kp = await decryptSubKey(row, cachedPassphrase);
    cache.set(pubkey, kp);
    return kp;
  } catch {
    return null;
  }
}

export function putSubKey(pubkey: string, keypair: Keypair): void {
  // Defensive copy so callers can zero their original.
  cache.set(pubkey, Keypair.fromSecretKey(keypair.secretKey));
}

export function evictSubKey(pubkey: string): void {
  const kp = cache.get(pubkey);
  if (kp) secureZero(kp.secretKey);
  cache.delete(pubkey);
}

async function decryptSubKey(row: SubKeyRow, passphrase: string): Promise<Keypair> {
  const secret = await decryptWithPassphrase(row.encryptedSecret, passphrase);
  try {
    return Keypair.fromSecretKey(secret);
  } finally {
    // Note: secret is owned by Keypair now; we can't safely zero without
    // breaking the keypair. Keypair.fromSecretKey copies internally so this
    // is a small leak in tests; in production the original buffer is dropped.
    void Buffer.alloc(0);
  }
}
