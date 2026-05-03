import type { RiskFinding } from "../domain/findings.js";
import type { EstimatedChanges } from "../domain/estimated-changes.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";

export type RuleOperator = "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "in" | "not_in" | "contains" | "exists";
export type RuleAction = "allow" | "block" | "warn";

export type RuleCondition = {
  field: string;
  operator: RuleOperator;
  value: unknown;
};

export type PolicyRule = {
  id: string;
  name: string;
  conditions: RuleCondition[];
  action: RuleAction;
  reason: string;
  priority: number;
};

export type PolicyProfile = {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  createdAt: string;
  updatedAt: string;
};

export type RuleContext = {
  simulation: NormalizedSimulation;
  estimatedChanges: EstimatedChanges;
  riskFindings: RiskFinding[];
  programIds: string[];
  userWallet: string | null;
  solLossPercent: number | null;
  totalTokenChanges: number;
};

export function evaluateRules(rules: PolicyRule[], ctx: RuleContext): {
  action: RuleAction;
  triggeredRules: Array<{ rule: PolicyRule; action: RuleAction }>;
  reasons: string[];
} {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const triggered: Array<{ rule: PolicyRule; action: RuleAction }> = [];
  const reasons: string[] = [];
  let finalAction: RuleAction = "allow";

  for (const rule of sorted) {
    if (evaluateConditions(rule.conditions, ctx)) {
      triggered.push({ rule, action: rule.action });
      if (rule.action === "block") {
        finalAction = "block";
        reasons.push(rule.reason);
      } else if (rule.action === "warn" && finalAction !== "block") {
        finalAction = "warn";
        reasons.push(rule.reason);
      }
    }
  }

  return { action: finalAction, triggeredRules: triggered, reasons };
}

function evaluateConditions(conditions: RuleCondition[], ctx: RuleContext): boolean {
  return conditions.every((c) => evaluateCondition(c, ctx));
}

function evaluateCondition(cond: RuleCondition, ctx: RuleContext): boolean {
  const value = resolveField(cond.field, ctx);

  switch (cond.operator) {
    case "eq": return value === cond.value;
    case "neq": return value !== cond.value;
    case "gt": return typeof value === "number" && typeof cond.value === "number" && value > cond.value;
    case "lt": return typeof value === "number" && typeof cond.value === "number" && value < cond.value;
    case "gte": return typeof value === "number" && typeof cond.value === "number" && value >= cond.value;
    case "lte": return typeof value === "number" && typeof cond.value === "number" && value <= cond.value;
    case "in": return Array.isArray(cond.value) && cond.value.includes(value);
    case "not_in": return Array.isArray(cond.value) && !cond.value.includes(value);
    case "contains": return Array.isArray(value) && value.includes(cond.value);
    case "exists": return value != null;
    default: return false;
  }
}

function resolveField(field: string, ctx: RuleContext): unknown {
  switch (field) {
    case "simulation.status": return ctx.simulation.status;
    case "simulation.unitsConsumed": return ctx.simulation.unitsConsumed;
    case "solLossPercent": return ctx.solLossPercent;
    case "totalTokenChanges": return ctx.totalTokenChanges;
    case "programIds": return ctx.programIds;
    case "userWallet": return ctx.userWallet;
    case "riskFindings.codes": return ctx.riskFindings.map((f) => f.code);
    case "riskFindings.count": return ctx.riskFindings.length;
    case "riskFindings.highCount": return ctx.riskFindings.filter((f) => f.severity === "high").length;
    case "estimatedChanges.sol.count": return ctx.estimatedChanges.sol.length;
    case "estimatedChanges.tokens.count": return ctx.estimatedChanges.tokens.length;
    case "estimatedChanges.approvals.count": return ctx.estimatedChanges.approvals.length;
    case "estimatedChanges.delegates.count": return ctx.estimatedChanges.delegates.length;
    default: return undefined;
  }
}

export const BUILTIN_PROFILES: PolicyProfile[] = [
  {
    id: "strict",
    name: "Strict",
    description: "Maximum security — blocks any unknown program, approval change, or simulation failure",
    rules: [
      {
        id: "strict-sim-fail",
        name: "Block failed simulation",
        conditions: [{ field: "simulation.status", operator: "eq", value: "failed" }],
        action: "block",
        reason: "Simulation failed",
        priority: 100,
      },
      {
        id: "strict-approvals",
        name: "Block approval changes",
        conditions: [{ field: "estimatedChanges.approvals.count", operator: "gt", value: 0 }],
        action: "block",
        reason: "Approval changes detected",
        priority: 90,
      },
      {
        id: "strict-high-risk",
        name: "Block high risk findings",
        conditions: [{ field: "riskFindings.highCount", operator: "gt", value: 0 }],
        action: "block",
        reason: "High severity risk findings detected",
        priority: 95,
      },
    ],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "defi-permissive",
    name: "DeFi Permissive",
    description: "Allows common DeFi operations while blocking known threats",
    rules: [
      {
        id: "defi-sim-fail",
        name: "Block failed simulation",
        conditions: [{ field: "simulation.status", operator: "eq", value: "failed" }],
        action: "block",
        reason: "Simulation failed",
        priority: 100,
      },
      {
        id: "defi-malicious",
        name: "Block known malicious",
        conditions: [{ field: "riskFindings.codes", operator: "contains", value: "KNOWN_MALICIOUS_ADDRESS" }],
        action: "block",
        reason: "Known malicious address interaction",
        priority: 99,
      },
      {
        id: "defi-high-loss",
        name: "Warn on high loss",
        conditions: [{ field: "solLossPercent", operator: "gt", value: 50 }],
        action: "warn",
        reason: "Estimated SOL loss exceeds 50%",
        priority: 80,
      },
    ],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "monitor-only",
    name: "Monitor Only",
    description: "Never blocks — returns findings and warnings for monitoring dashboards",
    rules: [],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
];
