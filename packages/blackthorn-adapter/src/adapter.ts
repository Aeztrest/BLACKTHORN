import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import {
  isProtoMessage,
  newRequestId,
  PROTO_VERSION,
  type ConnectRequestMessage,
  type PopupOutgoing,
  type SignRequestMessage,
} from "./protocol";

export class WalletAdapterError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "WalletAdapterError";
  }
}

export interface BlackthornAdapterOptions {
  /** Origin of the wallet, e.g. http://localhost:5180 */
  walletUrl: string;
  /** Optional human-readable dApp name shown in the wallet's consent UI. */
  appName?: string;
  /** How long to wait for the popup to respond (ms). Default 5 min. */
  timeoutMs?: number;
  /** Popup window features. Override only if you know what you're doing. */
  popupFeatures?: string;
}

export interface ConnectedAccount {
  /** Smart wallet address — funds live here. Use this as `from` in Solana txs. */
  walletAddress: PublicKey;
  /** Authority key — pays fees, signs Swig instructions. */
  authorityAddress: PublicKey;
  /** Swig PDA — protocol identifier. */
  swigAccountAddress: PublicKey;
}

const DEFAULT_TIMEOUT = 5 * 60_000;
const DEFAULT_FEATURES = "popup=yes,width=440,height=720,top=80,left=80";

type Listener = (msg: PopupOutgoing) => void;

/**
 * dApp-side adapter for the BLACKTHORN wallet. Opens popups to the wallet's
 * /connect and /sign routes; handshakes via postMessage; returns signed txs.
 *
 * Every signature is gated by the wallet's policy. The wallet runs the BLACKTHORN
 * analysis and shows it to the user before allowing the sign — this adapter
 * cannot bypass that, by design.
 */
export class BlackthornAdapter {
  private account: ConnectedAccount | null = null;

  constructor(private readonly opts: BlackthornAdapterOptions) {
    if (!opts.walletUrl) throw new WalletAdapterError("walletUrl is required", "INVALID_CONFIG");
  }

  get connected(): boolean { return this.account !== null; }
  get connectedAccount(): ConnectedAccount | null { return this.account; }
  get walletOrigin(): string {
    try { return new URL(this.opts.walletUrl).origin; }
    catch { throw new WalletAdapterError(`Invalid walletUrl: ${this.opts.walletUrl}`, "INVALID_CONFIG"); }
  }

  /**
   * Open the wallet's /connect popup and resolve when the user approves.
   * Throws WalletAdapterError on rejection or timeout.
   */
  async connect(): Promise<ConnectedAccount> {
    const requestId = newRequestId();
    const popup = this.openPopup(`${this.opts.walletUrl}/connect`, "blackthorn-connect");

    const result = await this.handshake(popup, requestId, () => {
      const req: ConnectRequestMessage = {
        __bt: PROTO_VERSION,
        type: "connect-request",
        requestId,
        origin: window.location.origin,
        appName: this.opts.appName,
      };
      popup.postMessage(req, this.walletOrigin);
    });

    if (result.type !== "connect-approved") {
      const reason = (result as { reason?: string }).reason ?? "User declined";
      throw new WalletAdapterError(reason, "CONNECT_REJECTED");
    }

    this.account = {
      walletAddress: new PublicKey(result.walletAddress),
      authorityAddress: new PublicKey(result.authorityAddress),
      swigAccountAddress: new PublicKey(result.swigAccountAddress),
    };
    return this.account;
  }

  disconnect(): void { this.account = null; }

  /**
   * Pop up the wallet's /sign route, hand it the unsigned tx, and resolve with
   * the signed bytes once the user approves the BLACKTHORN review.
   */
  async signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction> {
    if (!this.connected) throw new WalletAdapterError("Wallet not connected", "NOT_CONNECTED");
    const result = await this.requestSign(tx, "sign");
    const bytes = base64ToBytes(result.signedTransactionBase64);
    return VersionedTransaction.deserialize(bytes);
  }

  /**
   * Same as signTransaction, but also asks the wallet to broadcast the tx.
   * Returns the on-chain signature.
   */
  async signAndSendTransaction(tx: VersionedTransaction): Promise<{ signature: string }> {
    if (!this.connected) throw new WalletAdapterError("Wallet not connected", "NOT_CONNECTED");
    const result = await this.requestSign(tx, "signAndSend");
    if (!result.signature) throw new WalletAdapterError("Wallet did not return a signature", "NO_SIGNATURE");
    return { signature: result.signature };
  }

  private async requestSign(tx: VersionedTransaction, mode: "sign" | "signAndSend") {
    const requestId = newRequestId();
    const transactionBase64 = bytesToBase64(tx.serialize());
    const popup = this.openPopup(`${this.opts.walletUrl}/sign`, "blackthorn-sign");

    const result = await this.handshake(popup, requestId, () => {
      const req: SignRequestMessage = {
        __bt: PROTO_VERSION,
        type: "sign-request",
        requestId,
        origin: window.location.origin,
        appName: this.opts.appName,
        transactionBase64,
        mode,
      };
      popup.postMessage(req, this.walletOrigin);
    });

    if (result.type === "sign-approved") return result;
    const reason = (result as { reason?: string }).reason ?? "User cancelled";
    throw new WalletAdapterError(reason, "SIGN_REJECTED");
  }

  /* ────────────── internals ────────────── */

  private openPopup(url: string, name: string): Window {
    const popup = window.open(url, name, this.opts.popupFeatures ?? DEFAULT_FEATURES);
    if (!popup) {
      throw new WalletAdapterError(
        "Popup blocked by browser. Allow popups for this site to use BLACKTHORN.",
        "POPUP_BLOCKED",
      );
    }
    popup.focus();
    return popup;
  }

  private handshake(
    popup: Window,
    requestId: string,
    sendRequest: () => void,
  ): Promise<PopupOutgoing> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        try { popup.close(); } catch { /* ignore */ }
        reject(new WalletAdapterError("Wallet popup timed out", "TIMEOUT"));
      }, this.opts.timeoutMs ?? DEFAULT_TIMEOUT);

      const closedTimer = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new WalletAdapterError("User closed wallet popup", "POPUP_CLOSED"));
        }
      }, 400);

      const listener: Listener = (raw: PopupOutgoing) => {
        if (raw.requestId !== requestId) return;
        cleanup();
        try { popup.close(); } catch { /* ignore */ }
        resolve(raw);
      };

      const handleMessage = (ev: MessageEvent) => {
        if (ev.origin !== this.walletOrigin) return;
        if (!isProtoMessage(ev.data)) return;
        const msg = ev.data as PopupOutgoing;
        if (msg.requestId !== requestId) return;
        // Popup-ready triggers our request payload; subsequent messages resolve.
        if (msg.type === "popup-ready") { sendRequest(); return; }
        listener(msg);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        clearInterval(closedTimer);
        window.removeEventListener("message", handleMessage);
      };

      window.addEventListener("message", handleMessage);
    });
  }
}

/* ────────────── base64 helpers (browser-only, no Node Buffer) ────────────── */

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
