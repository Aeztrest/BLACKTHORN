import type { RiskFinding } from "../../domain/findings.js";
import { getReputationDb } from "../../data/reputation-db.js";

export function detectReputationFindings(
  programIds: string[],
  accountAddresses: string[],
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const db = getReputationDb();

  const allAddresses = new Set([...programIds, ...accountAddresses]);
  const hits = db.lookupMany([...allAddresses]);

  for (const [address, entry] of hits) {
    findings.push({
      code: "KNOWN_MALICIOUS_ADDRESS",
      severity: entry.severity,
      message: `Address ${address} is flagged: ${entry.label} (${entry.category})`,
      details: {
        address,
        label: entry.label,
        category: entry.category,
        source: entry.source,
      },
    });
  }

  return findings;
}
