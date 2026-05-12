/**
 * RPC handlers — one per method in @blackthorn/ext-protocol's ExtRpc.
 * Spec: docs/extension-architecture.md §4.3.
 *
 * Many methods will land progressively as their subsystems are built
 * (T26 ledger, T27 monitor, T28 revoke, T29 x402). Today: wallet lifecycle
 * + network + lock/unlock are real; everything else throws "not implemented"
 * with a clear hint.
 */

import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { findSwigPda } from "@swig-wallet/classic";
import { Buffer } from "buffer";
import browser from "webextension-polyfill";
import type { ExtRpcMethod, ExtRpcRequest, ExtRpcResponse } from "@blackthorn/ext-protocol";
import { BALANCED_POLICY, type GuardPolicy } from "@blackthorn/swig-guard";

import { dispatch, getSnapshot } from "../state/store";
import { encryptWithPassphrase, decryptWithPassphrase } from "../crypto/kdf";
import { isUnlocked, lock, unlockWith, useAuthority } from "../crypto/session";
import { clearKeystore, hasKeystore, readKeystore, writeKeystore } from "../db/keystore";
import { getConnection } from "../rpc/connection";
import { provisionSwig } from "../swig/provision";
import { performSign } from "../wallet-standard/handlers";
import { peek as peekById, take as takeSign, size as signQueueSize, snapshot as peekSign, enqueue as enqueueSign, newRequestId } from "../wallet-standard/sign-queue";
import { analyzeTransaction } from "../blackthorn/analyze-client";
import {
  listAllowances, setStatus as setAllowanceStatus,
} from "../db/allowances";
import { appendHistory, getHistoryEntry, listHistory } from "../db/history";
import { countUnread, dismiss as dismissAlert, listAlerts } from "../db/alerts";
import { preloadActiveSubKeys, clearSubKeyCache, evictSubKey } from "../crypto/sub-key-cache";
import { findActiveSubKeyForMerchant, setSubKeyStatus } from "../db/sub-keys";
import { buildRemoveSubKeyTransaction } from "../swig/sub-keys";

const POLICY_STORAGE_KEY = "blackthorn.policy.v1";

type Handler<M extends ExtRpcMethod> = (req: ExtRpcRequest<M>) => Promise<ExtRpcResponse<M>>;

const notImplemented = <M extends ExtRpcMethod>(method: M, hint: string): Handler<M> =>
  (async () => { throw new Error(`${method} not implemented yet — ${hint}`); }) as Handler<M>;

/* ────────────── Wallet lifecycle ────────────── */

const getStateHandler: Handler<"wallet.getState"> = async () => getSnapshot();

const createHandler: Handler<"wallet.create"> = async ({ passphrase, network }) => {
  if (await hasKeystore()) {
    throw new Error("A wallet already exists. Reset it before creating another.");
  }
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters.");
  }

  const authority = Keypair.generate();
  const swigId = new Uint8Array(32);
  crypto.getRandomValues(swigId);

  const blob = await encryptWithPassphrase(authority.secretKey, passphrase);
  await writeKeystore({
    id: "primary",
    blob,
    authorityPubkey: authority.publicKey.toBase58(),
    swigIdB64: Buffer.from(swigId).toString("base64"),
    createdAt: Date.now(),
  });

  unlockWith(authority.secretKey);

  // Smart wallet PDA derivable from swigId — funds live there once on-chain.
  const swigPda = findSwigPda(swigId).toBase58();

  dispatch({ type: "network.set", cluster: network });
  dispatch({
    type: "wallet.created",
    walletAddress: swigPda,           // logical "your wallet" address
    authorityAddress: authority.publicKey.toBase58(),
  });

  return {
    walletAddress: swigPda,
    authorityAddress: authority.publicKey.toBase58(),
  };
};

const unlockHandler: Handler<"wallet.unlock"> = async ({ passphrase }) => {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet found on this device.");
  const secret = await decryptWithPassphrase(row.blob, passphrase);
  unlockWith(secret);
  // Best-effort zero of caller's local copy.
  secret.fill(0);

  // Preload all active sub-keys into session memory so x402 payments can
  // sign with per-merchant authorities without re-decrypting on each call.
  await preloadActiveSubKeys(passphrase);

  const swigPda = findSwigPda(Buffer.from(row.swigIdB64, "base64")).toBase58();
  dispatch({ type: "wallet.unlocked", walletAddress: swigPda, authorityAddress: row.authorityPubkey });
  return { ok: true };
};

const lockHandler: Handler<"wallet.lock"> = async () => {
  clearSubKeyCache();
  lock();
  return { ok: true };
};

const resetHandler: Handler<"wallet.reset"> = async ({ confirmation }) => {
  if (confirmation !== "I-UNDERSTAND") {
    throw new Error("Reset requires the confirmation token \"I-UNDERSTAND\".");
  }
  lock();
  await clearKeystore();
  dispatch({ type: "wallet.reset" });
  return { ok: true };
};

const exportSecretHandler: Handler<"wallet.exportSecret"> = async ({ passphrase, format }) => {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet to export.");
  const secret = await decryptWithPassphrase(row.blob, passphrase);
  try {
    if (format === "hex") return { secret: bytesToHex(secret) };
    if (format === "base58") return { secret: bytesToBase58(secret) };
    if (format === "mnemonic") {
      // Solana ed25519 secretKey is 64 bytes (32-byte seed + 32-byte derived
      // pubkey). BIP39 wants raw entropy — we use the seed half. 32 bytes →
      // 24-word mnemonic.
      const { entropyToMnemonic } = await import("bip39");
      const entropyHex = bytesToHex(secret.slice(0, 32));
      return { secret: entropyToMnemonic(entropyHex) };
    }
    throw new Error(`Unknown export format: ${format}`);
  } finally {
    secret.fill(0);
  }
};

const airdropHandler: Handler<"wallet.airdrop"> = async () => {
  if (!isUnlocked()) throw new Error("Unlock the wallet first.");
  const authority = useAuthority();
  const conn = getConnection();
  // Try 1 SOL → 0.5 → 0.25 with retries; public devnet faucet is rate-limited.
  const amounts = [1, 0.5, 0.25];
  let lastErr: unknown = null;
  for (let i = 0; i < amounts.length; i++) {
    const sol = amounts[i]!;
    try {
      const sig = await conn.requestAirdrop(authority.publicKey, sol * LAMPORTS_PER_SOL);
      const block = await conn.getLatestBlockhash("confirmed");
      await conn.confirmTransaction(
        { signature: sig, blockhash: block.blockhash, lastValidBlockHeight: block.lastValidBlockHeight },
        "confirmed",
      );
      return { signature: sig, amountSol: sol };
    } catch (err) {
      lastErr = err;
      if (i < amounts.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Devnet faucet rate-limited. Try faucet.solana.com or wait a minute. (${detail})`);
};

const provisionSwigHandler: Handler<"wallet.provisionSwig"> = async () => {
  if (!isUnlocked()) throw new Error("Unlock the wallet first.");
  const conn = getConnection();
  return provisionSwig(conn);
};

const policyReadHandler: Handler<"policy.read"> = async () => {
  const all = await browser.storage.local.get(POLICY_STORAGE_KEY);
  const stored = (all[POLICY_STORAGE_KEY] as GuardPolicy | undefined) ?? BALANCED_POLICY;
  return stored;
};

const policyWriteHandler: Handler<"policy.write"> = async ({ policy }) => {
  await browser.storage.local.set({ [POLICY_STORAGE_KEY]: policy });
  return { ok: true };
};

const balanceHandler: Handler<"wallet.balance"> = async ({ address }) => {
  const snap = getSnapshot();
  const target = address ?? snap.authorityAddress;
  if (!target) throw new Error("No address available — wallet not initialized.");
  const conn = getConnection();
  const lamports = await conn.getBalance(new PublicKey(target));
  return { lamports };
};

const transferSolHandler: Handler<"wallet.transferSol"> = async ({ to, amountSol }) => {
  if (!isUnlocked()) throw new Error("Unlock the wallet first.");
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  let recipient: PublicKey;
  try { recipient = new PublicKey(to); }
  catch { throw new Error("Invalid recipient address."); }

  const authority = useAuthority();
  const conn = getConnection();
  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);

  // Leave a small buffer for rent + fee; reject obviously-broke sends early.
  const current = await conn.getBalance(authority.publicKey);
  const FEE_BUFFER = 5_000; // 5_000 lamports ≈ tx fee
  if (current < lamports + FEE_BUFFER) {
    throw new Error(`Insufficient balance. Have ${(current / LAMPORTS_PER_SOL).toFixed(4)} SOL, need ~${((lamports + FEE_BUFFER) / LAMPORTS_PER_SOL).toFixed(4)} SOL.`);
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: recipient,
      lamports,
    }),
  );
  const signature = await sendAndConfirmTransaction(conn, tx, [authority], { commitment: "confirmed" });
  return { signature };
};

/* ────────────── Network ────────────── */

const networkSet: Handler<"network.set"> = async ({ cluster }) => {
  dispatch({ type: "network.set", cluster });
  return { ok: true };
};

/* ────────────── Allowance ledger ────────────── */

const ledgerListHandler: Handler<"ledger.list"> = async ({ filter } = {}) => {
  return listAllowances(filter);
};

const ledgerPauseHandler: Handler<"ledger.pause"> = async ({ merchantOrigin }) => {
  const all = await listAllowances();
  const target = all.find((a) => a.merchantOrigin === merchantOrigin);
  if (!target) throw new Error(`No allowance found for ${merchantOrigin}`);
  await setAllowanceStatus(target.id, "paused");
  return { ok: true };
};

const ledgerUnpauseHandler: Handler<"ledger.unpause"> = async ({ merchantOrigin }) => {
  const all = await listAllowances();
  const target = all.find((a) => a.merchantOrigin === merchantOrigin);
  if (!target) throw new Error(`No allowance found for ${merchantOrigin}`);
  await setAllowanceStatus(target.id, "active");
  return { ok: true };
};

const ledgerRevokeHandler: Handler<"ledger.revoke"> = async ({ merchantOrigin }) => {
  if (!isUnlocked()) throw new Error("Unlock the wallet first.");
  const all = await listAllowances();
  const target = all.find((a) => a.merchantOrigin === merchantOrigin);
  if (!target) throw new Error(`No allowance found for ${merchantOrigin}`);

  const subKey = await findActiveSubKeyForMerchant(merchantOrigin);

  // No on-chain sub-key for this merchant yet (legacy allowance from before
  // T28 sub-key isolation, or the AddAuthority tx never confirmed). Local
  // revoke is the only option — mark + log.
  if (!subKey) {
    await setAllowanceStatus(target.id, "revoked");
    await appendHistory({
      type: "alert",
      signature: null,
      origin: merchantOrigin,
      summary: `Revoked allowance for ${merchantOrigin} (local-only — no on-chain sub-key)`,
      decision: "block",
      reasons: ["No active Swig sub-key registered for this merchant"],
      broadcast: false,
      createdAt: Date.now(),
    });
    return { signRequestId: `local-${Date.now()}` };
  }

  // Build the on-chain RemoveAuthority tx and route it through the sign
  // queue. The user reviews + approves like any other tx; on confirm we mark
  // sub-key revoked, evict from cache, and update the allowance.
  const conn = getConnection();
  const authority = useAuthority();
  const tx = await buildRemoveSubKeyTransaction(conn, authority, new PublicKey(subKey.pubkey));
  const txBase64 = Buffer.from(tx.serialize()).toString("base64");

  return new Promise<{ signRequestId: string }>((resolve, reject) => {
    const requestId = newRequestId();
    enqueueSign({
      requestId,
      kind: "transactionAndSend",
      origin: merchantOrigin,
      payloadBase64: txBase64,
      label: `Revoke ${merchantOrigin} from your smart wallet`,
      resolve: async (out) => {
        if (out.kind !== "transactionAndSend") return;
        await setSubKeyStatus(subKey.pubkey, "revoked", { revokeSignature: out.signature });
        evictSubKey(subKey.pubkey);
        await setAllowanceStatus(target.id, "revoked");
        await appendHistory({
          type: "alert",
          signature: out.signature,
          origin: merchantOrigin,
          summary: `Revoked ${merchantOrigin} on-chain (Swig RemoveAuthority)`,
          decision: "block",
          reasons: ["User-initiated on-chain revoke"],
          broadcast: true,
          createdAt: Date.now(),
        });
      },
      reject: (err) => {
        // User declined or tx failed — leave sub-key + allowance untouched.
        console.warn("[BLACKTHORN] revoke aborted:", err.message);
      },
    });
    dispatch({ type: "sign.start" });
    resolve({ signRequestId: requestId });
  });
};

/* ────────────── History + alerts ────────────── */

const historyListHandler: Handler<"history.list"> = async ({ filter } = {}) => {
  return listHistory(filter);
};

const historyDetailHandler: Handler<"history.detail"> = async ({ id }) => {
  const r = await getHistoryEntry(id);
  if (!r) throw new Error("History entry not found");
  let analysis: unknown = null;
  const json = (r as { analysisJson?: string }).analysisJson;
  if (json) {
    try { analysis = JSON.parse(json); } catch { /* ignore */ }
  }
  return { ...r, analysis };
};

const alertsListHandler: Handler<"alerts.list"> = async ({ includeDismissed } = {}) => {
  return listAlerts({ includeDismissed });
};

const alertsDismissHandler: Handler<"alerts.dismiss"> = async ({ id }) => {
  await dismissAlert(id);
  const remaining = await countUnread();
  dispatch({ type: "alerts.set", count: remaining });
  return { ok: true };
};

/* ────────────── Sign request drain (popup invokes after user verdict) ────────────── */

const txPeekRequestHandler: Handler<"tx.peekRequest"> = async () => peekSign();

const txAnalyzeRequestHandler: Handler<"tx.analyzeRequest"> = async ({ requestId }) => {
  const req = peekById(requestId);
  if (!req) throw new Error("Sign request not found — it may already have been processed.");
  const snap = getSnapshot();
  if (!snap.authorityAddress) throw new Error("Wallet not initialized.");
  // Messages don't need on-chain simulation — return an "info" advisory.
  if (req.kind === "message") {
    return {
      decision: "advisory" as const,
      safe: true,
      blockingReasons: [],
      advisoryReasons: ["Plain message — no funds move on-chain."],
      reasons: ["Plain message — no funds move on-chain."],
      riskFindings: [],
      estimatedChanges: { sol: [], tokens: [], approvals: [], delegates: [] },
      simulationWarnings: [],
      offline: false,
    };
  }
  const policy = (await loadPolicy()) ?? {};
  return analyzeTransaction(
    {
      cluster: snap.network,
      transactionBase64: req.payloadBase64,
      userWallet: snap.authorityAddress,
      policy,
    },
    { apiKey: "dev-key-change-me" },  // wired to the local dev server
  );
};

async function loadPolicy(): Promise<GuardPolicy | null> {
  const all = await browser.storage.local.get(POLICY_STORAGE_KEY);
  return (all[POLICY_STORAGE_KEY] as GuardPolicy | undefined) ?? null;
}

const txSignHandler: Handler<"tx.sign"> = async ({ requestId, accept }) => {
  const req = takeSign(requestId);
  if (!req) throw new Error("Unknown sign request — it may have already been processed.");
  if (!accept) {
    req.reject(new Error("User declined the signature."));
    if (signQueueSize() === 0) dispatch({ type: "sign.end" });
    await appendHistory({
      type: "dapp",
      signature: null,
      origin: req.origin,
      summary: `Declined ${kindLabel(req.kind)} from ${req.origin}`,
      decision: "block",
      reasons: ["User declined at sign request"],
      broadcast: false,
      createdAt: Date.now(),
    });
    return { rejection: "User declined" };
  }
  try {
    const result = await performSign(req.kind, req.payloadBase64, req.signerPubkey);
    req.resolve(result);
    if (signQueueSize() === 0) dispatch({ type: "sign.end" });
    const signature = result.kind === "transactionAndSend" ? result.signature : null;
    await appendHistory({
      type: req.kind === "message" ? "dapp" : "dapp",
      signature,
      origin: req.origin,
      summary: `Signed ${kindLabel(req.kind)} for ${req.origin}`,
      decision: "allow",
      reasons: [],
      broadcast: result.kind === "transactionAndSend",
      createdAt: Date.now(),
    });
    if (result.kind === "transactionAndSend") return { signed: result.signedTxBase64, signature: result.signature };
    if (result.kind === "transaction")        return { signed: result.signedTxBase64 };
    return { signature: result.signatureBase64 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.reject(new Error(message));
    if (signQueueSize() === 0) dispatch({ type: "sign.end" });
    await appendHistory({
      type: "alert",
      signature: null,
      origin: req.origin,
      summary: `Sign failed for ${req.origin}`,
      decision: "block",
      reasons: [message],
      broadcast: false,
      createdAt: Date.now(),
    });
    throw err;
  }
};

function kindLabel(kind: "message" | "transaction" | "transactionAndSend"): string {
  if (kind === "message") return "message";
  if (kind === "transactionAndSend") return "+broadcast tx";
  return "transaction";
}

/* ────────────── Registry ────────────── */

export const handlers: { [M in ExtRpcMethod]: Handler<M> } = {
  "wallet.getState":     getStateHandler,
  "wallet.create":       createHandler,
  "wallet.unlock":       unlockHandler,
  "wallet.lock":         lockHandler,
  "wallet.reset":        resetHandler,
  "wallet.exportSecret": exportSecretHandler,
  "wallet.airdrop":      airdropHandler,
  "wallet.provisionSwig": provisionSwigHandler,
  "wallet.balance":      balanceHandler,
  "wallet.transferSol":  transferSolHandler,

  "network.set":         networkSet,

  "tx.sign":             txSignHandler,
  "tx.send":             notImplemented("tx.send", "wallet-initiated send arrives with the Send page polish"),
  "tx.peekRequest":      txPeekRequestHandler,
  "tx.analyzeRequest":   txAnalyzeRequestHandler,

  "ledger.list":         ledgerListHandler,
  "ledger.revoke":       ledgerRevokeHandler,
  "ledger.pause":        ledgerPauseHandler,
  "ledger.unpause":      ledgerUnpauseHandler,

  "policy.read":         policyReadHandler,
  "policy.write":        policyWriteHandler,

  "history.list":        historyListHandler,
  "history.detail":      historyDetailHandler,

  "alerts.list":         alertsListHandler,
  "alerts.dismiss":      alertsDismissHandler,
};

/* ────────────── Encoding helpers ────────────── */

function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, "0");
  return s;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bytesToBase58(b: Uint8Array): string {
  // Tiny base58 encoder; @solana/web3.js's bs58 is also fine but avoiding the
  // import here keeps this module standalone.
  let n = 0n;
  for (const byte of b) n = (n << 8n) | BigInt(byte);
  let out = "";
  while (n > 0n) {
    const r = Number(n % 58n);
    out = BASE58_ALPHABET[r]! + out;
    n = n / 58n;
  }
  for (const byte of b) {
    if (byte === 0) out = "1" + out; else break;
  }
  return out;
}
