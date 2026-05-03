export type CpiNode = {
  programId: string;
  instructionIndex: number;
  depth: number;
  children: CpiNode[];
  data?: string;
  accounts?: string[];
};

export type CpiTrace = {
  roots: CpiNode[];
  allProgramIds: string[];
  maxDepth: number;
  totalInstructions: number;
};
