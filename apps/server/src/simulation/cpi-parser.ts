import type { VersionedTransaction } from "@solana/web3.js";
import type { CpiNode, CpiTrace } from "../domain/cpi-trace.js";

type InnerInstruction = {
  index: number;
  instructions: Array<{
    programIdIndex: number;
    accounts: number[];
    data: string;
    stackHeight?: number | null;
  }>;
};

export function parseCpiTrace(
  tx: VersionedTransaction,
  logs: string[],
  innerInstructions?: InnerInstruction[] | null,
): CpiTrace {
  const msg = tx.message;
  const accountKeys = msg.getAccountKeys();
  const programIdSet = new Set<string>();

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
  const roots: CpiNode[] = [];

  for (let i = 0; i < compiled.length; i++) {
    const ix = compiled[i]!;
    const pid = accountKeys.get(ix.programIdIndex);
    const programId = pid?.toBase58() ?? `unknown-${ix.programIdIndex}`;
    programIdSet.add(programId);

    const root: CpiNode = {
      programId,
      instructionIndex: i,
      depth: 0,
      children: [],
    };

    if (innerInstructions) {
      const inner = innerInstructions.find((ii) => ii.index === i);
      if (inner) {
        root.children = buildCpiChildren(inner.instructions, accountKeys, programIdSet);
      }
    }

    roots.push(root);
  }

  if (roots.length === 0 || !innerInstructions) {
    const logPrograms = extractProgramIdsFromLogs(logs);
    for (const p of logPrograms) programIdSet.add(p);
  }

  let maxDepth = 0;
  let totalInstructions = roots.length;
  const countChildren = (node: CpiNode, depth: number) => {
    if (depth > maxDepth) maxDepth = depth;
    for (const child of node.children) {
      totalInstructions++;
      countChildren(child, depth + 1);
    }
  };
  for (const r of roots) countChildren(r, 0);

  return {
    roots,
    allProgramIds: [...programIdSet],
    maxDepth,
    totalInstructions,
  };
}

function buildCpiChildren(
  instructions: InnerInstruction["instructions"],
  accountKeys: ReturnType<VersionedTransaction["message"]["getAccountKeys"]>,
  programIdSet: Set<string>,
): CpiNode[] {
  const children: CpiNode[] = [];

  for (let i = 0; i < instructions.length; i++) {
    const ix = instructions[i]!;
    const pid = accountKeys.get(ix.programIdIndex);
    const programId = pid?.toBase58() ?? `unknown-${ix.programIdIndex}`;
    programIdSet.add(programId);

    const depth = ix.stackHeight != null ? ix.stackHeight - 1 : 1;

    children.push({
      programId,
      instructionIndex: i,
      depth,
      children: [],
      data: ix.data,
      accounts: ix.accounts.map((idx) => accountKeys.get(idx)?.toBase58() ?? `unknown-${idx}`),
    });
  }

  return nestByStackHeight(children);
}

function nestByStackHeight(flat: CpiNode[]): CpiNode[] {
  if (flat.length === 0) return [];

  const result: CpiNode[] = [];
  const stack: CpiNode[] = [];

  for (const node of flat) {
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= node.depth) {
      stack.pop();
    }

    if (stack.length > 0) {
      stack[stack.length - 1]!.children.push(node);
    } else {
      result.push(node);
    }

    stack.push(node);
  }

  return result;
}

function extractProgramIdsFromLogs(logs: string[]): string[] {
  const ids: string[] = [];
  const invokeRe = /Program (\w{32,44}) invoke/;
  for (const line of logs) {
    const m = invokeRe.exec(line);
    if (m?.[1]) ids.push(m[1]);
  }
  return ids;
}
