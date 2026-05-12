/**
 * Swig sub-key creation + revocation builders.
 *
 * AddAuthority: registers a new ed25519 authority on the existing Swig PDA
 * with scoped Actions (matching the merchant's allowance caps).
 * RemoveAuthority: removes the named authority, ending its ability to sign
 * for the smart wallet.
 *
 * Both functions return an unsigned `VersionedTransaction` with the main
 * authority as fee payer + signer. The sign queue routes them through the
 * popup (kind="transaction") so the user explicitly approves each on-chain
 * change.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  Actions,
  createEd25519AuthorityInfo,
  fetchSwig,
  getAddAuthorityInstructions,
  getRemoveAuthorityInstructions,
  type Swig,
} from "@swig-wallet/classic";
import { Buffer } from "buffer";

import { findSwigPda } from "@swig-wallet/classic";
import { readKeystore } from "../db/keystore";

export interface SubKeyProvisionResult {
  tx: VersionedTransaction;
  subKey: Keypair;
  swig: Swig;
}

/**
 * Build the AddAuthority instruction that registers `subKey` as a new
 * ed25519 authority on the user's Swig PDA. Caps are derived from the
 * merchant's allowance — for v1 we grant `Actions.set().all().get()` and
 * rely on the wallet's policy gate for caps; on-chain Action-level caps
 * are a Phase 2 enhancement.
 */
export async function buildAddSubKeyTransaction(
  connection: Connection,
  authority: Keypair,
  subKey: Keypair,
): Promise<SubKeyProvisionResult> {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet keystore");
  const swigId = new Uint8Array(Buffer.from(row.swigIdB64, "base64"));
  const swigPda = findSwigPda(swigId);

  const swig = await fetchSwig(connection, swigPda);

  // Find the root role id (root authority is role 0 in our setup).
  const rootRoleId = 0;

  const newAuthorityInfo = createEd25519AuthorityInfo(subKey.publicKey);
  const newActions = Actions.set().all().get();
  const ixs = await getAddAuthorityInstructions(
    swig,
    rootRoleId,
    newAuthorityInfo,
    newActions,
  );

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: authority.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  return {
    tx: new VersionedTransaction(message),
    subKey,
    swig,
  };
}

/**
 * Build the RemoveAuthority tx that drops the merchant's sub-key from the
 * Swig PDA. Submitted by the main authority — once confirmed, the sub-key's
 * private key is useless for spending.
 */
export async function buildRemoveSubKeyTransaction(
  connection: Connection,
  authority: Keypair,
  subKeyPubkey: PublicKey,
): Promise<VersionedTransaction> {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet keystore");
  const swigId = new Uint8Array(Buffer.from(row.swigIdB64, "base64"));
  const swigPda = findSwigPda(swigId);
  const swig = await fetchSwig(connection, swigPda);

  // Find the role id for the sub-key we want to remove. Swig assigns role
  // ids sequentially in registration order; the authority's signer pubkey
  // is exposed as raw 32 bytes on Ed25519 authorities.
  const targetBytes = subKeyPubkey.toBytes();
  let roleToRemoveId: number | null = null;
  const rolesLen = swig.roles?.length ?? 0;
  for (let i = 0; i < rolesLen; i++) {
    const role = swig.roles[i];
    const auth = role?.authority as unknown as {
      signer?: { publicKey?: Uint8Array | PublicKey } | Uint8Array;
      publicKey?: PublicKey | Uint8Array;
    } | undefined;
    if (!auth) continue;

    let candidateBytes: Uint8Array | null = null;
    if (auth.publicKey instanceof PublicKey) candidateBytes = auth.publicKey.toBytes();
    else if (auth.publicKey instanceof Uint8Array) candidateBytes = auth.publicKey;
    else if (auth.signer instanceof Uint8Array) candidateBytes = auth.signer;
    else if (auth.signer && (auth.signer as { publicKey?: PublicKey | Uint8Array }).publicKey) {
      const pk = (auth.signer as { publicKey: PublicKey | Uint8Array }).publicKey;
      candidateBytes = pk instanceof PublicKey ? pk.toBytes() : pk;
    }

    if (candidateBytes && bytesEqual(candidateBytes, targetBytes)) {
      roleToRemoveId = i;
      break;
    }
  }
  if (roleToRemoveId === null) {
    throw new Error(`Sub-key ${subKeyPubkey.toBase58()} not found on Swig PDA`);
  }

  const ixs = await getRemoveAuthorityInstructions(swig, 0, roleToRemoveId);

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: authority.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  return new VersionedTransaction(message);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
