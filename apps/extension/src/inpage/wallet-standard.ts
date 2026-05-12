/**
 * BLACKTHORN Wallet Standard implementation.
 *
 * Implements the public Wallet Standard interface so any dApp using
 * @solana/wallet-adapter or @wallet-standard/app can discover and use us.
 *
 * Spec: https://github.com/wallet-standard/wallet-standard
 *       docs/extension-architecture.md §6.1.
 *
 * Each feature method posts an RPC to the content script (which forwards to
 * the background service worker), then resolves the dApp's promise with the
 * result.
 */

import { PublicKey } from "@solana/web3.js";
import { callPageBridge } from "./page-bridge";

/* ────────────── Types (Wallet Standard, minimal subset) ────────────── */

type Identifier = `${string}:${string}`;
type IdentifierArray = readonly Identifier[];

interface WalletAccount {
  readonly address: string;
  readonly publicKey: Uint8Array;
  readonly chains: IdentifierArray;
  readonly features: IdentifierArray;
  readonly label?: string;
}

type ConnectOutput = { accounts: ReadonlyArray<WalletAccount> };

type SolanaSignTransactionInput = {
  account: WalletAccount;
  transaction: Uint8Array;
  chain?: Identifier;
};
type SolanaSignTransactionOutput = { signedTransaction: Uint8Array };

type SolanaSignAndSendTransactionInput = SolanaSignTransactionInput & {
  options?: { commitment?: string; skipPreflight?: boolean; preflightCommitment?: string; maxRetries?: number; minContextSlot?: number };
};
type SolanaSignAndSendTransactionOutput = { signature: Uint8Array };

type SolanaSignMessageInput = { account: WalletAccount; message: Uint8Array };
type SolanaSignMessageOutput = { signedMessage: Uint8Array; signature: Uint8Array };

type EventName = "change";
type EventListener = (properties: { accounts?: ReadonlyArray<WalletAccount>; chains?: IdentifierArray; features?: Record<string, unknown> }) => void;

/* ────────────── Brand glyph for the wallet picker (24×24 inline SVG → data URL) ────────────── */

const ICON_DATA_URL: `data:image/svg+xml;base64,${string}` = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    <rect width="24" height="24" rx="6" fill="#3D6DFF"/>
    <path d="M12 5L18 18H6Z" fill="#FAFAFB"/>
    <rect x="4" y="19" width="16" height="1.6" rx="0.8" fill="#FAFAFB"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}` as `data:image/svg+xml;base64,${string}`;
})();

/* ────────────── State ────────────── */

const SUPPORTED_CHAINS: IdentifierArray = ["solana:mainnet", "solana:devnet", "solana:testnet"];
const FEATURE_NAMES: IdentifierArray = [
  "standard:connect",
  "standard:disconnect",
  "standard:events",
  "solana:signTransaction",
  "solana:signAndSendTransaction",
  "solana:signMessage",
];

let currentAccounts: ReadonlyArray<WalletAccount> = [];
const eventListeners = new Map<EventName, Set<EventListener>>();

function emitChange(properties: Parameters<EventListener>[0]) {
  const set = eventListeners.get("change");
  if (!set) return;
  for (const fn of set) {
    try { fn(properties); } catch (err) { console.error("[BLACKTHORN] event listener threw:", err); }
  }
}

function makeAccount(address: string): WalletAccount {
  return {
    address,
    publicKey: new PublicKey(address).toBytes(),
    chains: SUPPORTED_CHAINS,
    features: FEATURE_NAMES,
    label: "BLACKTHORN",
  };
}

/* ────────────── Feature implementations ────────────── */

async function connect(_input?: { silent?: boolean; chains?: ReadonlyArray<string> }): Promise<ConnectOutput> {
  const result = await callPageBridge<{ walletAddress: string; authorityAddress: string }>(
    "ws.connect",
    { origin: window.location.origin },
  );
  // Wallet Standard `account.address` is the signer/fee-payer pubkey. We expose
  // the authority — funds may live in the smart wallet (Swig PDA), but the key
  // that signs is the authority. Popup UI displays both addresses for the user;
  // dApps only need the signer.
  const account = makeAccount(result.authorityAddress);
  currentAccounts = [account];
  emitChange({ accounts: currentAccounts });
  return { accounts: currentAccounts };
}

async function disconnect(): Promise<void> {
  await callPageBridge<{ ok: true }>("ws.disconnect", { origin: window.location.origin });
  currentAccounts = [];
  emitChange({ accounts: currentAccounts });
}

function on(event: EventName, listener: EventListener): () => void {
  let set = eventListeners.get(event);
  if (!set) { set = new Set(); eventListeners.set(event, set); }
  set.add(listener);
  return () => { set!.delete(listener); };
}

async function signTransaction(...inputs: SolanaSignTransactionInput[]): Promise<SolanaSignTransactionOutput[]> {
  const outs: SolanaSignTransactionOutput[] = [];
  for (const input of inputs) {
    const txBase64 = bytesToBase64(input.transaction);
    const r = await callPageBridge<{ signedTxBase64: string }>(
      "ws.signTransaction",
      { origin: window.location.origin, txBase64 },
    );
    outs.push({ signedTransaction: base64ToBytes(r.signedTxBase64) });
  }
  return outs;
}

async function signAndSendTransaction(...inputs: SolanaSignAndSendTransactionInput[]): Promise<SolanaSignAndSendTransactionOutput[]> {
  const outs: SolanaSignAndSendTransactionOutput[] = [];
  for (const input of inputs) {
    const txBase64 = bytesToBase64(input.transaction);
    const r = await callPageBridge<{ signedTxBase64: string; signature: string }>(
      "ws.signAndSendTransaction",
      { origin: window.location.origin, txBase64 },
    );
    outs.push({ signature: base58ToBytes(r.signature) });
  }
  return outs;
}

async function signMessage(...inputs: SolanaSignMessageInput[]): Promise<SolanaSignMessageOutput[]> {
  const outs: SolanaSignMessageOutput[] = [];
  for (const input of inputs) {
    const messageBase64 = bytesToBase64(input.message);
    const r = await callPageBridge<{ signatureBase64: string }>(
      "ws.signMessage",
      { origin: window.location.origin, messageBase64 },
    );
    outs.push({
      signedMessage: input.message,
      signature: base64ToBytes(r.signatureBase64),
    });
  }
  return outs;
}

/* ────────────── The Wallet object ────────────── */

export const blackthornWallet = {
  version: "1.0.0" as const,
  name: "BLACKTHORN",
  icon: ICON_DATA_URL,
  chains: SUPPORTED_CHAINS,
  get accounts() { return currentAccounts; },
  features: {
    "standard:connect":               { version: "1.0.0", connect },
    "standard:disconnect":            { version: "1.0.0", disconnect },
    "standard:events":                { version: "1.0.0", on },
    "solana:signTransaction":         { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signTransaction },
    "solana:signAndSendTransaction":  { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signAndSendTransaction },
    "solana:signMessage":             { version: "1.0.0", signMessage },
  },
};

/* ────────────── base helpers ────────────── */

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

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58ToBytes(s: string): Uint8Array {
  // Decode base58 to bytes — used only for tx signatures (~64 bytes)
  let n = 0n;
  let leadingZeros = 0;
  let zeroPrefixDone = false;
  for (const c of s) {
    if (!zeroPrefixDone) {
      if (c === "1") { leadingZeros++; continue; }
      zeroPrefixDone = true;
    }
    const v = BASE58_ALPHABET.indexOf(c);
    if (v < 0) throw new Error(`Invalid base58 character: ${c}`);
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
