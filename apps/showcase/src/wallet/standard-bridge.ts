/**
 * Wallet Standard ↔ showcase adapter bridge.
 *
 * The showcase pages use a small adapter shape `{ signAndSendTransaction }`.
 * Wallet Standard exposes these via feature methods on the Wallet object.
 * This file wraps a Wallet into our adapter shape so existing site code
 * keeps working unchanged.
 */

import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { Wallet, WalletAccount } from "@wallet-standard/base";

export class WalletStandardBridgeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "WalletStandardBridgeError";
  }
}

export interface BridgeAccount {
  walletAddress: PublicKey;
  authorityAddress: PublicKey;
  swigAccountAddress: PublicKey;
}

export class WalletStandardBridge {
  constructor(public readonly wallet: Wallet, public readonly account: WalletAccount) {}

  get name(): string { return this.wallet.name; }
  get icon(): string { return this.wallet.icon; }

  static async connect(wallet: Wallet): Promise<WalletStandardBridge> {
    const connectFeature = wallet.features["standard:connect"] as
      | { connect: (input?: { silent?: boolean }) => Promise<{ accounts: ReadonlyArray<WalletAccount> }> }
      | undefined;
    if (!connectFeature) throw new WalletStandardBridgeError(`${wallet.name} doesn't expose standard:connect`, "NO_CONNECT");

    const { accounts } = await connectFeature.connect();
    if (accounts.length === 0) throw new WalletStandardBridgeError(`${wallet.name} returned no accounts`, "NO_ACCOUNTS");
    return new WalletStandardBridge(wallet, accounts[0]!);
  }

  account_pubkey(): PublicKey {
    return new PublicKey(this.account.address);
  }

  /** Compatibility shim — older showcase code accessed adapter.connectedAccount.walletAddress. */
  get connectedAccount(): BridgeAccount {
    const pk = this.account_pubkey();
    return { walletAddress: pk, authorityAddress: pk, swigAccountAddress: pk };
  }

  async disconnect(): Promise<void> {
    const f = this.wallet.features["standard:disconnect"] as
      | { disconnect: () => Promise<void> }
      | undefined;
    if (f) await f.disconnect();
  }

  /**
   * Sign a transaction WITHOUT broadcasting. Required for x402: the user
   * partially signs, then sends the signed bytes to the merchant server,
   * which forwards to the facilitator. The facilitator co-signs as feePayer
   * and broadcasts.
   */
  async signTransaction(tx: VersionedTransaction): Promise<Uint8Array> {
    const f = this.wallet.features["solana:signTransaction"] as
      | {
          signTransaction: (...inputs: Array<{
            account: WalletAccount;
            transaction: Uint8Array;
            chain: `${string}:${string}`;
          }>) => Promise<Array<{ signedTransaction: Uint8Array }>>;
        }
      | undefined;

    if (!f) {
      throw new WalletStandardBridgeError(
        `${this.wallet.name} doesn't expose solana:signTransaction`,
        "NO_SIGN_TRANSACTION",
      );
    }

    const chain = this.account.chains.find((c) => c.startsWith("solana:")) ?? "solana:devnet";
    const out = await f.signTransaction({
      account: this.account,
      transaction: tx.serialize(),
      chain: chain as `${string}:${string}`,
    });
    if (out.length === 0) {
      throw new WalletStandardBridgeError("Wallet returned no signed transaction", "NO_SIGNED_TX");
    }
    return out[0]!.signedTransaction;
  }

  async signAndSendTransaction(tx: VersionedTransaction): Promise<{ signature: string }> {
    const f = this.wallet.features["solana:signAndSendTransaction"] as
      | {
          signAndSendTransaction: (...inputs: Array<{
            account: WalletAccount;
            transaction: Uint8Array;
            chain: `${string}:${string}`;
          }>) => Promise<Array<{ signature: Uint8Array }>>;
        }
      | undefined;

    if (!f) {
      throw new WalletStandardBridgeError(
        `${this.wallet.name} doesn't expose solana:signAndSendTransaction`,
        "NO_SIGN_AND_SEND",
      );
    }

    const chain = this.account.chains.find((c) => c.startsWith("solana:")) ?? "solana:devnet";
    const out = await f.signAndSendTransaction({
      account: this.account,
      transaction: tx.serialize(),
      chain: chain as `${string}:${string}`,
    });
    if (out.length === 0) throw new WalletStandardBridgeError("Wallet returned no signature", "NO_SIGNATURE");
    return { signature: bytesToBase58(out[0]!.signature) };
  }
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bytesToBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    const r = Number(n % 58n);
    out = BASE58_ALPHABET[r]! + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = "1" + out; else break;
  }
  return out;
}
