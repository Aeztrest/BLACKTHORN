import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadApiKey, saveApiKey } from "../lib/storage.js";

type Ctx = {
  apiKey: string;
  setApiKey: (v: string) => void;
  persistKey: () => void;
};

const ApiKeyContext = createContext<Ctx | null>(null);

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState(() => loadApiKey());
  const persistKey = useCallback(() => {
    saveApiKey(apiKey);
  }, [apiKey]);

  const value = useMemo(
    () => ({ apiKey, setApiKey, persistKey }),
    [apiKey, persistKey],
  );

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>;
}

export function useApiKey(): Ctx {
  const c = useContext(ApiKeyContext);
  if (!c) throw new Error("useApiKey must be used within ApiKeyProvider");
  return c;
}
