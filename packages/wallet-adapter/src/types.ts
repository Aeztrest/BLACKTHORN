export type RiskFinding = {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
  details?: Record<string, unknown>;
};

export type EstimatedChanges = {
  sol: Array<{
    account: string;
    preLamports: number | null;
    postLamports: number | null;
    deltaLamports: number | null;
  }>;
  tokens: Array<{
    account: string;
    mint: string;
    owner: string | null;
    preAmount: string;
    postAmount: string;
    delta: string;
    decimals: number | null;
  }>;
  approvals: Array<{ kind: string; tokenAccount: string; mint: string; delegate: string | null; message: string }>;
  delegates: Array<{ kind: string; tokenAccount: string; mint: string; delegate: string | null; message: string }>;
};

export type TransactionAnnotation = {
  summary: {
    humanReadable: string;
    primaryAction: string;
    involvedPrograms: string[];
    instructions: Array<{
      programId: string;
      programName: string;
      action: string;
      description: string;
    }>;
  };
  cpiTrace: {
    allProgramIds: string[];
    maxDepth: number;
    totalInstructions: number;
  };
};

export type AnalyzeResult = {
  safe: boolean;
  reasons: string[];
  estimatedChanges: EstimatedChanges;
  riskFindings: RiskFinding[];
  simulationWarnings: string[];
  annotation?: TransactionAnnotation;
  meta: {
    analysisVersion: string;
    cluster: string;
    simulatedAt: string;
    confidence: "high" | "medium" | "low";
  };
};

export type AnalyzeRequest = {
  cluster: "mainnet-beta" | "devnet" | "testnet";
  transactionBase64: string;
  userWallet?: string;
  policy?: Record<string, unknown>;
  integratorRequestId?: string;
};
