import type { VersionedTransaction } from "@solana/web3.js";
import type { DecodedInstruction, InstructionAction, TransactionSummary } from "../domain/instruction-summary.js";

const KNOWN_PROGRAMS: Record<string, string> = {
  "11111111111111111111111111111111": "System Program",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "SPL Token",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb": "SPL Token-2022",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": "Associated Token Account",
  "ComputeBudget111111111111111111111111111111": "Compute Budget",
  "Vote111111111111111111111111111111111111111": "Vote Program",
  "Stake11111111111111111111111111111111111111": "Stake Program",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter v6",
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcPX73": "Jupiter v4",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": "Orca Whirlpool",
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": "Orca v2",
  "MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky": "Mercurial",
  "RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr": "Raydium v4",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium AMM",
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": "Raydium CLMM",
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo": "Meteora DLMM",
  "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX": "Serum v3",
  "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY": "Phoenix",
  "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD": "Marinade Finance",
  "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA": "Marinade v2",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s": "Metaplex Token Metadata",
  "auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg": "Metaplex Authorization",
  "cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ": "Candy Machine v2",
  "Guard1JwRhJkVH6XZhzoYxeBVQe872VH6QggF4BWmS9g": "Candy Guard",
  "wns1gDLt8fgLcGhWi5MqAqgXpwEP1JftKE9eZnXS1HM": "WNS",
  "BPFLoaderUpgradeab1e11111111111111111111111": "BPF Loader",
};

const SYSTEM_INSTRUCTION_NAMES: Record<number, { action: InstructionAction; desc: string }> = {
  0: { action: "create_account", desc: "Create account" },
  2: { action: "transfer", desc: "SOL transfer" },
  3: { action: "create_account", desc: "Create account with seed" },
  9: { action: "create_account", desc: "Allocate" },
  12: { action: "transfer", desc: "Transfer with seed" },
};

const TOKEN_INSTRUCTION_NAMES: Record<number, { action: InstructionAction; desc: string }> = {
  3: { action: "transfer", desc: "Token transfer" },
  4: { action: "approve", desc: "Token approve delegate" },
  5: { action: "revoke", desc: "Revoke delegate" },
  6: { action: "set_authority", desc: "Set authority" },
  7: { action: "mint_to", desc: "Mint tokens" },
  8: { action: "burn", desc: "Burn tokens" },
  9: { action: "close_account", desc: "Close token account" },
  12: { action: "transfer", desc: "Token transfer (checked)" },
  13: { action: "approve", desc: "Approve delegate (checked)" },
  14: { action: "mint_to", desc: "Mint tokens (checked)" },
  15: { action: "burn", desc: "Burn tokens (checked)" },
};

export function decodeTransactionInstructions(tx: VersionedTransaction): TransactionSummary {
  const msg = tx.message;
  const accountKeys = msg.getAccountKeys();

  const getCompiledInstructions = () => {
    if ("compiledInstructions" in msg && Array.isArray(msg.compiledInstructions)) {
      return msg.compiledInstructions;
    }
    if ("instructions" in msg && Array.isArray(msg.instructions)) {
      return msg.instructions;
    }
    return [];
  };

  const compiled = getCompiledInstructions();
  const decoded: DecodedInstruction[] = [];
  const programSet = new Set<string>();

  for (const ix of compiled) {
    const pid = accountKeys.get(ix.programIdIndex);
    const programId = pid?.toBase58() ?? `unknown-${ix.programIdIndex}`;
    const programName = KNOWN_PROGRAMS[programId] ?? "Unknown Program";
    programSet.add(programName !== "Unknown Program" ? programName : programId);

    const data = "data" in ix
      ? (ix.data instanceof Uint8Array ? ix.data : Buffer.from(ix.data))
      : new Uint8Array(0);

    const instruction = decodeInstruction(programId, programName, data);
    decoded.push(instruction);
  }

  const primaryAction = determinePrimaryAction(decoded);
  const humanReadable = buildHumanReadable(decoded, primaryAction);

  return {
    instructions: decoded,
    humanReadable,
    primaryAction,
    involvedPrograms: [...programSet],
  };
}

function decodeInstruction(
  programId: string,
  programName: string,
  data: Uint8Array | Buffer,
): DecodedInstruction {
  if (programId === "11111111111111111111111111111111") {
    return decodeSystemInstruction(programId, programName, data);
  }

  if (
    programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ||
    programId === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  ) {
    return decodeTokenInstruction(programId, programName, data);
  }

  if (programId === "ComputeBudget111111111111111111111111111111") {
    return {
      programId,
      programName,
      action: "compute_budget",
      description: "Set compute budget",
    };
  }

  if (isKnownDexProgram(programId)) {
    return {
      programId,
      programName,
      action: "swap",
      description: `${programName} swap`,
    };
  }

  if (programId === "Stake11111111111111111111111111111111111111") {
    return { programId, programName, action: "stake", description: "Stake operation" };
  }

  if (programId === "Vote111111111111111111111111111111111111111") {
    return { programId, programName, action: "vote", description: "Vote instruction" };
  }

  return {
    programId,
    programName,
    action: "unknown",
    description: `${programName} instruction`,
  };
}

function decodeSystemInstruction(
  programId: string,
  programName: string,
  data: Uint8Array | Buffer,
): DecodedInstruction {
  if (data.length < 4) {
    return { programId, programName, action: "unknown", description: "System instruction" };
  }
  const typeIndex = data[0]! | (data[1]! << 8) | (data[2]! << 16) | (data[3]! << 24);
  const info = SYSTEM_INSTRUCTION_NAMES[typeIndex];
  if (info) {
    const details: Record<string, unknown> = { instructionType: typeIndex };
    if (typeIndex === 2 && data.length >= 12) {
      const lamports = Number(
        Buffer.from(data.slice(4, 12)).readBigUInt64LE(0),
      );
      details.lamports = lamports;
      details.sol = lamports / 1e9;
      return {
        programId, programName,
        action: info.action,
        description: `Transfer ${(lamports / 1e9).toFixed(6)} SOL`,
        details,
      };
    }
    return { programId, programName, action: info.action, description: info.desc, details };
  }
  return { programId, programName, action: "unknown", description: "System instruction" };
}

function decodeTokenInstruction(
  programId: string,
  programName: string,
  data: Uint8Array | Buffer,
): DecodedInstruction {
  if (data.length < 1) {
    return { programId, programName, action: "unknown", description: "Token instruction" };
  }
  const typeIndex = data[0]!;
  const info = TOKEN_INSTRUCTION_NAMES[typeIndex];
  if (info) {
    return { programId, programName, action: info.action, description: info.desc };
  }
  return { programId, programName, action: "unknown", description: `Token instruction #${typeIndex}` };
}

function isKnownDexProgram(programId: string): boolean {
  const dexPrograms = [
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcPX73",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP",
    "RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr",
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX",
    "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY",
  ];
  return dexPrograms.includes(programId);
}

function determinePrimaryAction(decoded: DecodedInstruction[]): InstructionAction {
  const actionPriority: InstructionAction[] = [
    "swap", "stake", "unstake", "set_authority", "approve",
    "transfer", "mint_to", "burn", "create_account", "close_account",
    "vote", "compute_budget", "revoke", "unknown",
  ];

  for (const action of actionPriority) {
    if (decoded.some((d) => d.action === action)) return action;
  }
  return "unknown";
}

function buildHumanReadable(decoded: DecodedInstruction[], primary: InstructionAction): string {
  const meaningful = decoded.filter(
    (d) => d.action !== "compute_budget" && d.action !== "unknown",
  );

  if (meaningful.length === 0) {
    return "Transaction with unknown operations";
  }

  if (primary === "swap") {
    const dex = meaningful.find((d) => d.action === "swap");
    return `Token swap via ${dex?.programName ?? "DEX"}`;
  }

  if (primary === "transfer") {
    const transfers = meaningful.filter((d) => d.action === "transfer");
    if (transfers.length === 1) return transfers[0]!.description;
    return `${transfers.length} transfer operations`;
  }

  if (primary === "approve") {
    return "Token approval (delegate) operation";
  }

  if (primary === "set_authority") {
    return "Authority change operation";
  }

  return meaningful.map((d) => d.description).join("; ");
}
