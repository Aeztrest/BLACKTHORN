export type RiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskFinding {
  id: string;
  label: string;
  detail: string;
  severity: RiskLevel;
}

export interface EstimatedChange {
  asset: string;
  delta: string;
  direction: "in" | "out";
  usdValue?: string;
}

export interface AnalysisResult {
  safe: boolean;
  riskLevel: RiskLevel;
  summary: string;
  reasons: string[];
  riskFindings: RiskFinding[];
  estimatedChanges: EstimatedChange[];
  simulationWarnings: string[];
  demoMode: boolean;
}

export type ScenarioId =
  | "solswap-safe"
  | "solswap-danger"
  | "pixeldrop-safe"
  | "pixeldrop-danger"
  | "solyield-safe"
  | "solyield-warn"
  | "claimhub-safe"
  | "claimhub-danger"
  | "launchpad-safe"
  | "launchpad-danger";
