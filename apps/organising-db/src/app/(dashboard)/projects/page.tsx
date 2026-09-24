"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useUpcomingProjects,
  type MatchStatus,
} from "@/lib/hooks/useUpcomingProjects";
import { useRegulatorySignals, useRelatedLayerSignals, useScheduleSignals } from "@/lib/hooks/useProjectRadar";
import { buildCalendarItems } from "@/lib/mobilisation/schedule";
import { MobilisationCalendar } from "../mobilisation/_components/calendar-grid";
import { mergeWorkProgramme, type WorkProgrammeRow } from "@/lib/projects/merge-work-programme";
import { MatchReviewPanel } from "../upcoming-projects/_components/match-review-panel";
import {
  UpcomingProjectsFilterBar,
  type StatusFilter,
  type JurisdictionFilter,
} from "../upcoming-projects/_components/filter-bar";
import { UpcomingProjectsCalendar } from "../upcoming-projects/_components/upcoming-projects-calendar";

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

const STATUS_VALUES: StatusFilter[] = [
  "all",
  "auto",
  "needs_review",
  "confirmed",
  "overridden",
  "rejected",
  "unmatched",
  "review_or_unmatched",
];

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

type ProgrammeView = "table" | "timeline" | "month";

function viewFromParam(value: string | null): ProgrammeView {
  if (value === "month") return "month";
  if (value === "timeline" || value === "calendar") return "timeline";
  return "table";
}

function sourceLabel(row: WorkProgrammeRow): string {
  if (row.radarOnly) return row.radar?.source ?? row.source;
  if (row.source === "nopsema") return "NOPSEMA";
  return row.source;
}

export default function ProjectsWorkPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <WorkProgramme />
    </Suspense>
  );
}

function WorkProgramme() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = viewFromParam(searchParams.get("view"));
  const initialStatus = searchParams.get("status");
  const { data, isLoading, error } = useUpcomingProjects();
  const radar = useRegulatorySignals();
  const schedule = useScheduleSignals();

  const [jurisdictionFilter, setJurisdictionFilter] = useState<JurisdictionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    STATUS_VALUES.includes(initialStatus as StatusFilter) ? (initialStatus as StatusFilter) : "all"
  );
  const [lifecycleFilter, setLifecycleFilter] = useState<Set<string>>(new Set());
  const [selectedRow, setSelectedRow] = useState<WorkProgrammeRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  function selectView(next: ProgrammeView) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "table") params.delete("view");
    else params.set("view", next);
    const query = params.toString();
    router.replace(query ? `/projects?${query}` : "/projects");
  }

  const rows = useMemo(
    () => mergeWorkProgramme(data ?? [], radar.data ?? []),
    [data, radar.data]
  );

  const activityId = searchParams.get("activity");
  const openedActivity = useRef<string | null>(null);
  useEffect(() => {
    if (!activityId || openedActivity.current === activityId) return;
    const row = rows.find((item) => String(item.id) === activityId);
    if (!row) return;
    openedActivity.current = activityId;
    setSelectedRow(row);
    setPanelOpen(true);
  }, [activityId, rows]);

  const statusFromUrl = searchParams.get("status");
  useEffect(() => {
    if (STATUS_VALUES.includes(statusFromUrl as StatusFilter)) {
      setStatusFilter(statusFromUrl as StatusFilter);
    }
  }, [statusFromUrl]);

  const related = useRelatedLayerSignals(
    selectedRow?.radar?.watch_contractor_id ?? null,
    selectedRow?.radar?.vessel_id ?? null,
    panelOpen
  );

  const counts = useMemo(() => {
    const c = { needs_review: 0, unmatched: 0 };
    for (const row of rows) {
      const s = row.match?.match_status;
      if (s === "needs_review") c.needs_review += 1;
      else if (s === "unmatched") c.unmatched += 1;
    }
    return c;
  }, [rows]);

  const lifecycleOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.lifecycle_classification) seen.add(row.lifecycle_classification);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    let next = rows;
    if (jurisdictionFilter !== "all") next = next.filter((r) => r.jurisdiction === jurisdictionFilter);
    if (statusFilter !== "all") {
      next = next.filter((r) => {
        if (r.radarOnly) return false;
        const s = r.match?.match_status ?? "unmatched";
        if (statusFilter === "review_or_unmatched") return s === "needs_review" || s === "unmatched";
        return s === statusFilter;
      });
    }
    if (lifecycleFilter.size > 0) {
      next = next.filter((r) => (r.lifecycle_classification ? lifecycleFilter.has(r.lifecycle_classification) : false));
    }
    return next;
  }, [rows, jurisdictionFilter, statusFilter, lifecycleFilter]);

  const scheduleItems = useMemo(() => buildCalendarItems(schedule.data ?? [], new Date()), [schedule.data]);
  const visibleSchedule = useMemo(() => {
    const shown = new Set(filtered.map((row) => row.radar?.signal_id).filter((id): id is number => id != null));
    const hidden = new Set<number>();
    for (const row of rows) {
      const id = row.radar?.signal_id;
      if (id != null && !shown.has(id)) hidden.add(id);
    }
    return scheduleItems.filter((item) => !hidden.has(item.signalId));
  }, [filtered, rows, scheduleItems]);
  const monthActivities = useMemo(
    () =>
      filtered
        .filter((row) => row.start_date)
        .map((row) => ({
          id: row.id,
          label: row.title ?? "Untitled",
          start: new Date(row.start_date!),
          end: row.end_date ? new Date(row.end_date) : addDays(new Date(row.start_date!), 30),
        })),
    [filtered]
  );

  const columns: Column<WorkProgrammeRow>[] = [
    {
      key: "jurisdiction",
      header: "Jur.",
      render: (r) =>
        r.jurisdiction ? (
          <Badge variant={r.jurisdiction === "WA" ? "info" : "warning"}>{r.jurisdiction}</Badge>
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
          {r.project_name && <div className="text-xs text-muted-foreground">{r.project_name}</div>}
        </div>
      ),
    },
    { key: "organisation", header: "Organisation (scraped)", sortable: true, render: (r) => r.organisation ?? "—" },
    {
      key: "match",
      header: "Matched employer",
      render: (r) => {
        const m = r.match;
        if (!m) return <span className="text-xs text-muted-foreground">{r.radarOnly ? "Radar only" : "—"}</span>;
        return (
          <div className="flex flex-col gap-1">
            <Badge variant={MATCH_VARIANTS[m.match_status]} className="self-start">{MATCH_LABELS[m.match_status]}</Badge>
            {m.matched_employer && <span className="text-xs">{m.matched_employer.employer_name}</span>}
            {m.role_type && <span className="text-[11px] text-muted-foreground">{m.role_type.replaceAll("_", " ")}</span>}
          </div>
        );
      },
    },
    { key: "activity_type", header: "Type", render: (r) => r.activity_type ?? "—" },
    {
      key: "lifecycle_classification",
      header: "Lifecycle",
      render: (r) =>
        r.lifecycle_classification ? (
          <Badge variant={lifecycleVariant(r.lifecycle_classification)}>{r.lifecycle_classification}</Badge>
        ) : (
          "—"
        ),
    },
    { key: "start_date", header: "Start", sortable: true, render: (r) => formatDate(r.start_date) },
    { key: "status", header: "Status", render: (r) => r.status ?? "—" },
    {
      key: "source_url",
      header: "Source",
      render: (r) =>
        r.source_url ? (
          <a
            href={r.source_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            {sourceLabel(r)}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs">{sourceLabel(r)}</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">Failed to load: {(error as Error).message}</p>}
      {radar.error && <p className="text-sm text-destructive">Radar links failed: {(radar.error as Error).message}</p>}
      {schedule.error && <p className="text-sm text-destructive">Schedule failed: {(schedule.error as Error).message}</p>}
      <UpcomingProjectsFilterBar
        jurisdiction={jurisdictionFilter}
        onJurisdictionChange={setJurisdictionFilter}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        lifecycleOptions={lifecycleOptions}
        lifecycleSelected={lifecycleFilter}
        onLifecycleToggle={(value) =>
          setLifecycleFilter((prev) => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
          })
        }
        onLifecycleClear={() => setLifecycleFilter(new Set())}
        needsReviewCount={counts.needs_review}
        unmatchedCount={counts.unmatched}
      />
      <Tabs value={view} onValueChange={(value) => selectView(value as ProgrammeView)}>
        <TabsList>
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
        </TabsList>
        <TabsContent value="table" className="mt-3">
          <DataTable
            data={filtered}
            columns={columns}
            loading={isLoading}
            searchPlaceholder="Search title, organisation, project, employer…"
            searchKeys={[
              "title",
              "organisation",
              "project_name",
              "associated_project",
              "location_text",
              "matched_employer_name",
              "radar_watch_name",
            ]}
            onRowClick={(row) => {
              setSelectedRow(row);
              setPanelOpen(true);
            }}
          />
        </TabsContent>
        <TabsContent value="timeline" className="mt-3">
          <p className="mb-3 text-xs text-muted-foreground">
            Approved activities use the filters above. Estimated arrivals, stated stays, and vessels on site stay visible unless they belong to an activity the filter hides.
          </p>
          {isLoading || schedule.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <UpcomingProjectsCalendar
              rows={filtered}
              schedule={visibleSchedule}
              onScheduleClick={(signalId) => router.push(`/projects/alerts#signal-${signalId}`)}
              onRowClick={(row) => {
                setSelectedRow(row as WorkProgrammeRow);
                setPanelOpen(true);
              }}
            />
          )}
        </TabsContent>
        <TabsContent value="month" className="mt-3">
          <p className="mb-3 text-xs text-muted-foreground">
            Violet chips are approved activities. Amber, blue, and green chips are estimated arrivals, stated stays, and vessels on site. A schedule chip opens that item in Alerts.
          </p>
          {isLoading || schedule.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <MobilisationCalendar
              items={visibleSchedule}
              activities={monthActivities}
              onActivityClick={(id) => {
                const row = filtered.find((item) => item.id === id);
                if (!row) return;
                setSelectedRow(row);
                setPanelOpen(true);
              }}
            />
          )}
        </TabsContent>
      </Tabs>
      <MatchReviewPanel
        row={selectedRow}
        related={(related.data ?? []).filter((signal) => signal.signal_id !== selectedRow?.radar?.signal_id)}
        isAdmin={isAdmin}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
}
