export type HealthResponse = {
  status: string;
};

export type ReadyCheck = {
  ok: boolean;
  error?: string;
};

export type ReadyResponse = {
  status: "ready" | "degraded" | string;
  message?: string;
  checks?: Record<string, ReadyCheck>;
};

export type AuditEntry = {
  id: string;
  timestamp: string;
  cluster: string;
  safe: boolean;
  confidence: string;
  riskCodes: string[];
  programIds: string[];
  primaryAction: string;
  userWallet: string | null;
  integratorRequestId?: string;
  durationMs?: number;
};

export type AuditRecentResponse = {
  entries: AuditEntry[];
};

export type AggregateInsight = {
  totalAnalyses: number;
  safeCount: number;
  blockedCount: number;
  topRiskCodes: Array<{ code: string; count: number }>;
  topBlockedPrograms: Array<{ programId: string; count: number }>;
  timeRange: { from: string; to: string };
};
