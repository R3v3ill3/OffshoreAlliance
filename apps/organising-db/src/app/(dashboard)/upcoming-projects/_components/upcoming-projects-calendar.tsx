"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  differenceInDays,
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  MatchStatus,
  UpcomingProjectRow,
} from "@/lib/hooks/useUpcomingProjects";

interface Props {
  rows: UpcomingProjectRow[];
  onRowClick: (row: UpcomingProjectRow) => void;
}

const VISIBLE_MONTHS = 3;
const DEFAULT_BAR_DAYS = 30; // when end_date is missing
const LABEL_COLUMN_PX = 240;

const LIFECYCLE_TO_BAR_COLOR: { test: RegExp; bg: string; border: string }[] = [
  { test: /exploration/i, bg: "bg-slate-400", border: "border-slate-600" },
  { test: /production|operation/i, bg: "bg-emerald-500", border: "border-emerald-700" },
  { test: /decommission/i, bg: "bg-rose-500", border: "border-rose-700" },
  { test: /development/i, bg: "bg-sky-500", border: "border-sky-700" },
  { test: /appraisal/i, bg: "bg-amber-500", border: "border-amber-700" },
];

const DEFAULT_BAR = { bg: "bg-zinc-400", border: "border-zinc-600" };

function lifecycleClasses(value: string | null) {
  if (!value) return DEFAULT_BAR;
  for (const rule of LIFECYCLE_TO_BAR_COLOR) {
    if (rule.test.test(value)) return { bg: rule.bg, border: rule.border };
  }
  return DEFAULT_BAR;
}

const MATCH_DOT: Record<MatchStatus, string> = {
  auto: "bg-emerald-600",
  confirmed: "bg-emerald-700",
  needs_review: "bg-amber-500",
  unmatched: "bg-rose-600",
  overridden: "bg-sky-600",
  rejected: "bg-zinc-400",
};

function truncate(s: string, max = 60) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function UpcomingProjectsCalendar({ rows, onRowClick }: Props) {
  const [windowStart, setWindowStart] = useState(() =>
    startOfMonth(subMonths(new Date(), 1))
  );

  const windowEnd = useMemo(
    () => endOfMonth(addMonths(windowStart, VISIBLE_MONTHS - 1)),
    [windowStart]
  );

  const totalDays = useMemo(
    () => differenceInDays(windowEnd, windowStart) + 1,
    [windowStart, windowEnd]
  );

  // Skip rows without a start date — they have nothing to anchor on the timeline.
  const withStart = useMemo(
    () => rows.filter((r) => !!r.start_date),
    [rows]
  );
  const withoutStart = rows.length - withStart.length;

  // Rows whose [start, end] (or default 30-day window) overlap the visible range.
  const visible = useMemo(() => {
    return withStart.filter((r) => {
      const start = new Date(r.start_date!);
      const end = r.end_date
        ? new Date(r.end_date)
        : addDays(start, DEFAULT_BAR_DAYS);
      return start <= windowEnd && end >= windowStart;
    });
  }, [withStart, windowStart, windowEnd]);

  const monthSegments = useMemo(() => {
    const segments: { label: string; startDay: number; days: number }[] = [];
    let cursor = startOfMonth(windowStart);
    while (cursor <= windowEnd) {
      const segStart = cursor < windowStart ? windowStart : cursor;
      const segEnd =
        endOfMonth(cursor) > windowEnd ? windowEnd : endOfMonth(cursor);
      const startOffset = differenceInDays(segStart, windowStart);
      const days = differenceInDays(segEnd, segStart) + 1;
      segments.push({
        label: format(cursor, "MMMM yyyy"),
        startDay: startOffset,
        days,
      });
      cursor = startOfMonth(addMonths(cursor, 1));
    }
    return segments;
  }, [windowStart, windowEnd]);

  const weekTicks = useMemo(() => {
    const ticks: number[] = [];
    let d = 7;
    while (d < totalDays) {
      ticks.push(d);
      d += 7;
    }
    return ticks;
  }, [totalDays]);

  const todayOffset = useMemo(() => {
    const today = new Date();
    if (today < windowStart || today > windowEnd) return null;
    return differenceInDays(today, windowStart);
  }, [windowStart, windowEnd]);

  function dayPct(dayOffset: number) {
    return `${((dayOffset / totalDays) * 100).toFixed(4)}%`;
  }

  function getBarStyle(row: UpcomingProjectRow) {
    const start = new Date(row.start_date!);
    const end = row.end_date
      ? new Date(row.end_date)
      : addDays(start, DEFAULT_BAR_DAYS);
    const isOpenEnded = !row.end_date;

    const clampedStart = start < windowStart ? windowStart : start;
    const clampedEnd = end > windowEnd ? windowEnd : end;

    const leftOffset = differenceInDays(clampedStart, windowStart);
    const width = Math.max(1, differenceInDays(clampedEnd, clampedStart) + 1);

    return {
      leftPct: ((leftOffset / totalDays) * 100).toFixed(4),
      widthPct: ((width / totalDays) * 100).toFixed(4),
      isOpenEnded,
    };
  }

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWindowStart((d) => startOfMonth(subMonths(d, 1)))}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm font-medium text-muted-foreground">
          {format(windowStart, "MMM yyyy")} — {format(windowEnd, "MMM yyyy")}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWindowStart((d) => startOfMonth(addMonths(d, 1)))}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {withoutStart > 0 && (
        <p className="text-xs text-muted-foreground">
          {withoutStart} project{withoutStart !== 1 ? "s" : ""} without a start
          date are not shown on the calendar.
        </p>
      )}

      {/* Calendar grid */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Month header */}
        <div
          className="relative h-8 border-b bg-muted/30"
          style={{ marginLeft: `${LABEL_COLUMN_PX}px` }}
        >
          {monthSegments.map((seg) => (
            <div
              key={seg.label}
              className="absolute top-0 h-full flex items-center px-2 border-r last:border-r-0"
              style={{ left: dayPct(seg.startDay), width: dayPct(seg.days) }}
            >
              <span className="text-xs font-semibold text-muted-foreground truncate">
                {seg.label}
              </span>
            </div>
          ))}
        </div>

        {/* Week ticks */}
        <div
          className="relative h-5 border-b bg-muted/10"
          style={{ marginLeft: `${LABEL_COLUMN_PX}px` }}
        >
          {weekTicks.map((tick) => (
            <div
              key={tick}
              className="absolute top-0 h-full border-l border-border/40 flex items-center"
              style={{ left: dayPct(tick) }}
            >
              <span className="text-[10px] text-muted-foreground/60 pl-0.5">
                {format(addDays(windowStart, tick), "d MMM")}
              </span>
            </div>
          ))}
          {todayOffset !== null && (
            <div
              className="absolute top-0 h-full border-l-2 border-blue-500/70"
              style={{ left: dayPct(todayOffset) }}
            />
          )}
        </div>

        {/* Project rows */}
        {visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No projects with start dates fall within this period.
          </div>
        ) : (
          <div className="divide-y">
            {visible.map((row) => {
              const bar = getBarStyle(row);
              const colors = lifecycleClasses(row.lifecycle_classification);
              const matchStatus = row.match?.match_status;
              const dotClass = matchStatus ? MATCH_DOT[matchStatus] : "bg-zinc-400";
              const dateLabel = row.end_date
                ? `${row.start_date} → ${row.end_date}`
                : `${row.start_date} → open-ended`;

              return (
                <div
                  key={row.id}
                  className="flex items-center h-10 group"
                >
                  {/* Label column */}
                  <div
                    className="flex-shrink-0 px-3 py-1 text-xs font-medium text-foreground border-r bg-card"
                    style={{ width: `${LABEL_COLUMN_PX}px` }}
                    title={`${row.title ?? "(no title)"}\n${row.organisation ?? "(no organisation)"}`}
                  >
                    <div className="truncate">{truncate(row.title ?? "Untitled", 36)}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {row.organisation ?? "—"}
                    </div>
                  </div>

                  {/* Timeline track */}
                  <div className="relative flex-1 h-full bg-muted/5">
                    {monthSegments.slice(1).map((seg) => (
                      <div
                        key={seg.label}
                        className="absolute top-0 h-full border-l border-border/20"
                        style={{ left: dayPct(seg.startDay) }}
                      />
                    ))}
                    {weekTicks.map((tick) => (
                      <div
                        key={tick}
                        className="absolute top-0 h-full border-l border-border/10"
                        style={{ left: dayPct(tick) }}
                      />
                    ))}
                    {todayOffset !== null && (
                      <div
                        className="absolute top-0 h-full border-l-2 border-blue-500/40 z-10"
                        style={{ left: dayPct(todayOffset) }}
                      />
                    )}

                    <button
                      type="button"
                      className={`absolute top-1/2 -translate-y-1/2 h-7 rounded border ${colors.bg} ${colors.border} text-white text-[11px] font-semibold flex items-center gap-1.5 px-2 cursor-pointer transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 overflow-hidden ${bar.isOpenEnded ? "[mask-image:linear-gradient(to_right,black_85%,transparent)]" : ""}`}
                      style={{
                        left: `${bar.leftPct}%`,
                        width: `${bar.widthPct}%`,
                      }}
                      onClick={() => onRowClick(row)}
                      title={`${row.title ?? "Untitled"}\n${row.organisation ?? ""}\n${dateLabel}\n${row.jurisdiction ?? "—"}${row.region_code ? ` / ${row.region_code}` : ""}`}
                    >
                      <span className={`shrink-0 w-2 h-2 rounded-full ${dotClass} ring-1 ring-white/70`} />
                      <span className="truncate">{truncate(row.title ?? "", 60)}</span>
                      {row.jurisdiction && (
                        <Badge
                          variant={row.jurisdiction === "WA" ? "info" : "warning"}
                          className="shrink-0 h-4 px-1 text-[9px] ml-auto"
                        >
                          {row.jurisdiction}
                        </Badge>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground">
          <span className="font-semibold">Lifecycle:</span>
          <LegendSwatch label="Exploration" classes="bg-slate-400" />
          <LegendSwatch label="Production / operation" classes="bg-emerald-500" />
          <LegendSwatch label="Development" classes="bg-sky-500" />
          <LegendSwatch label="Decommissioning" classes="bg-rose-500" />
          <LegendSwatch label="Appraisal" classes="bg-amber-500" />
          <span className="font-semibold ml-2">Match:</span>
          <LegendDot label="Auto / confirmed" classes="bg-emerald-600" />
          <LegendDot label="Review" classes="bg-amber-500" />
          <LegendDot label="Unmatched" classes="bg-rose-600" />
          <span className="ml-2 inline-flex items-center gap-1.5">
            <span className="w-0.5 h-3 bg-blue-500/70 inline-block" /> Today
          </span>
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ label, classes }: { label: string; classes: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-4 h-3 rounded-sm ${classes}`} />
      {label}
    </span>
  );
}

function LegendDot({ label, classes }: { label: string; classes: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${classes}`} />
      {label}
    </span>
  );
}
