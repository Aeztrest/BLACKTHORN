import {
  AccountInfo,
  Connection,
  PublicKey,
  VersionedTransaction,
  type SimulatedTransactionResponse,
} from "@solana/web3.js";
import type { Cluster } from "../config/index.js";

export type RpcErrorCode =
  | "RPC_TIMEOUT"
  | "RPC_UNAVAILABLE"
  | "RPC_BAD_RESPONSE";

export class SolanaRpcError extends Error {
  readonly code: RpcErrorCode;
  readonly cause?: unknown;

  constructor(code: RpcErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "SolanaRpcError";
    this.code = code;
    this.cause = cause;
  }
}

export class SolanaRpcAdapter {
  private readonly connection: Connection;
  readonly cluster: Cluster;
  readonly endpoint: string;

  constructor(cluster: Cluster, endpoint: string, timeoutMs: number) {
    this.cluster = cluster;
    this.endpoint = endpoint;
    this.connection = new Connection(endpoint, {
      commitment: "confirmed",
      fetch: (input, init) =>
        fetchWithTimeout(input, init, timeoutMs),
    });
  }

  async getMultipleAccountsInfo(
    keys: PublicKey[],
  ): Promise<(AccountInfo<Buffer> | null)[]> {
    return withTimeoutRetryOnce(async () => {
      try {
        return await this.connection.getMultipleAccountsInfo(keys);
      } catch (e) {
        throw mapRpcError(e);
      }
    });
  }

  async simulateVersionedTransaction(
    tx: VersionedTransaction,
    accountKeys: PublicKey[],
  ): Promise<SimulatedTransactionResponse> {
    return withTimeoutRetryOnce(async () => {
      try {
        const addresses = accountKeys.map((k) => k.toBase58());
        const sim = await this.connection.simulateTransaction(tx, {
          sigVerify: false,
          commitment: "confirmed",
          accounts: {
            encoding: "base64",
            addresses,
          },
        });
        return sim.value;
      } catch (e) {
        throw mapRpcError(e);
      }
    });
  }

  async getAddressLookupTable(
    accountKey: PublicKey,
  ): Promise<{ addresses: PublicKey[] } | null> {
    return withTimeoutRetryOnce(async () => {
      try {
        const result = await this.connection.getAddressLookupTable(accountKey);
        if (!result.value) return null;
        return { addresses: result.value.state.addresses };
      } catch (e) {
        throw mapRpcError(e);
      }
    });
  }

  async pingRpc(): Promise<void> {
    return withTimeoutRetryOnce(async () => {
      try {
        await this.connection.getVersion();
      } catch (e) {
        throw mapRpcError(e);
      }
    });
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new SolanaRpcError("RPC_TIMEOUT", "RPC request timed out", e);
    }
    throw mapRpcError(e);
  } finally {
    clearTimeout(id);
  }
}

function mapRpcError(e: unknown): SolanaRpcError {
  if (e instanceof SolanaRpcError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new SolanaRpcError("RPC_UNAVAILABLE", msg, e);
}

async function withTimeoutRetryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SolanaRpcError && e.code === "RPC_TIMEOUT") {
      return await fn();
    }
    throw e;
  }
}
