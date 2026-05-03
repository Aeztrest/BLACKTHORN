import { VersionedTransaction } from "@solana/web3.js";
import { DeltaGClient, type DeltaGClientConfig } from "./client.js";
import type { AnalyzeResult } from "./types.js";

export type InterceptorCallbacks = {
  onAnalysisStart?: (txBase64: string) => void;
  onAnalysisComplete?: (result: AnalyzeResult) => void;
  onAnalysisError?: (error: Error) => void;
  onBlocked?: (result: AnalyzeResult) => boolean | Promise<boolean>;
  onWarning?: (result: AnalyzeResult) => boolean | Promise<boolean>;
};

export type InterceptorConfig = DeltaGClientConfig & {
  cluster?: "mainnet-beta" | "devnet" | "testnet";
  autoBlock?: boolean;
  callbacks?: InterceptorCallbacks;
};

export function createDeltaGInterceptor(config: InterceptorConfig) {
  const client = new DeltaGClient(config);
  const cluster = config.cluster ?? "mainnet-beta";
  const autoBlock = config.autoBlock ?? true;

  return {
    client,

    async wrapSignTransaction<T extends VersionedTransaction>(
      tx: T,
      signFn: (tx: T) => Promise<T>,
      userWallet?: string,
    ): Promise<T> {
      const serialized = Buffer.from(tx.serialize()).toString("base64");

      config.callbacks?.onAnalysisStart?.(serialized);

      let result: AnalyzeResult;
      try {
        result = await client.analyze({
          cluster,
          transactionBase64: serialized,
          userWallet,
        });
      } catch (error) {
        config.callbacks?.onAnalysisError?.(error as Error);
        return signFn(tx);
      }

      config.callbacks?.onAnalysisComplete?.(result);

      if (!result.safe && autoBlock) {
        if (config.callbacks?.onBlocked) {
          const proceed = await config.callbacks.onBlocked(result);
          if (!proceed) {
            throw new TransactionBlockedError(result);
          }
        } else {
          throw new TransactionBlockedError(result);
        }
      }

      if (result.safe && result.riskFindings.length > 0 && config.callbacks?.onWarning) {
        const proceed = await config.callbacks.onWarning(result);
        if (!proceed) {
          throw new TransactionBlockedError(result);
        }
      }

      return signFn(tx);
    },

    async analyzeOnly(
      tx: VersionedTransaction,
      userWallet?: string,
    ): Promise<AnalyzeResult> {
      const serialized = Buffer.from(tx.serialize()).toString("base64");
      return client.analyze({
        cluster,
        transactionBase64: serialized,
        userWallet,
      });
    },
  };
}

export class TransactionBlockedError extends Error {
  readonly analysisResult: AnalyzeResult;

  constructor(result: AnalyzeResult) {
    super(`Transaction blocked by DeltaG: ${result.reasons.join("; ")}`);
    this.name = "TransactionBlockedError";
    this.analysisResult = result;
  }
}
