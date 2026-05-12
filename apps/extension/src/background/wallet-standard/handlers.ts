/**
 * Wallet Standard handlers — the dApp-facing surface.
 *
 * `ws.connect` / `ws.disconnect` resolve immediately (no popup) when the
 * wallet is unlocked. Sign methods enqueue a sign request and wait for the
 * popup to call `tx.sign` with an accept verdict.
 *
 * Spec: docs/extension-architecture.md §3 + docs/wallet-spec.md §8.
 */

import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { sign as nacl_sign } from "tweetnacl";

import { dispatch, getState } from "../state/store";
import { isUnlocked, useAuthority } from "../crypto/session";
import { getConnection } from "../rpc/connection";
import { enqueue, newRequestId, type SignKind, type SignSuccess } from "./sign-queue";
import { appendHistory, listHistory } from "../db/history";

export interface WsConnectReq { origin: string }
export interface WsDisconnectReq { origin: string }
export interface WsSignTxReq { origin: string; txBase64: string }
export interface WsSignMsgReq { origin: string; messageBase64: string }

export type WsHandler = (payload: unknown) => Promise<unknown>;

/* ────────────── Connect / Disconnect ────────────── */

export const wsConnect: WsHandler = async (raw) => {
  const { origin } = raw as WsConnectReq;
  if (!origin) throw new Error("Origin required");
  const s = getState();
  if (s.phase === "uninitialized") {
    throw new Error("BLACKTHORN wallet not initialized — open the wallet to set it up first.");
  }
  if (s.phase === "locked") {
    throw new Error("BLACKTHORN wallet is locked — open the wallet to unlock it first.");
  }
  if (!s.walletAddress || !s.authorityAddress) {
    throw new Error("Wallet not ready.");
  }

  // Record the first connection per origin in history so the Options' Sites
  // page can list real, user-touched origins (no mock entries). Re-connects
  // skip — we only need one anchor per site.
  try {
    const prior = await listHistory({ type: "dapp", origin });
    if (prior.length === 0) {
      await appendHistory({
        type: "dapp",
        signature: null,
        origin,
        summary: "Connected via Wallet Standard",
        decision: "allow",
        reasons: [],
        broadcast: false,
        createdAt: Date.now(),
      });
    }
  } catch (err) {
    // History persistence is non-fatal for connect — log and continue.
    console.warn("[BLACKTHORN] failed to record connect:", err);
  }

  return {
    walletAddress: s.walletAddress,
    authorityAddress: s.authorityAddress,
  };
};

export const wsDisconnect: WsHandler = async (_raw) => {
  // Disconnect is a per-origin courtesy on the dApp side; we don't track
  // connection sessions in the background today (the extension's wallet
  // identity is a single user). Always succeed.
  return { ok: true };
};

/* ────────────── Sign methods — queue + popup ────────────── */

function queueAndWait(kind: SignKind, origin: string, payloadBase64: string): Promise<SignSuccess> {
  if (!isUnlocked()) {
    return Promise.reject(new Error("BLACKTHORN wallet is locked."));
  }
  return new Promise<SignSuccess>((resolve, reject) => {
    const requestId = newRequestId();
    enqueue({ requestId, kind, origin, payloadBase64, resolve, reject });
    dispatch({ type: "sign.start" });
  });
}

export const wsSignMessage: WsHandler = async (raw) => {
  const { origin, messageBase64 } = raw as WsSignMsgReq;
  const result = await queueAndWait("message", origin, messageBase64);
  if (result.kind !== "message") throw new Error("Unexpected sign result kind");
  return { signatureBase64: result.signatureBase64 };
};

export const wsSignTransaction: WsHandler = async (raw) => {
  const { origin, txBase64 } = raw as WsSignTxReq;
  const result = await queueAndWait("transaction", origin, txBase64);
  if (result.kind !== "transaction") throw new Error("Unexpected sign result kind");
  return { signedTxBase64: result.signedTxBase64 };
};

export const wsSignAndSendTransaction: WsHandler = async (raw) => {
  const { origin, txBase64 } = raw as WsSignTxReq;
  const result = await queueAndWait("transactionAndSend", origin, txBase64);
  if (result.kind !== "transactionAndSend") throw new Error("Unexpected sign result kind");
  return { signedTxBase64: result.signedTxBase64, signature: result.signature };
};

/* ────────────── Pure signing helpers (used by tx.sign drain handler) ────────────── */

import { getSubKeypair } from "../crypto/sub-key-cache";

/**
 * Signs a payload. When `signerPubkey` is set, uses the per-merchant Swig
 * sub-key from cache instead of the main authority — gives compromise of
 * one merchant's sub-key zero blast radius beyond that merchant.
 */
export async function performSign(
  kind: SignKind,
  payloadBase64: string,
  signerPubkey?: string,
): Promise<SignSuccess> {
  const signer: Keypair = signerPubkey
    ? (await getSubKeypair(signerPubkey)) ?? throwSignerMissing(signerPubkey)
    : useAuthority();

  if (kind === "message") {
    const message = base64ToBytes(payloadBase64);
    const sig = nacl_sign.detached(message, signer.secretKey);
    return { kind: "message", signatureBase64: bytesToBase64(sig) };
  }

  const txBytes = base64ToBytes(payloadBase64);
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([signer]);
  const signedTxBase64 = bytesToBase64(tx.serialize());

  if (kind === "transaction") {
    return { kind: "transaction", signedTxBase64 };
  }

  // transactionAndSend
  const conn = getConnection();
  const sig = await conn.sendTransaction(tx, { maxRetries: 3 });
  const block = await conn.getLatestBlockhash("confirmed");
  await conn.confirmTransaction(
    { signature: sig, blockhash: block.blockhash, lastValidBlockHeight: block.lastValidBlockHeight },
    "confirmed",
  );
  return { kind: "transactionAndSend", signedTxBase64, signature: sig };
}

function throwSignerMissing(pk: string): never {
  throw new Error(`Sub-key ${pk.slice(0, 8)}… not in session cache. Re-unlock the wallet to reload sub-keys.`);
}

// Single content-script port carries both Wallet Standard methods AND x402
// review (T29). Background dispatches by method name.
import { x402Review } from "../x402/handlers";

export const wallet_standard_handlers: Record<string, WsHandler> = {
  "ws.connect":               wsConnect,
  "ws.disconnect":            wsDisconnect,
  "ws.signMessage":           wsSignMessage,
  "ws.signTransaction":       wsSignTransaction,
  "ws.signAndSendTransaction": wsSignAndSendTransaction,
  "x402.review":              x402Review,
};

/* ────────────── Encoding helpers ────────────── */

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
