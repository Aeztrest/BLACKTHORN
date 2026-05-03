import { ApiErrorState } from "@/components/api-state";
import { AuditRecentTable } from "@/components/audit-recent-table";
import { getAuditRecent } from "@/lib/api/client";

export const dynamic = "force-dynamic";

async function loadAuditData() {
  try {
    const recent = await getAuditRecent(100);
    return { ok: true as const, recent };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.",
    };
  }
}

export default async function AuditPage() {
  const result = await loadAuditData();

  if (!result.ok) {
    return (
      <div className="px-4 lg:px-6">
        <ApiErrorState title="Audit kayıtları alınamadı" message={result.error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Audit</h2>
        <p className="text-sm text-muted-foreground">
          Son analiz kayıtları ve karar detayları.
        </p>
      </div>
      <AuditRecentTable entries={result.recent.entries} />
    </div>
  );
}
