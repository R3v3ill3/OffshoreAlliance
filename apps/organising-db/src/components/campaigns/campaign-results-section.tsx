"use client";

import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActionResultType } from "@/types/database";

interface ResultRow {
  result_id: number;
  result_type: ActionResultType;
  notes: string | null;
  action_date: string;
  worker: { worker_id: number; first_name: string; last_name: string } | null;
  action: { action_id: number; title: string } | null;
}

const RESULT_TYPE_VARIANT: Record<
  ActionResultType,
  "success" | "secondary" | "destructive" | "info" | "warning" | "default"
> = {
  contacted: "success",
  not_home: "secondary",
  refused: "destructive",
  signed: "success",
  attended: "info",
  left_message: "warning",
  wrong_number: "secondary",
  moved: "secondary",
  other: "default",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

interface CampaignResultsSectionProps {
  results: ResultRow[];
}

export function CampaignResultsSection({ results }: CampaignResultsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Campaign Results</CardTitle>
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No results recorded yet.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.result_id}>
                    <TableCell className="font-medium">
                      {r.worker
                        ? `${r.worker.first_name} ${r.worker.last_name}`
                        : "—"}
                    </TableCell>
                    <TableCell>{r.action?.title ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={RESULT_TYPE_VARIANT[r.result_type] ?? "default"}
                      >
                        {r.result_type.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(r.action_date)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {r.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
