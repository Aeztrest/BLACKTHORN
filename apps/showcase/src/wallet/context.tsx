/**
 * Showcase wallet context — discovers Wallet Standard wallets registered on
 * the page (BLACKTHORN extension is auto-detected when installed) and exposes
 * the adapter shape the existing sites consume.
 *
 * Design rules:
 *  - `connect(wallet)` ALWAYS requires an explicit wallet. We never auto-pick
 *    a wallet from the list, because that's how MetaMask / other EVM-snap
 *    wallets hijack the flow.
 *  - When a site action ("Swap", "Mint", etc.) needs a wallet, the site
 *    calls `openWalletModal()` — the user explicitly picks BLACKTHORN /
 *    Phantom / whatever from the picker.
 *  - The wallet modal is rendered ONCE inside the provider so every route
 *    shares the same picker state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PublicKey } from "@solana/web3.js";
import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import { WalletStandardBridge, WalletStandardBridgeError } from "./standard-bridge";
import { WalletModal } from "./WalletModal";

export interface WalletState {
  /** List of Wallet Standard wallets currently registered on the page. */
  available: Wallet[];
  /** True if a wallet is connected. */
  connected: boolean;
  /** The connected account's pubkey. Equal to authorityAddress with the BLACKTHORN extension. */
  walletAddress: PublicKey | null;
  shortAddress: string | null;
  connecting: boolean;
  /** Open the wallet picker so the user can choose a wallet to connect. */
  openWalletModal: () => void;
  /** Connect to a specific wallet. The user always chooses — we never auto-pick. */
  connect: (wallet: Wallet) => Promise<WalletStandardBridge | null>;
  disconnect: () => Promise<void>;
  /** Adapter shape the showcase sites consume. */
  adapter: {
    signAndSendTransaction: (tx: import("@solana/web3.js").VersionedTransaction) => Promise<{ signature: string }>;
    signTransaction: (tx: import("@solana/web3.js").VersionedTransaction) => Promise<Uint8Array>;
  };
  appName: string;
}

const Ctx = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>");
  return v;
}

export function WalletProvider({ appName, children }: { appName: string; children: ReactNode }) {
  const [available, setAvailable] = useState<Wallet[]>([]);
  const [bridge, setBridge] = useState<WalletStandardBridge | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Discover wallets via Wallet Standard. Re-checks on register/unregister so
  // the BLACKTHORN extension shows up the moment the user installs it.
  useEffect(() => {
    const wallets = getWallets();
    setAvailable(filterSolana(wallets.get()));
    const off = wallets.on("register", () => setAvailable(filterSolana(wallets.get())));
    const off2 = wallets.on("unregister", () => setAvailable(filterSolana(wallets.get())));
    return () => { off(); off2(); };
  }, []);

  const connect = useCallback(async (wallet: Wallet): Promise<WalletStandardBridge | null> => {
    if (!wallet) return null;
    setConnecting(true);
    try {
      const b = await WalletStandardBridge.connect(wallet);
      setBridge(b);
      setModalOpen(false);
      return b;
    } catch (err) {
      if (!(err instanceof WalletStandardBridgeError)) console.error(err);
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (bridge) await bridge.disconnect().catch(() => { /* ignore */ });
    setBridge(null);
  }, [bridge]);

  const openWalletModal = useCallback(() => { setModalOpen(true); }, []);
  const closeWalletModal = useCallback(() => { setModalOpen(false); }, []);

  const adapter = useMemo(() => ({
    signAndSendTransaction: async (tx: import("@solana/web3.js").VersionedTransaction) => {
      if (!bridge) throw new WalletStandardBridgeError("No wallet connected", "NOT_CONNECTED");
      return bridge.signAndSendTransaction(tx);
    },
    signTransaction: async (tx: import("@solana/web3.js").VersionedTransaction) => {
      if (!bridge) throw new WalletStandardBridgeError("No wallet connected", "NOT_CONNECTED");
      return bridge.signTransaction(tx);
    },
  }), [bridge]);

  const walletAddress = bridge?.account_pubkey() ?? null;
  const value = useMemo<WalletState>(() => ({
    available,
    connected: !!bridge,
    walletAddress,
    shortAddress: walletAddress ? short(walletAddress.toBase58()) : null,
    connecting,
    openWalletModal,
    connect,
    disconnect,
    adapter,
    appName,
  }), [available, bridge, walletAddress, connecting, openWalletModal, connect, disconnect, adapter, appName]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <WalletModal
        open={modalOpen}
        onClose={closeWalletModal}
        onConnect={(w) => { void connect(w); }}
        connecting={connecting}
        available={available}
      />
    </Ctx.Provider>
  );
}

/**
 * Filter to Solana-capable Wallet Standard wallets that expose the sign+send
 * feature. EVM-only wallets (MetaMask without the Solana snap, classic
 * MetaMask) lack `solana:*` chains and never appear; MetaMask with the Solana
 * snap WILL appear but won't be auto-picked — the user must select it.
 */
function filterSolana(wallets: ReadonlyArray<Wallet>): Wallet[] {
  return wallets.filter((w) =>
    w.chains.some((c) => c.startsWith("solana:")) &&
    !!w.features["solana:signAndSendTransaction"],
  );
}

function short(s: string): string {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
