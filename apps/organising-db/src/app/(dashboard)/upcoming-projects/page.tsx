"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ExternalLink, RefreshCcw, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useUpcomingProjects,
  type MatchStatus,
  type UpcomingProjectRow,
} from "@/lib/hooks/useUpcomingProjects";
import { useRefreshUpcomingProjects } from "@/lib/hooks/useRefreshUpcomingProjects";
import { useRematchUpcomingProjects } from "@/lib/hooks/useRematchUpcomingProjects";
import { MatchReviewPanel } from "./_components/match-review-panel";
import {
  UpcomingProjectsFilterBar,
  type StatusFilter,
  type JurisdictionFilter,
} from "./_components/filter-bar";
import { UpcomingProjectsCalendar } from "./_components/upcoming-projects-calendar";

const MATCH_VARIANTS: Record<MatchStatus, "success" | "warning" | "destructive" | "info" | "outline"> = {
  auto: "success",
  confirmed: "success",
  needs_review: "warning",
  unmatched: "destructive",
  overridden: "info",
  rejected: "outline",
};

const MATCH_LABELS: Record<MatchStatus, string> = {
  auto: "Auto",
  confirmed: "Confirmed",
  needs_review: "Review",
  unmatched: "Unmatched",
  overridden: "Overridden",
  rejected: "Rejected",
};

const LIFECYCLE_VARIANTS: Record<string, "success" | "warning" | "destructive" | "secondary" | "info"> = {
  exploration: "secondary",
  production: "success",
  decommissioning: "destructive",
  development: "info",
  appraisal: "warning",
};

function lifecycleVariant(value: string | null) {
  if (!value) return "outline" as const;
  const key = value.toLowerCase();
  for (const [k, v] of Object.entries(LIFECYCLE_VARIANTS)) {
    if (key.includes(k)) return v;
  }
  return "outline" as const;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

export default function UpcomingProjectsPage() {
  const { isAdmin } = useAuth();
  const { data, isLoading, error } = useUpcomingProjects();
  const refreshMutation = useRefreshUpcomingProjects();
  const rematchMutation = useRematchUpcomingProjects();

  const [jurisdictionFilter, setJurisdictionFilter] = useState<JurisdictionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [lifecycleFilter, setLifecycleFilter] = useState<Set<string>>(new Set());
  const [selectedRow, setSelectedRow] = useState<UpcomingProjectRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useState<"table" | "calendar">("table");

  const counts = useMemo(() => {
    const c = { needs_review: 0, unmatched: 0, total: 0 };
    for (const row of data ?? []) {
      c.total += 1;
      const s = row.match?.match_status;
      if (s === "needs_review") c.needs_review += 1;
      else if (s === "unmatched") c.unmatched += 1;
    }
    return c;
  }, [data]);

  // Distinct lifecycle values present in the loaded data — drives the
  // filter chips so they match whatever NOPSEMA actually returns.
  const lifecycleOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of data ?? []) {
      if (row.lifecycle_classification) seen.add(row.lifecycle_classification);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const toggleLifecycle = (value: string) =>
    setLifecycleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const clearLifecycle = () => setLifecycleFilter(new Set());

  const filtered = useMemo<UpcomingProjectRow[]>(() => {
    let rows = data ?? [];
    if (jurisdictionFilter !== "all") {
      rows = rows.filter((r) => r.jurisdiction === jurisdictionFilter);
    }
    if (statusFilter !== "all") {
      rows = rows.filter((r) => {
        const s = r.match?.match_status ?? "unmatched";
        if (statusFilter === "review_or_unmatched") {
          return s === "needs_review" || s === "unmatched";
        }
        return s === statusFilter;
      });
    }
    if (lifecycleFilter.size > 0) {
      rows = rows.filter((r) =>
        r.lifecycle_classification
          ? lifecycleFilter.has(r.lifecycle_classification)
          : false
      );
    }
    return rows;
  }, [data, jurisdictionFilter, statusFilter, lifecycleFilter]);

  const openRow = (row: UpcomingProjectRow) => {
    setSelectedRow(row);
    setPanelOpen(true);
  };

  const columns: Column<UpcomingProjectRow>[] = [
    {
      key: "jurisdiction",
      header: "Jur.",
      render: (r) =>
        r.jurisdiction ? (
          <Badge variant={r.jurisdiction === "WA" ? "info" : "warning"}>
            {r.jurisdiction}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "title",
      header: "Activity",
      render: (r) => (
        <div>
          <div className="font-medium">{r.title ?? "Untitled"}</div>
          {r.project_name && (
            <div className="text-xs text-muted-foreground">{r.project_name}</div>
          )}
        </div>
      ),
    },
    {
      key: "organisation",
      header: "Organisation (scraped)",
      sortable: true,
      render: (r) => r.organisation ?? "—",
    },
    {
      key: "match",
      header: "Matched employer",
      render: (r) => {
        const m = r.match;
        if (!m) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex flex-col gap-1">
            <Badge variant={MATCH_VARIANTS[m.match_status]} className="self-start">
              {MATCH_LABELS[m.match_status]}
            </Badge>
            {m.matched_employer && (
              <span className="text-xs">{m.matched_employer.employer_name}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "activity_type",
      header: "Type",
      render: (r) => r.activity_type ?? "—",
    },
    {
      key: "lifecycle_classification",
      header: "Lifecycle",
      render: (r) =>
        r.lifecycle_classification ? (
          <Badge variant={lifecycleVariant(r.lifecycle_classification)}>
            {r.lifecycle_classification}
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      key: "start_date",
      header: "Start",
      sortable: true,
      render: (r) => formatDate(r.start_date),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => r.status ?? "—",
    },
    {
      key: "source_url",
      header: "Source",
      render: (r) => (
        <a
          href={r.source_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
        >
          NOPSEMA
          <ExternalLink className="h-3 w-3" />
        </a>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Upcoming Projects</h1>
          <p className="text-sm text-muted-foreground">
            Approved offshore activities from regulator data (WA + NT). Updates run nightly.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={rematchMutation.isPending || refreshMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Re-evaluate every unconfirmed match using the current matcher? Confirmed/overridden/rejected rows will not be touched."
                  )
                ) {
                  rematchMutation.mutate();
                }
              }}
              title="Re-run the matcher against existing rows. Skips confirmed / overridden / rejected matches."
            >
              {rematchMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {rematchMutation.isPending ? "Re-evaluating…" : "Re-evaluate matches"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={refreshMutation.isPending || rematchMutation.isPending}
              onClick={() => refreshMutation.mutate()}
            >
              {refreshMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4 mr-2" />
              )}
              {refreshMutation.isPending ? "Scraping…" : "Refresh now"}
            </Button>
          </div>
        )}
      </div>

      {refreshMutation.isError && (
        <p className="text-sm text-destructive">
          Refresh failed: {(refreshMutation.error as Error).message}
        </p>
      )}
      {refreshMutation.isSuccess && (
        <p className="text-sm text-muted-foreground">
          Scrape complete. Showing latest data.
        </p>
      )}
      {rematchMutation.isError && (
        <p className="text-sm text-destructive">
          Re-evaluate failed: {(rematchMutation.error as Error).message}
        </p>
      )}
      {rematchMutation.isSuccess && rematchMutation.data && (
        <p className="text-sm text-muted-foreground">
          Re-evaluated {rematchMutation.data.total} rows: {rematchMutation.data.auto} auto-matched
          , {rematchMutation.data.needs_review} need review, {rematchMutation.data.unmatched} unmatched
          {rematchMutation.data.skipped > 0
            ? ` (${rematchMutation.data.skipped} skipped — admin decisions left in place)`
            : ""}
          .
          {rematchMutation.data.errors && rematchMutation.data.errors.length > 0 && (
            <span className="text-destructive">
              {" "}
              {rematchMutation.data.errors.length} row(s) errored — first:{" "}
              {rematchMutation.data.errors[0]}
            </span>
          )}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">
          Failed to load: {(error as Error).message}
        </p>
      )}

      {/* Shared filter bar — applies to both Table and Calendar */}
      <UpcomingProjectsFilterBar
        jurisdiction={jurisdictionFilter}
        onJurisdictionChange={setJurisdictionFilter}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        lifecycleOptions={lifecycleOptions}
        lifecycleSelected={lifecycleFilter}
        onLifecycleToggle={toggleLifecycle}
        onLifecycleClear={clearLifecycle}
        needsReviewCount={counts.needs_review}
        unmatchedCount={counts.unmatched}
      />

      <Tabs value={view} onValueChange={(v) => setView(v as "table" | "calendar")}>
        <TabsList>
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-3">
          <DataTable
            data={filtered}
            columns={columns}
            loading={isLoading}
            searchPlaceholder="Search title, organisation, project…"
            searchKeys={[
              "title",
              "organisation",
              "project_name",
              "associated_project",
              "location_text",
            ]}
            onRowClick={openRow}
          />
        </TabsContent>

        <TabsContent value="calendar" className="mt-3">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <UpcomingProjectsCalendar rows={filtered} onRowClick={openRow} />
          )}
        </TabsContent>
      </Tabs>

      <MatchReviewPanel
        row={selectedRow}
        isAdmin={isAdmin}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
}
