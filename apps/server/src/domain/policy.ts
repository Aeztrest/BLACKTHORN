import { z } from "zod";
import { clusterSchema } from "../config/index.js";

export const policySchema = z.object({
  maxLossPercent: z.number().min(0).max(100).optional(),
  minPostUsdcBalance: z.number().nonnegative().optional(),
  /** When set, min balance applies to this mint (defaults to cluster USDC mint when minPostUsdcBalance set) */
  minPostTokenMint: z.string().optional(),
  blockApprovalChanges: z.boolean().optional(),
  blockDelegateChanges: z.boolean().optional(),
  blockRiskyPrograms: z.boolean().optional(),
  blockUnknownProgramExposure: z.boolean().optional(),
  /** If true, findings with severity warning still allow safe=true */
  allowWarnings: z.boolean().optional(),
  /** When set, simulation must succeed for safe=true */
  requireSuccessfulSimulation: z.boolean().optional(),
});

export type Policy = z.infer<typeof policySchema>;

export const analyzeRequestBodySchema = z.object({
  cluster: clusterSchema,
  transactionBase64: z.string().min(1),
  policy: policySchema.default({}),
  /** Optional context: wallet that owns assets (for token account resolution) */
  userWallet: z.string().optional(),
  /** Optional correlation id from integrator */
  integratorRequestId: z.string().max(256).optional(),
});

export type AnalyzeRequestBody = z.infer<typeof analyzeRequestBodySchema>;
