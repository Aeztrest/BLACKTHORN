import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AggregateInsight } from "@/lib/api/types";

export function RiskAnalytics({ aggregate }: { aggregate: AggregateInsight }) {
  const topRisks = aggregate.topRiskCodes.slice(0, 5);
  const blockedPrograms = aggregate.topBlockedPrograms.slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Top Risk Kodları</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topRisks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Risk kodu verisi bulunamadı.</p>
          ) : (
            topRisks.map((risk) => (
              <div key={risk.code} className="flex items-center justify-between text-sm">
                <span className="font-medium">{risk.code}</span>
                <span className="text-muted-foreground">{risk.count}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>En Çok Bloklanan Programlar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {blockedPrograms.length === 0 ? (
            <p className="text-sm text-muted-foreground">Program bazlı blok kaydı bulunamadı.</p>
          ) : (
            blockedPrograms.map((program) => (
              <div key={program.programId} className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate font-medium">{program.programId}</span>
                <span className="shrink-0 text-muted-foreground">{program.count}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
