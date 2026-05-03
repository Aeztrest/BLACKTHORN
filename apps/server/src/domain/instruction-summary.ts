export type InstructionAction =
  | "transfer"
  | "swap"
  | "approve"
  | "revoke"
  | "create_account"
  | "close_account"
  | "stake"
  | "unstake"
  | "set_authority"
  | "mint_to"
  | "burn"
  | "vote"
  | "compute_budget"
  | "unknown";

export type DecodedInstruction = {
  programId: string;
  programName: string;
  action: InstructionAction;
  description: string;
  details?: Record<string, unknown>;
};

export type TransactionSummary = {
  instructions: DecodedInstruction[];
  humanReadable: string;
  primaryAction: InstructionAction;
  involvedPrograms: string[];
};
