export type SimulationAccountState = {
  pubkey: string;
  lamports: number;
  owner: string;
  dataBase64: string;
  executable: boolean;
};

export type NormalizedSimulation =
  | {
      status: "success";
      logs: string[];
      err: null;
      accounts: SimulationAccountState[];
      unitsConsumed: number | null;
      returnData: { programId: string; data: string } | null;
    }
  | {
      status: "failed";
      logs: string[];
      err: string;
      accounts: SimulationAccountState[];
      unitsConsumed: number | null;
      returnData: { programId: string; data: string } | null;
    };
