/**
 * Merchant identity used by the demo paywall (apps/server/src/api/routes/demo-paywall.ts).
 *
 * Lives in env so the merchant key can persist across server restarts.
 * `pnpm x402-setup` generates and persists the keypair + creates the merchant
 * USDC ATA on devnet (one-time, idempotent).
 */

import { PublicKey } from "@solana/web3.js";

const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface MerchantConfig {
  /** Base58-encoded ed25519 secretKey (64 bytes). */
  merchantSecretBase58: string;
  /** Cached merchant pubkey for quick reference. */
  merchantPubkey: PublicKey;
  /** Pre-created merchant USDC ATA (devnet). */
  merchantUsdcAta: PublicKey;
  /** PayAI facilitator URL (devnet default). */
  facilitatorUrl: string;
  /** Network in CAIP-2 form. */
  network: "solana:devnet" | "solana:mainnet" | "solana:testnet";
  /** USDC mint to charge in (matches `network`). */
  usdcMint: string;
  /** Per-question price in atomic units (USDC has 6 decimals → 1000 = $0.001). */
  priceAtomic: string;
}

export class MerchantConfigError extends Error {
  constructor(message: string) { super(message); this.name = "MerchantConfigError"; }
}

let cached: MerchantConfig | null = null;

export function loadMerchantConfig(env: NodeJS.ProcessEnv = process.env): MerchantConfig {
  if (cached) return cached;

  const merchantSecretBase58 = env.X402_MERCHANT_SECRET;
  const merchantUsdcAtaStr   = env.X402_MERCHANT_USDC_ATA;
  if (!merchantSecretBase58) {
    throw new MerchantConfigError(
      "X402_MERCHANT_SECRET missing. Run `pnpm --filter @deltag/server x402-setup` to generate one.",
    );
  }
  if (!merchantUsdcAtaStr) {
    throw new MerchantConfigError(
      "X402_MERCHANT_USDC_ATA missing. Run `pnpm --filter @deltag/server x402-setup` to create it on devnet.",
    );
  }

  const network = (env.X402_DEMO_NETWORK ?? "solana:devnet") as MerchantConfig["network"];
  const usdcMint = network === "solana:mainnet" ? USDC_MAINNET_MINT : USDC_DEVNET_MINT;
  const facilitatorUrl = env.X402_FACILITATOR_URL ?? "https://facilitator.payai.network";
  const priceAtomic = env.X402_DEMO_PRICE_ATOMIC ?? "1000";  // 0.001 USDC

  let merchantPubkey: PublicKey;
  try {
    const bytes = decodeBase58(merchantSecretBase58);
    if (bytes.length !== 64) throw new Error(`expected 64 bytes, got ${bytes.length}`);
    merchantPubkey = new PublicKey(bytes.slice(32));  // public half
  } catch (err) {
    throw new MerchantConfigError(`Invalid X402_MERCHANT_SECRET: ${err instanceof Error ? err.message : String(err)}`);
  }

  let merchantUsdcAta: PublicKey;
  try { merchantUsdcAta = new PublicKey(merchantUsdcAtaStr); }
  catch { throw new MerchantConfigError(`Invalid X402_MERCHANT_USDC_ATA: ${merchantUsdcAtaStr}`); }

  cached = {
    merchantSecretBase58,
    merchantPubkey,
    merchantUsdcAta,
    facilitatorUrl,
    network,
    usdcMint,
    priceAtomic,
  };
  return cached;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(s: string): Uint8Array {
  let n = 0n;
  let leadingZeros = 0;
  let zeroPrefixDone = false;
  for (const c of s) {
    if (!zeroPrefixDone) {
      if (c === "1") { leadingZeros++; continue; }
      zeroPrefixDone = true;
    }
    const v = BASE58_ALPHABET.indexOf(c);
    if (v < 0) throw new Error(`invalid base58 char: ${c}`);
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (let i = 0; i < leadingZeros; i++) bytes.unshift(0);
  return new Uint8Array(bytes);
}
