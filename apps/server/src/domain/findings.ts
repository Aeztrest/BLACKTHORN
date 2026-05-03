export type RiskSeverity = "low" | "medium" | "high";

export type RiskFindingCode =
  | "SIMULATION_FAILED"
  | "SIMULATION_ERROR"
  | "LOW_CONFIDENCE_INCOMPLETE_DATA"
  | "RISKY_PROGRAM_INTERACTION"
  | "UNKNOWN_PROGRAM_EXPOSURE"
  | "APPROVAL_CHANGE_DETECTED"
  | "DELEGATE_CHANGE_DETECTED"
  | "POST_BALANCE_TOO_LOW"
  | "ESTIMATED_LOSS_EXCEEDS_MAX"
  | "LOSS_PERCENT_UNAVAILABLE"
  // CPI trace findings
  | "DEEP_CPI_NESTING"
  | "HIGH_INSTRUCTION_COUNT"
  // Reputation findings
  | "KNOWN_MALICIOUS_ADDRESS"
  | "SUSPICIOUS_PROGRAM_AGE"
  // Token-2022 findings
  | "TOKEN2022_TRANSFER_HOOK"
  | "TOKEN2022_PERMANENT_DELEGATE"
  | "TOKEN2022_FREEZE_AUTHORITY"
  // Pattern-based findings
  | "UNLIMITED_APPROVAL"
  | "AUTHORITY_CHANGE_DETECTED"
  | "EXCESSIVE_COMPUTE_USAGE";

export type RiskFinding = {
  code: RiskFindingCode;
  severity: RiskSeverity;
  message: string;
  details?: Record<string, unknown>;
};
