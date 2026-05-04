import { createContext, useContext } from "react";

export interface WalletState {
  connected: boolean;
  address: string | null;
  shortAddress: string | null;
  connecting: boolean;
  connect: () => void;
  disconnect: () => void;
}

export const WalletContext = createContext<WalletState>({
  connected: false,
  address: null,
  shortAddress: null,
  connecting: false,
  connect: () => {},
  disconnect: () => {},
});

export function useWallet(): WalletState {
  return useContext(WalletContext);
}
