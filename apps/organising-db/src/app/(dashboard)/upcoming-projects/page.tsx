"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ExternalLink, RefreshCcw, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useUpcomingProjects,
  type MatchStatus,
  type UpcomingProjectRow,
} from "@/lib/hooks/useUpcomingProjects";
import { useRefreshUpcomingProjects } from "@/lib/hooks/useRefreshUpcomingProjects";
import { MatchReviewPanel } from "./_components/match-review-panel";

type StatusFilter = "all" | MatchStatus | "review_or_unmatched";
type JurisdictionFilter = "all" | "WA" | "NT";

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

  const [jurisdictionFilter, setJurisdictionFilter] = useState<JurisdictionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedRow, setSelectedRow] = useState<UpcomingProjectRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

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
    return rows;
  }, [data, jurisdictionFilter, statusFilter]);

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

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground mr-1">Jurisdiction:</span>
      {(["all", "WA", "NT"] as JurisdictionFilter[]).map((opt) => (
        <Button
          key={opt}
          size="sm"
          variant={jurisdictionFilter === opt ? "default" : "outline"}
          onClick={() => setJurisdictionFilter(opt)}
        >
          {opt === "all" ? "All" : opt}
        </Button>
      ))}
      <span className="text-xs text-muted-foreground mx-2">|</span>
      <span className="text-xs text-muted-foreground mr-1">Match:</span>
      <Button
        size="sm"
        variant={statusFilter === "all" ? "default" : "outline"}
        onClick={() => setStatusFilter("all")}
      >
        All
      </Button>
      <Button
        size="sm"
        variant={statusFilter === "review_or_unmatched" ? "default" : "outline"}
        onClick={() => setStatusFilter("review_or_unmatched")}
      >
        Needs attention ({counts.needs_review + counts.unmatched})
      </Button>
      <Button
        size="sm"
        variant={statusFilter === "needs_review" ? "default" : "outline"}
        onClick={() => setStatusFilter("needs_review")}
      >
        Review ({counts.needs_review})
      </Button>
      <Button
        size="sm"
        variant={statusFilter === "unmatched" ? "default" : "outline"}
        onClick={() => setStatusFilter("unmatched")}
      >
        Unmatched ({counts.unmatched})
      </Button>
      <Button
        size="sm"
        variant={statusFilter === "confirmed" ? "default" : "outline"}
        onClick={() => setStatusFilter("confirmed")}
      >
        Confirmed
      </Button>
    </div>
  );

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
          <Button
            variant="outline"
            size="sm"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
          >
            {refreshMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4 mr-2" />
            )}
            Refresh now
          </Button>
        )}
      </div>

      {refreshMutation.isError && (
        <p className="text-sm text-destructive">
          Refresh failed: {(refreshMutation.error as Error).message}
        </p>
      )}
      {refreshMutation.isSuccess && (
        <p className="text-sm text-muted-foreground">
          Scrape requested. Results will appear here once the run completes.
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">
          Failed to load: {(error as Error).message}
        </p>
      )}

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
        filterBar={filterBar}
        onRowClick={(row) => {
          setSelectedRow(row);
          setPanelOpen(true);
        }}
      />

      <MatchReviewPanel
        row={selectedRow}
        isAdmin={isAdmin}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
}
