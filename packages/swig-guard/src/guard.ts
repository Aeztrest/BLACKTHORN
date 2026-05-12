import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { getSignInstructions, type Swig } from "@swig-wallet/classic";

import { analyzeTransaction, type AnalyzeClientConfig } from "./analyze";
import { GuardBlockedError } from "./errors";
import { normalizePolicy, validatePolicy, type GuardPolicy } from "./policy";
import type { AnalysisResult, Cluster, RiskFinding } from "./types";

export type GuardDecision = "allow" | "block";

export interface GuardEvaluation {
  decision: GuardDecision;
  /** Inner risk findings worth surfacing to the user even when allowed. */
  advisoryFindings: RiskFinding[];
  /** Reasons the policy blocked. Empty when decision === "allow". */
  blockingReasons: string[];
  /** Full server analysis result for rendering in the wallet UI. */
  analysis: AnalysisResult;
  /** Swig-wrapped, unsigned VersionedTransaction. Caller signs with authority + sends. */
  transaction: VersionedTransaction;
  /** Base64 of the transaction — useful for logging / replay. */
  transactionBase64: string;
}

export interface GuardConfig {
  analyze: AnalyzeClientConfig;
  /** Solana connection used for blockhash fetch. */
  connection: Connection;
  cluster: Cluster;
}

export interface EvaluateRequest {
  /**
   * The instructions the user wants to execute through Swig (e.g., a transfer or dApp ix).
   * The guard wraps these with `getSignInstructions` to produce the candidate tx.
   */
  innerInstructions: TransactionInstruction[];
  swig: Swig;
  roleId: number;
  /** Public key paying fees + signing authority (your local Ed25519 keypair). */
  feePayer: PublicKey;
  /** Smart wallet address (`getSwigWalletAddress(swig)` result), used as userWallet for token resolution. */
  userWallet: PublicKey;
  policy: GuardPolicy;
  /** Optional correlation id for tracing the request through the audit log. */
  integratorRequestId?: string;
}

export class TransactionGuard {
  constructor(private readonly cfg: GuardConfig) {}

  /**
   * Build the Swig-wrapped candidate transaction, ship it to BLACKTHORN /v1/analyze,
   * evaluate the response against the supplied policy, and return a structured
   * GuardEvaluation. The wallet UI uses this to decide whether to ask the user
   * to confirm signing.
   *
   * Never signs. Never sends. Never throws on policy violation — returns
   * `decision: "block"` so the caller can render a denial UI.
   */
  async evaluate(req: EvaluateRequest): Promise<GuardEvaluation> {
    validatePolicy(req.policy);

    const { blockhash } = await this.cfg.connection.getLatestBlockhash("confirmed");

    const swigInstructions = await getSignInstructions(
      req.swig,
      req.roleId,
      req.innerInstructions,
    );

    const message = new TransactionMessage({
      payerKey: req.feePayer,
      recentBlockhash: blockhash,
      instructions: swigInstructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);
    const transactionBase64 = encodeBase64(transaction.serialize());

    const analysis = await analyzeTransaction(this.cfg.analyze, {
      cluster: this.cfg.cluster,
      transactionBase64,
      userWallet: req.userWallet.toBase58(),
      policy: normalizePolicy(req.policy),
      integratorRequestId: req.integratorRequestId,
    });

    const blockingReasons = analysis.safe ? [] : analysis.reasons;
    const advisoryFindings = analysis.safe
      ? analysis.riskFindings.filter((f) => f.severity === "medium" || f.severity === "low")
      : [];

    return {
      decision: analysis.safe ? "allow" : "block",
      advisoryFindings,
      blockingReasons,
      analysis,
      transaction,
      transactionBase64,
    };
  }

  /**
   * Convenience wrapper around `evaluate` that throws `GuardBlockedError` on block
   * and returns the unsigned transaction otherwise. Use this from agent integrations
   * where you want exception-flow control instead of branching on a decision string.
   */
  async prepare(req: EvaluateRequest): Promise<{
    transaction: VersionedTransaction;
    analysis: AnalysisResult;
  }> {
    const ev = await this.evaluate(req);
    if (ev.decision === "block") {
      throw new GuardBlockedError(
        ev.blockingReasons[0] ?? "BLACKTHORN policy blocked this transaction",
        ev.analysis,
        ev.blockingReasons,
      );
    }
    return { transaction: ev.transaction, analysis: ev.analysis };
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
