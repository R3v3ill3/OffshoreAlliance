"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { TermHint } from "@/components/ui/term-hint";

type HierarchyMode = "geo_service" | "producer_geo";

type ReportRow = {
  worksite_id: number;
  hierarchy_path: string;
  producer: string;
  geo: string;
  service_type: string;
  worksite: string;
  provider: string;
  provider_roles: string;
  scopes: string;
};

type HierarchySourceRow = {
  worksite_id: number;
  worksite_name: string;
  geo: string;
  service_type: string;
  producer_name: string;
  provider_name: string;
  provider_roles: string;
  scope_names: string;
  hierarchy_path_geo_service: string;
  hierarchy_path_producer_geo: string;
};

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function WorksiteHierarchyExplorer() {
  const supabase = createClient();
  // Use a flexible query client here so we can read freshly-added reporting views
  // before regenerated db types are committed.
  const reportingClient = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options?: { ascending?: boolean }) => Promise<{
          data: unknown[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const [mode, setMode] = useState<HierarchyMode>("geo_service");

  const { data: sourceRows = [], isLoading } = useQuery({
    queryKey: ["worksite-hierarchy-report-rows"],
    queryFn: async () => {
      const { data, error } = await reportingClient
        .from("worksite_hierarchy_report_rows")
        .select("*")
        .order("hierarchy_path_geo_service", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HierarchySourceRow[];
    },
  });

  const rows = useMemo<ReportRow[]>(() => {
    return sourceRows
      .map((row) => ({
        worksite_id: row.worksite_id,
        hierarchy_path:
          mode === "geo_service"
            ? row.hierarchy_path_geo_service
            : row.hierarchy_path_producer_geo,
        producer: row.producer_name,
        geo: row.geo,
        service_type: row.service_type,
        worksite: row.worksite_name,
        provider: row.provider_name,
        provider_roles: row.provider_roles,
        scopes: row.scope_names,
      }))
      .sort((a, b) => {
        if (a.hierarchy_path !== b.hierarchy_path) {
          return a.hierarchy_path.localeCompare(b.hierarchy_path);
        }
        return a.provider.localeCompare(b.provider);
      });
  }, [mode, sourceRows]);

  const groupedPreview = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!groups.has(row.hierarchy_path)) groups.set(row.hierarchy_path, new Set<string>());
      groups.get(row.hierarchy_path)!.add(row.provider);
    }
    return Array.from(groups.entries())
      .map(([path, providers]) => ({ path, providerCount: providers.size }))
      .sort((a, b) => b.providerCount - a.providerCount || a.path.localeCompare(b.path))
      .slice(0, 24);
  }, [rows]);

  const exportCsv = () => {
    const headers = [
      "Hierarchy Path",
      "Producer",
      "Geo",
      "Service Type",
      "Worksite",
      "Provider",
      "Provider Roles",
      "Scopes",
    ];
    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) =>
        [
          row.hierarchy_path,
          row.producer,
          row.geo,
          row.service_type,
          row.worksite,
          row.provider,
          row.provider_roles,
          row.scopes,
        ]
          .map(csvEscape)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `worksite-hierarchy-report-${mode}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <EurekaLoadingSpinner size="lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hierarchy Mode</CardTitle>
          <CardDescription>
            Switch between the two reporting hierarchies from your mapping document.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as HierarchyMode)}
          >
            <SelectTrigger className="w-[420px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="geo_service">
                Onshore/Offshore {"->"} Service Type {"->"} Company {"->"} Worksite
              </SelectItem>
              <SelectItem value="producer_geo">
                Production Company {"->"} Onshore/Offshore {"->"} Worksite
              </SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
          <Badge variant="secondary">{rows.length} provider rows</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hierarchy Preview</CardTitle>
          <CardDescription>
            Top hierarchy paths with provider coverage counts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {groupedPreview.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hierarchy paths found.</p>
          ) : (
            groupedPreview.map((item) => (
              <div
                key={item.path}
                className="rounded border px-3 py-2 flex items-center justify-between gap-3"
              >
                <span className="text-sm break-all">{item.path}</span>
                <Badge variant="secondary">{item.providerCount} providers</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider Scope Rows</CardTitle>
          <CardDescription className="space-y-1">
            <span className="block">
              Each row maps a provider to a worksite path with current role(s) and scope(s).
            </span>
            <span className="block">
              <TermHint
                term="Scope mapping"
                hint="Scopes come from current worksite_scopes entries matching the provider and worksite."
              />
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[420px] overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Hierarchy Path</th>
                  <th className="text-left p-2 font-medium">Provider</th>
                  <th className="text-left p-2 font-medium">Roles</th>
                  <th className="text-left p-2 font-medium">Scopes</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((row, idx) => (
                  <tr key={`${row.hierarchy_path}:${row.provider}:${idx}`} className="border-t">
                    <td className="p-2 align-top">{row.hierarchy_path}</td>
                    <td className="p-2 align-top">{row.provider}</td>
                    <td className="p-2 align-top">{row.provider_roles}</td>
                    <td className="p-2 align-top">{row.scopes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 500 && (
            <p className="text-xs text-muted-foreground mt-2">
              Showing first 500 rows in UI for performance. Use Export CSV for complete output.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
