import { z } from "zod";

export const riskFindingResponseSchema = z.object({
  code: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export const analyzeResponseSchema = z.object({
  safe: z.boolean(),
  reasons: z.array(z.string()),
  estimatedChanges: z.object({
    sol: z.array(
      z.object({
        account: z.string(),
        preLamports: z.number().nullable(),
        postLamports: z.number().nullable(),
        deltaLamports: z.number().nullable(),
      }),
    ),
    tokens: z.array(
      z.object({
        account: z.string(),
        mint: z.string(),
        owner: z.string().nullable(),
        preAmount: z.string(),
        postAmount: z.string(),
        delta: z.string(),
        decimals: z.number().nullable(),
      }),
    ),
    approvals: z.array(
      z.object({
        kind: z.literal("spl_token_approval"),
        tokenAccount: z.string(),
        mint: z.string(),
        delegate: z.string().nullable(),
        message: z.string(),
      }),
    ),
    delegates: z.array(
      z.object({
        kind: z.literal("spl_token_delegate"),
        tokenAccount: z.string(),
        mint: z.string(),
        delegate: z.string().nullable(),
        message: z.string(),
      }),
    ),
  }),
  riskFindings: z.array(riskFindingResponseSchema),
  simulationWarnings: z.array(z.string()),
  annotation: z.object({
    summary: z.object({
      instructions: z.array(z.object({
        programId: z.string(),
        programName: z.string(),
        action: z.string(),
        description: z.string(),
        details: z.record(z.unknown()).optional(),
      })),
      humanReadable: z.string(),
      primaryAction: z.string(),
      involvedPrograms: z.array(z.string()),
    }),
    cpiTrace: z.object({
      roots: z.array(z.unknown()),
      allProgramIds: z.array(z.string()),
      maxDepth: z.number(),
      totalInstructions: z.number(),
    }),
  }).optional(),
  suggestions: z.array(z.object({
    id: z.string(),
    severity: z.enum(["info", "warning", "critical"]),
    category: z.string(),
    title: z.string(),
    description: z.string(),
    autoFixAvailable: z.boolean(),
  })).optional(),
  meta: z.object({
    analysisVersion: z.string(),
    cluster: z.enum(["mainnet-beta", "devnet", "testnet"]),
    simulatedAt: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
    integratorRequestId: z.string().optional(),
  }),
});
