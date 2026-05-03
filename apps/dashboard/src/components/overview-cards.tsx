import { CheckCircle2Icon, ShieldAlertIcon, ShieldCheckIcon, TimerIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AggregateInsight, HealthResponse, ReadyResponse } from "@/lib/api/types";

function readinessLabel(ready: ReadyResponse) {
  return ready.status === "ready" ? "READY" : "DEGRADED";
}

export function OverviewCards({
  health,
  ready,
  aggregate,
}: {
  health: HealthResponse;
  ready: ReadyResponse;
  aggregate: AggregateInsight;
}) {
  const checks = ready.checks ? Object.values(ready.checks) : [];
  const passedChecks = checks.filter((c) => c.ok).length;
  const successRate =
    aggregate.totalAnalyses > 0
      ? (aggregate.safeCount / aggregate.totalAnalyses) * 100
      : 0;

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader>
          <CardDescription>Health</CardDescription>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2Icon className="size-4 text-emerald-500" />
            {health.status.toUpperCase()}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Readiness</CardDescription>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-blue-500" />
            {readinessLabel(ready)}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {checks.length > 0 ? `${passedChecks}/${checks.length} check başarılı` : "Check verisi yok"}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Toplam Analiz</CardDescription>
          <CardTitle className="flex items-center gap-2">
            <TimerIcon className="size-4 text-violet-500" />
            {aggregate.totalAnalyses}
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Safe Oranı</CardDescription>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="size-4 text-amber-500" />
            %{successRate.toFixed(1)}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Safe: {aggregate.safeCount} / Blocked: {aggregate.blockedCount}
        </CardContent>
      </Card>
    </div>
  );
}
