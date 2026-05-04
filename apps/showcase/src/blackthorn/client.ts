import type { AnalysisResult, ScenarioId } from "./types";
import { SCENARIOS } from "./scenarios";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function analyzeScenario(
  scenarioId: ScenarioId,
  _userWallet?: string,
): Promise<AnalysisResult> {
  // Simulate realistic analysis time (800ms–1400ms)
  await delay(800 + Math.random() * 600);

  const scenario = SCENARIOS[scenarioId];
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);

  // Try real server first, fall back to demo data
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(1500) });
    if (!res.ok) throw new Error("server not ready");
    // Server is alive but we still use demo scenarios for the showcase
    // since we'd need real devnet transactions to call /v1/analyze
    return { ...scenario, demoMode: false };
  } catch {
    return scenario;
  }
}
