import type { AnalyzeDeps } from "../application/analyze-transaction.js";
import { analyzeTransaction } from "../application/analyze-transaction.js";
import type { AnalyzeRequestBody } from "../domain/policy.js";
import type { Decision } from "../domain/decision.js";
import type { Cluster } from "../config/index.js";
import { getPolicyProfileStore } from "../policy/profiles.js";

export type McpToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function getMcpToolDescriptors(): McpToolDescriptor[] {
  return [
    {
      name: "deltag_analyze",
      description:
        "Analyze a Solana VersionedTransaction for security risks before signing. " +
        "Returns safe/unsafe verdict, risk findings, estimated balance changes, " +
        "human-readable transaction summary, and CPI trace.",
      inputSchema: {
        type: "object",
        properties: {
          transactionBase64: {
            type: "string",
            description: "Base64-encoded Solana VersionedTransaction",
          },
          cluster: {
            type: "string",
            enum: ["mainnet-beta", "devnet", "testnet"],
            description: "Solana cluster to simulate against",
            default: "mainnet-beta",
          },
          userWallet: {
            type: "string",
            description: "Optional wallet public key for user-specific analysis",
          },
          policyProfile: {
            type: "string",
            description: "Optional policy profile ID (strict, defi-permissive, monitor-only)",
          },
        },
        required: ["transactionBase64"],
      },
    },
    {
      name: "deltag_health",
      description: "Check DeltaG service health and available RPC clusters",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "deltag_list_profiles",
      description: "List available policy profiles for transaction analysis",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];
}

export async function handleMcpToolCall(
  toolName: string,
  args: Record<string, unknown>,
  deps: AnalyzeDeps,
): Promise<McpToolResult> {
  try {
    switch (toolName) {
      case "deltag_analyze":
        return await handleAnalyze(args, deps);
      case "deltag_health":
        return handleHealth(deps);
      case "deltag_list_profiles":
        return handleListProfiles();
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}

async function handleAnalyze(
  args: Record<string, unknown>,
  deps: AnalyzeDeps,
): Promise<McpToolResult> {
  const body: AnalyzeRequestBody = {
    cluster: (args.cluster as Cluster) ?? "mainnet-beta",
    transactionBase64: args.transactionBase64 as string,
    userWallet: args.userWallet as string | undefined,
    policy: {},
  };

  const decision: Decision = await analyzeTransaction(body, deps);

  const summary = formatDecisionForAgent(decision);
  return { content: [{ type: "text", text: summary }] };
}

function handleHealth(deps: AnalyzeDeps): McpToolResult {
  const clusters = Object.entries(deps.config.rpcByCluster)
    .filter(([, url]) => url)
    .map(([cluster]) => cluster);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ status: "ok", availableClusters: clusters }, null, 2),
    }],
  };
}

function handleListProfiles(): McpToolResult {
  const store = getPolicyProfileStore();
  const profiles = store.list().map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    ruleCount: p.rules.length,
  }));
  return {
    content: [{ type: "text", text: JSON.stringify(profiles, null, 2) }],
  };
}

function formatDecisionForAgent(decision: Decision): string {
  const parts: string[] = [];

  parts.push(`## Transaction Analysis Result`);
  parts.push(`**Verdict**: ${decision.safe ? "SAFE" : "BLOCKED"}`);
  parts.push(`**Confidence**: ${decision.meta.confidence}`);

  if (decision.annotation?.summary) {
    parts.push(`**Summary**: ${decision.annotation.summary.humanReadable}`);
    parts.push(`**Programs**: ${decision.annotation.summary.involvedPrograms.join(", ")}`);
  }

  if (decision.reasons.length > 0) {
    parts.push(`\n### Reasons`);
    for (const r of decision.reasons) parts.push(`- ${r}`);
  }

  if (decision.riskFindings.length > 0) {
    parts.push(`\n### Risk Findings`);
    for (const f of decision.riskFindings) {
      parts.push(`- **[${f.severity.toUpperCase()}]** ${f.code}: ${f.message}`);
    }
  }

  const solChanges = decision.estimatedChanges.sol.filter((s) => s.deltaLamports && s.deltaLamports !== 0);
  if (solChanges.length > 0) {
    parts.push(`\n### SOL Changes`);
    for (const s of solChanges) {
      const delta = (s.deltaLamports ?? 0) / 1e9;
      parts.push(`- ${s.account.slice(0, 8)}...: ${delta > 0 ? "+" : ""}${delta.toFixed(6)} SOL`);
    }
  }

  const tokenChanges = decision.estimatedChanges.tokens.filter((t) => t.delta !== "0");
  if (tokenChanges.length > 0) {
    parts.push(`\n### Token Changes`);
    for (const t of tokenChanges) {
      parts.push(`- ${t.mint.slice(0, 8)}... owner:${t.owner?.slice(0, 8)}...: delta ${t.delta}`);
    }
  }

  if (decision.annotation?.cpiTrace) {
    const cpi = decision.annotation.cpiTrace;
    parts.push(`\n### CPI Trace`);
    parts.push(`- Total instructions: ${cpi.totalInstructions}, Max depth: ${cpi.maxDepth}`);
    parts.push(`- All programs: ${cpi.allProgramIds.join(", ")}`);
  }

  parts.push(`\n---`);
  parts.push(`Cluster: ${decision.meta.cluster} | Version: ${decision.meta.analysisVersion} | At: ${decision.meta.simulatedAt}`);

  return parts.join("\n");
}
