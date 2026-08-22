"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api/fetch-api";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import type { CampaignDataField, FactCategory } from "@/lib/campaign-facts/types";
import { FACT_CATEGORY_LABELS } from "@/lib/campaign-facts/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Download } from "lucide-react";

type ReportBucket = { key: string; count: number };
type ReportGroup = { label: string; buckets: ReportBucket[] };

type ReportField = {
  field: CampaignDataField;
  answered: number;
  buckets: ReportBucket[];
  suggested_heat: 1 | 2 | 3 | 4 | 5 | null;
  by_worksite?: ReportGroup[];
  by_occupation?: ReportGroup[];
};

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Breakdown({ title, groups }: { title: string; groups: ReportGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="text-xs space-y-1">
        {groups.map((g) => (
          <li key={g.label}>
            <span className="font-medium">{g.label}</span>
            <span className="text-muted-foreground">
              {" "}
              — {g.buckets.map((b) => `${b.key || "(blank)"} ${b.count}`).join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CampaignFactsReport({
  campaignId,
  category,
  canWrite,
}: {
  campaignId: string;
  category: FactCategory | null;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const qs = category ? `?category=${category}` : "";
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-facts-report", campaignId, category],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/facts/report${qs}`);
      if (!res.ok) throw new Error("Failed to load report");
      return (await res.json()) as { fields: ReportField[] };
    },
  });

  const suggest = useAuthAwareMutation({
    mutationFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/facts/suggest-top-issues`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Suggest failed");
      return json as { added: number; labels?: string[]; message?: string };
    },
    onSuccess: (json) => {
      if (json.added === 0) toast.message(json.message || "Nothing to add");
      else toast.success(`Added ${json.added} issue(s) to situation analysis`);
      queryClient.invalidateQueries({ queryKey: ["situation-analysis"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rows = data?.fields ?? [];
  const showSuggest =
    canWrite && (category === "claims" || category == null) &&
    rows.some((r) => r.field.category === "claims" && r.suggested_heat != null);

  function exportDistribution() {
    downloadCsv(
      `campaign-${campaignId}-facts-distribution.csv`,
      ["Field", "Category", "Answered", "Value", "Count"],
      rows.flatMap((r) =>
        (r.buckets.length > 0 ? r.buckets : [{ key: "", count: 0 }]).map((b) => [
          r.field.label,
          r.field.category,
          String(r.answered),
          b.key,
          String(b.count),
        ])
      )
    );
  }

  async function exportWorkers() {
    const res = await fetchApi(`/api/campaigns/${campaignId}/facts/export${qs}`);
    if (!res.ok) {
      toast.error("Failed to export workers");
      return;
    }
    const json = (await res.json()) as {
      fields: { field_id: number; label: string }[];
      workers: {
        worker_id: number;
        first_name: string;
        last_name: string;
        occupation: string;
        worksite_name: string;
        values: Record<string, string>;
      }[];
    };
    downloadCsv(
      `campaign-${campaignId}-facts-workers.csv`,
      [
        "Worker ID",
        "First name",
        "Last name",
        "Occupation",
        "Worksite",
        ...json.fields.map((f) => f.label),
      ],
      json.workers.map((w) => [
        String(w.worker_id),
        w.first_name,
        w.last_name,
        w.occupation,
        w.worksite_name,
        ...json.fields.map((f) => w.values[String(f.field_id)] ?? ""),
      ])
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Distribution</CardTitle>
          <CardDescription>
            Counts of recorded values. Wall-chart colour is unchanged.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportDistribution} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" aria-hidden />
            Distribution CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => void exportWorkers()}>
            <Download className="h-3.5 w-3.5 mr-1" aria-hidden />
            Worker CSV
          </Button>
          {showSuggest && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => suggest.mutate()}
              disabled={suggest.isPending}
            >
              Suggest top issues from ranks
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading report…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fields in this category.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <div key={r.field.field_id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{r.field.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {FACT_CATEGORY_LABELS[r.field.category]} · {r.answered} answered
                      {r.suggested_heat != null && (
                        <> · suggested heat {r.suggested_heat}</>
                      )}
                    </p>
                  </div>
                </div>
                {r.buckets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No values yet.</p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {r.buckets.map((b) => (
                      <li key={b.key} className="flex justify-between gap-2">
                        <span className="truncate">{b.key || "(blank)"}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {b.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {(r.field.category === "compliance" || category === "compliance") && (
                  <div className="grid gap-3 sm:grid-cols-2 pt-1">
                    <Breakdown title="By worksite" groups={r.by_worksite ?? []} />
                    <Breakdown title="By occupation" groups={r.by_occupation ?? []} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
