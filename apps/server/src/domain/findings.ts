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
  | "EXCESSIVE_COMPUTE_USAGE"
  // x402 protocol-specific findings (T31)
  | "X402_SHAPE_INVALID"
  | "X402_FEEPAYER_IN_ACCOUNTS"
  | "X402_MEMO_MISSING"
  | "X402_DESTINATION_MISMATCH"
  | "X402_MINT_MISMATCH"
  | "X402_AMOUNT_MISMATCH"
  | "X402_CU_PRICE_EXCESS"
  | "X402_NON_CANONICAL_MINT";

export type RiskFinding = {
  code: RiskFindingCode;
  severity: RiskSeverity;
  message: string;
  details?: Record<string, unknown>;
};
