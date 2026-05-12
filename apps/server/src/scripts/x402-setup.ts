/**
 * One-time setup CLI for the x402 demo paywall.
 *
 * Generates (if missing) a merchant ed25519 keypair + creates its USDC ATA on
 * the configured cluster. Idempotent — running twice does no harm.
 *
 * Usage: pnpm --filter @deltag/server x402-setup
 *
 * What it does:
 *   1. Reads X402_MERCHANT_SECRET from .env (or generates a new one).
 *   2. Requests devnet airdrop if merchant balance < 0.05 SOL.
 *   3. Derives the merchant's USDC ATA.
 *   4. If ATA doesn't exist on-chain, builds + sends the create-ATA tx.
 *   5. Prints the values to add to .env (or confirms existing).
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const USDC_DEVNET   = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const DEVNET_RPC    = "https://api.devnet.solana.com";
const ENV_PATH      = join(process.cwd(), ".env");

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

async function main(): Promise<void> {
  loadEnv({ path: ENV_PATH });

  const connection = new Connection(DEVNET_RPC, "confirmed");

  // Step 1 — load or generate merchant keypair
  let merchantSecret = process.env.X402_MERCHANT_SECRET;
  let merchant: Keypair;
  let generated = false;

  if (merchantSecret) {
    try {
      merchant = Keypair.fromSecretKey(decodeBase58(merchantSecret));
      console.log(`✓ Loaded existing merchant from .env (${merchant.publicKey.toBase58().slice(0, 8)}…)`);
    } catch (err) {
      console.error("✗ X402_MERCHANT_SECRET in .env is malformed. Remove it and rerun to regenerate.");
      console.error(`  Detail: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  } else {
    merchant = Keypair.generate();
    merchantSecret = encodeBase58(merchant.secretKey);
    generated = true;
    console.log(`✓ Generated new merchant keypair (${merchant.publicKey.toBase58().slice(0, 8)}…)`);
    // Persist immediately so airdrop/ATA retries reuse the same key
    // instead of churning a new one on every rate-limit.
    persistSecretEarly(merchantSecret, merchant.publicKey.toBase58());
    console.log(`  → saved to .env (rerun-safe)`);
  }

  // Step 2 — fund merchant if needed
  let balance = await connection.getBalance(merchant.publicKey);
  console.log(`  Merchant balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.log("  Requesting devnet airdrop (0.1 SOL)…");
    try {
      const sig = await connection.requestAirdrop(merchant.publicKey, 0.1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      balance = await connection.getBalance(merchant.publicKey);
      console.log(`  ✓ Airdrop landed. Balance now ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    } catch (err) {
      console.error("  ✗ Airdrop failed (rate limit?). Fund the merchant manually then rerun:");
      console.error(`    solana airdrop 0.1 ${merchant.publicKey.toBase58()} --url devnet`);
      console.error(`    Detail: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  // Step 3 — derive merchant USDC ATA
  const ata = getAssociatedTokenAddressSync(USDC_DEVNET, merchant.publicKey, false, TOKEN_PROGRAM_ID);
  console.log(`  Merchant USDC ATA: ${ata.toBase58()}`);

  // Step 4 — create ATA on-chain if missing
  const ataInfo = await connection.getAccountInfo(ata);
  if (ataInfo) {
    console.log("✓ Merchant USDC ATA already exists on-chain");
  } else {
    console.log("  Creating merchant USDC ATA on devnet…");
    const ix = createAssociatedTokenAccountInstruction(
      merchant.publicKey,  // payer
      ata,                  // ATA address
      merchant.publicKey,   // owner
      USDC_DEVNET,          // mint
    );
    const tx = new Transaction().add(ix);
    try {
      const sig = await sendAndConfirmTransaction(connection, tx, [merchant], { commitment: "confirmed" });
      console.log(`  ✓ ATA created. Tx: ${sig}`);
      console.log(`     https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    } catch (err) {
      console.error("  ✗ ATA creation failed:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  // Step 5 — persist to .env (idempotent merge)
  const envLines: string[] = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8").split("\n")
    : [];

  upsertEnv(envLines, "X402_MERCHANT_SECRET",  merchantSecret);
  upsertEnv(envLines, "X402_MERCHANT_PUBKEY",  merchant.publicKey.toBase58());
  upsertEnv(envLines, "X402_MERCHANT_USDC_ATA", ata.toBase58());
  upsertEnv(envLines, "X402_DEMO_NETWORK",      process.env.X402_DEMO_NETWORK ?? "solana:devnet");
  upsertEnv(envLines, "X402_FACILITATOR_URL",   process.env.X402_FACILITATOR_URL ?? "https://facilitator.payai.network");
  upsertEnv(envLines, "X402_DEMO_PRICE_ATOMIC", process.env.X402_DEMO_PRICE_ATOMIC ?? "1000");

  writeFileSync(ENV_PATH, envLines.join("\n"));

  console.log("");
  console.log("✓ Done. .env updated with merchant config.");
  if (generated) {
    console.log("");
    console.log("  Treat X402_MERCHANT_SECRET like a private key. Don't commit .env.");
  }
}

function persistSecretEarly(secretBase58: string, pubkey: string): void {
  const lines: string[] = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8").split("\n") : [];
  upsertEnv(lines, "X402_MERCHANT_SECRET", secretBase58);
  upsertEnv(lines, "X402_MERCHANT_PUBKEY", pubkey);
  writeFileSync(ENV_PATH, lines.join("\n"));
}

function upsertEnv(lines: string[], key: string, value: string): void {
  const existing = lines.findIndex((l) => l.startsWith(`${key}=`));
  const newLine = `${key}=${value}`;
  if (existing >= 0) lines[existing] = newLine;
  else lines.push(newLine);
}

function decodeBase58(s: string): Uint8Array {
  let n = 0n;
  let leadingZeros = 0, zeroPrefixDone = false;
  for (const c of s) {
    if (!zeroPrefixDone) { if (c === "1") { leadingZeros++; continue; } zeroPrefixDone = true; }
    const v = BASE58_ALPHABET.indexOf(c);
    if (v < 0) throw new Error(`invalid base58 char: ${c}`);
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (let i = 0; i < leadingZeros; i++) bytes.unshift(0);
  return new Uint8Array(bytes);
}

function encodeBase58(b: Uint8Array): string {
  let n = 0n;
  for (const byte of b) n = (n << 8n) | BigInt(byte);
  let out = "";
  while (n > 0n) {
    const r = Number(n % 58n);
    out = BASE58_ALPHABET[r]! + out;
    n = n / 58n;
  }
  for (const byte of b) { if (byte === 0) out = "1" + out; else break; }
  return out;
}

main().catch((err) => {
  console.error("✗ x402-setup failed:", err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
