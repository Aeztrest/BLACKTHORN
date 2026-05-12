/**
 * On-chain Swig PDA creation. Called from the onboarding wizard's
 * "provision smart wallet" step.
 *
 * Spec: docs/wallet-spec.md §9.6 + docs/extension-architecture.md §3.
 *
 * Idempotent — if the Swig already exists on-chain, returns its address
 * without sending a new transaction.
 */

import {
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
  type Connection,
} from "@solana/web3.js";
import {
  Actions,
  createEd25519AuthorityInfo,
  fetchNullableSwig,
  findSwigPda,
  getCreateSwigInstruction,
  getSwigWalletAddress,
} from "@swig-wallet/classic";
import { Buffer } from "buffer";

import { readKeystore } from "../db/keystore";
import { useAuthority } from "../crypto/session";

export interface ProvisionResult {
  swigAddress: string;
  walletAddress: string;
  alreadyOnChain: boolean;
}

const MIN_RENT_BUDGET_LAMPORTS = 0.02 * LAMPORTS_PER_SOL;

export async function provisionSwig(connection: Connection): Promise<ProvisionResult> {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet found.");
  const swigId = new Uint8Array(Buffer.from(row.swigIdB64, "base64"));
  const swigPda = findSwigPda(swigId);

  // Already on-chain? Return early.
  const existing = await fetchNullableSwig(connection, swigPda);
  if (existing) {
    const walletAddress = await getSwigWalletAddress(existing);
    return {
      swigAddress: swigPda.toBase58(),
      walletAddress: walletAddress.toBase58(),
      alreadyOnChain: true,
    };
  }

  // Need to create. Authority must be unlocked + funded.
  const authority: Keypair = useAuthority();
  const balance = await connection.getBalance(authority.publicKey);
  if (balance < MIN_RENT_BUDGET_LAMPORTS) {
    throw new Error(
      `Authority needs at least ${MIN_RENT_BUDGET_LAMPORTS / LAMPORTS_PER_SOL} SOL ` +
      `to fund the smart wallet creation. Run an airdrop first.`,
    );
  }

  const rootActions = Actions.set().all().get();
  const authorityInfo = createEd25519AuthorityInfo(authority.publicKey);
  const createIx = await getCreateSwigInstruction({
    payer: authority.publicKey,
    id: swigId,
    actions: rootActions,
    authorityInfo,
  });

  const tx = new Transaction().add(createIx);
  await sendAndConfirmTransaction(connection, tx, [authority], { commitment: "confirmed" });

  const refreshed = await fetchNullableSwig(connection, swigPda);
  if (!refreshed) {
    throw new Error("Swig PDA create succeeded but on-chain fetch returned null.");
  }
  const walletAddress = await getSwigWalletAddress(refreshed);
  return {
    swigAddress: swigPda.toBase58(),
    walletAddress: walletAddress.toBase58(),
    alreadyOnChain: false,
  };
}
