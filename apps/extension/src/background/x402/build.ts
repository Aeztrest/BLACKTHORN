/**
 * Build a spec-compliant x402 payment VersionedTransaction.
 *
 * Layout (per scheme_exact_svm.md):
 *   0. ComputeBudget::SetComputeUnitLimit
 *   1. ComputeBudget::SetComputeUnitPrice
 *   2. SPL TransferChecked  (USDC, etc., to payTo's ATA)
 *   3. Memo  (canonical from extra.memo, or random nonce)
 *
 * The fee payer (`payerKey`) is the facilitator's pubkey from
 * extra.feePayer — the user signs as authority but does NOT pay fees.
 *
 * Spec: docs/x402-defense.md §3.
 */

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { Buffer } from "buffer";
import type { PaymentRequirements } from "./parse";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// Spec ceiling: ≤ 5 microlamports per CU.
const COMPUTE_UNITS = 20_000;
const COMPUTE_UNIT_PRICE = 1;

export interface BuiltPayment {
  transaction: VersionedTransaction;
  /** Detected from on-chain mint metadata. Used for cap math + display. */
  decimals: number;
  /** Memo string used (may be the canonical from extra.memo, or a random nonce). */
  memoUsed: string;
  /** ATA addresses we computed — useful for the analyze server + audit log. */
  sourceAta: string;
  destAta: string;
  tokenProgramId: string;
}

export async function buildX402Payment(
  authority: Keypair,
  requirements: PaymentRequirements,
  connection: Connection,
): Promise<BuiltPayment> {
  const feePayer = new PublicKey(requirements.extra.feePayer);
  const payTo = new PublicKey(requirements.payTo);
  const mint = new PublicKey(requirements.asset);

  // Detect token program from mint owner.
  const mintAccount = await connection.getAccountInfo(mint, "confirmed");
  if (!mintAccount) throw new Error(`Mint ${mint.toBase58()} not found on-chain`);
  const tokenProgramId = mintAccount.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  const mintInfo = await getMint(connection, mint, "confirmed", tokenProgramId);
  const decimals = mintInfo.decimals;

  // ATAs
  const sourceAta = getAssociatedTokenAddressSync(mint, authority.publicKey, false, tokenProgramId);
  const destAta   = getAssociatedTokenAddressSync(mint, payTo,                false, tokenProgramId);

  // Memo — spec mandates one. Use canonical from extra.memo, else random 16-byte hex.
  const memoUsed = requirements.extra.memo ?? randomNonceHex();

  // Compose instructions
  const instructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE }),
    createTransferCheckedInstruction(
      sourceAta,
      mint,
      destAta,
      authority.publicKey,
      BigInt(requirements.amount),
      decimals,
      [],
      tokenProgramId,
    ),
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: authority.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(memoUsed, "utf8"),
    }),
  ];

  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const message = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  return {
    transaction: new VersionedTransaction(message),
    decimals,
    memoUsed,
    sourceAta: sourceAta.toBase58(),
    destAta:   destAta.toBase58(),
    tokenProgramId: tokenProgramId.toBase58(),
  };
}

function randomNonceHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
