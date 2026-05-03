import { ApiErrorState } from "@/components/api-state";
import { OverviewCards } from "@/components/overview-cards";
import { RiskAnalytics } from "@/components/risk-analytics";
import { getAuditAggregate, getHealth, getReady } from "@/lib/api/client";

export const dynamic = "force-dynamic";

async function loadOverviewData() {
  try {
    const [health, ready, aggregate] = await Promise.all([
      getHealth(),
      getReady(),
      getAuditAggregate(),
    ]);
    return { ok: true as const, health, ready, aggregate };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.",
    };
  }
}

export default async function OverviewPage() {
  const result = await loadOverviewData();

  if (!result.ok) {
    return (
      <div className="px-4 lg:px-6">
        <ApiErrorState title="Overview verisi alınamadı" message={result.error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
        <p className="text-sm text-muted-foreground">
          Health, readiness ve audit metriklerini tek ekranda izleyin.
        </p>
      </div>
      <OverviewCards health={result.health} ready={result.ready} aggregate={result.aggregate} />
      <RiskAnalytics aggregate={result.aggregate} />
    </div>
  );
}
