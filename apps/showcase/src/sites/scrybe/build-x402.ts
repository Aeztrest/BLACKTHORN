/**
 * Build an x402-Solana exact-scheme payment transaction client-side.
 *
 * The transaction layout the facilitator expects (see PayAINetwork/x402-solana):
 *   0. ComputeBudgetProgram.setComputeUnitLimit
 *   1. ComputeBudgetProgram.setComputeUnitPrice
 *   2. SplToken TransferChecked (from = user_ATA, to = merchant_ATA)
 *   3. SplMemo (memo from the PaymentRequirements)
 *
 * The fee payer is the facilitator's pubkey (gasless for the user). The user
 * signs their slot only; the facilitator co-signs + broadcasts on /settle.
 */

import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;          // USDC mint base58
  amount: string;         // atomic units (1000 = $0.001 for 6-decimal USDC)
  payTo: string;          // merchant pubkey base58 (NOT the ATA — we derive)
  maxTimeoutSeconds: number;
  extra: {
    feePayer?: string;    // facilitator's signer pubkey
    memo?: string;
    description?: string;
    [k: string]: unknown;
  };
}

export interface BuiltX402Tx {
  tx: VersionedTransaction;
  expectedHeaderEnvelope: { x402Version: 2; accepted: PaymentRequirements; payload: { transaction: string } };
}

const USDC_DECIMALS = 6;
const DEVNET_RPC = "https://api.devnet.solana.com";

export async function buildX402PaymentTx(
  userAuthority: PublicKey,
  requirements: PaymentRequirements,
  connection?: Connection,
): Promise<BuiltX402Tx> {
  if (!requirements.extra?.feePayer) {
    throw new Error("PaymentRequirements is missing extra.feePayer (facilitator signer).");
  }
  const facilitatorFeePayer = new PublicKey(requirements.extra.feePayer);
  const merchantOwner = new PublicKey(requirements.payTo);
  const usdcMint = new PublicKey(requirements.asset);
  const amount = BigInt(requirements.amount);

  // Derive ATAs. The user must already have USDC in their authority ATA;
  // creating ATAs is out of scope for this demo (typically pre-funded).
  const sourceAta = getAssociatedTokenAddressSync(usdcMint, userAuthority, false, TOKEN_PROGRAM_ID);
  const destAta   = getAssociatedTokenAddressSync(usdcMint, merchantOwner, false, TOKEN_PROGRAM_ID);

  const conn = connection ?? new Connection(rpcForNetwork(requirements.network), "confirmed");
  const { blockhash } = await conn.getLatestBlockhash("confirmed");

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
    createTransferCheckedInstruction(
      sourceAta,
      usdcMint,
      destAta,
      userAuthority,    // authority of the source ATA
      amount,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
    memoInstruction(requirements.extra.memo ?? `scrybe-${Date.now()}`),
  ];

  const message = new TransactionMessage({
    payerKey: facilitatorFeePayer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);

  return {
    tx,
    expectedHeaderEnvelope: {
      x402Version: 2,
      accepted: requirements,
      payload: { transaction: "" /* filled after signing */ },
    },
  };
}

/** Serialize a signed tx + wrap in the PAYMENT-SIGNATURE envelope (header value). */
export function encodePaymentHeader(
  requirements: PaymentRequirements,
  signedTxBytes: Uint8Array,
): string {
  const txB64 = bytesToB64(signedTxBytes);
  const envelope = {
    x402Version: 2 as const,
    accepted: requirements,
    payload: { transaction: txB64 },
  };
  return b64UTF8(JSON.stringify(envelope));
}

/* ───────── helpers ───────── */

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
function memoInstruction(text: string) {
  return {
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(text, "utf8"),
  };
}

function rpcForNetwork(network: string): string {
  if (network.includes("devnet"))  return DEVNET_RPC;
  if (network.includes("testnet")) return "https://api.testnet.solana.com";
  return "https://api.mainnet-beta.solana.com";
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function b64UTF8(s: string): string {
  // btoa on UTF-8 string requires manual encoding
  const bytes = new TextEncoder().encode(s);
  return bytesToB64(bytes);
}
