import { ApiErrorState } from "@/components/api-state";
import { RiskAnalytics } from "@/components/risk-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuditAggregate } from "@/lib/api/client";

export const dynamic = "force-dynamic";

async function loadRiskData() {
  try {
    const aggregate = await getAuditAggregate();
    return { ok: true as const, aggregate };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.",
    };
  }
}

export default async function RiskPage() {
  const result = await loadRiskData();

  if (!result.ok) {
    return (
      <div className="px-4 lg:px-6">
        <ApiErrorState title="Risk analitiği alınamadı" message={result.error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Risk Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Risk kodu dağılımı ve en çok bloklanan programlar.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Analyses</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums">
            {result.aggregate.totalAnalyses}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Safe</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums text-emerald-600">
            {result.aggregate.safeCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Blocked</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold tabular-nums text-rose-600">
            {result.aggregate.blockedCount}
          </CardContent>
        </Card>
      </div>

      <RiskAnalytics aggregate={result.aggregate} />
    </div>
  );
}
