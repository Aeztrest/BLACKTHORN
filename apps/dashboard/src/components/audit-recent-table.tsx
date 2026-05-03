import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditEntry } from "@/lib/api/types";

function formatDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("tr-TR");
}

export function AuditRecentTable({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="px-4 lg:px-6">
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Henüz audit kaydı yok.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-6">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zaman</TableHead>
              <TableHead>Cluster</TableHead>
              <TableHead>Karar</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Primary Action</TableHead>
              <TableHead>Risk Kodları</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap">{formatDate(entry.timestamp)}</TableCell>
                <TableCell>{entry.cluster}</TableCell>
                <TableCell>
                  <Badge variant={entry.safe ? "secondary" : "destructive"}>
                    {entry.safe ? "SAFE" : "BLOCKED"}
                  </Badge>
                </TableCell>
                <TableCell>{entry.confidence}</TableCell>
                <TableCell>{entry.primaryAction}</TableCell>
                <TableCell className="max-w-72 truncate">
                  {entry.riskCodes.length > 0 ? entry.riskCodes.join(", ") : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
