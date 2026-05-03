export type SolBalanceChange = {
  account: string;
  preLamports: number | null;
  postLamports: number | null;
  deltaLamports: number | null;
};

export type TokenBalanceChange = {
  account: string;
  mint: string;
  owner: string | null;
  preAmount: string;
  postAmount: string;
  delta: string;
  decimals: number | null;
};

export type ApprovalRecord = {
  kind: "spl_token_approval";
  tokenAccount: string;
  mint: string;
  delegate: string | null;
  message: string;
};

export type DelegateRecord = {
  kind: "spl_token_delegate";
  tokenAccount: string;
  mint: string;
  delegate: string | null;
  message: string;
};

export type EstimatedChanges = {
  sol: SolBalanceChange[];
  tokens: TokenBalanceChange[];
  approvals: ApprovalRecord[];
  delegates: DelegateRecord[];
};
