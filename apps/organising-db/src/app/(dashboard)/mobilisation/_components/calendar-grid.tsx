"use client";

import { useState } from "react";
import Link from "next/link";
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { itemCoversDay, type CalendarItem } from "@/lib/mobilisation/schedule";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_CLASS: Record<CalendarItem["kind"], string> = {
  eta: "bg-amber-100 text-amber-950 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-100",
  stay: "bg-sky-100 text-sky-950 hover:bg-sky-200 dark:bg-sky-950/50 dark:text-sky-100",
  on_site: "bg-emerald-100 text-emerald-950 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-100",
};

export interface MonthActivity {
  id: number;
  label: string;
  start: Date;
  end: Date;
}

function activityCoversDay(activity: MonthActivity, day: Date): boolean {
  const cursor = startOfDay(day).getTime();
  return cursor >= startOfDay(activity.start).getTime() && cursor <= startOfDay(activity.end).getTime();
}

const ACTIVITY_LANES = 2;

interface WeekSpan {
  activity: MonthActivity;
  start: number;
  end: number;
  lane: number;
}

/** Continuous activity windows become one bar per week so a long campaign does not fill every day cell. */
function placeActivities(activities: MonthActivity[], week: Date[]): { placed: WeekSpan[]; hidden: number } {
  const spans = activities
    .flatMap((activity) => {
      let start = -1;
      let end = -1;
      week.forEach((day, index) => {
        if (!activityCoversDay(activity, day)) return;
        if (start < 0) start = index;
        end = index;
      });
      return start < 0 ? [] : [{ activity, start, end }];
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const laneEnds: number[] = [];
  const placed: WeekSpan[] = [];
  let hidden = 0;
  for (const span of spans) {
    let lane = laneEnds.findIndex((end) => end < span.start);
    if (lane < 0) {
      if (laneEnds.length >= ACTIVITY_LANES) {
        hidden += 1;
        continue;
      }
      lane = laneEnds.length;
      laneEnds.push(span.end);
    } else {
      laneEnds[lane] = span.end;
    }
    placed.push({ ...span, lane });
  }
  return { placed, hidden };
}

export function MobilisationCalendar({
  items,
  activities = [],
  initialMonth,
  onActivityClick,
}: {
  items: CalendarItem[];
  activities?: MonthActivity[];
  initialMonth?: Date;
  onActivityClick?: (id: number) => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(initialMonth ?? new Date()));
  const gridStart = startOfWeek(month, { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const visibleCount = days.filter(
    (day) =>
      isSameMonth(day, month) &&
      (items.some((item) => itemCoversDay(item, day)) || activities.some((activity) => activityCoversDay(activity, day)))
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setMonth((current) => startOfMonth(subMonths(current, 1)))}>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setMonth((current) => startOfMonth(addMonths(current, 1)))}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="text-sm font-medium">{format(month, "MMMM yyyy")}</h2>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> ETA
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Stated stay
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> On site
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> Approved activity
        </span>
      </div>

      {visibleCount === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing with an estimated arrival or an activity window falls in {format(month, "MMMM yyyy")}.
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[720px] overflow-hidden rounded-lg border">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
            {WEEKDAYS.map((day) => (
              <div key={day} className="px-2 py-1.5">
                {day}
              </div>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, weekIndex) => days.slice(weekIndex * 7, weekIndex * 7 + 7)).map((week) => {
            const { placed, hidden } = placeActivities(activities, week);
            const lanes = placed.reduce((max, span) => Math.max(max, span.lane + 1), 0);
            return (
              <div key={format(week[0], "yyyy-MM-dd")} className="grid grid-cols-7 border-b last:border-b-0">
                {(lanes > 0 || hidden > 0) && (
                  <div className="col-span-7 space-y-0.5 border-b bg-muted/10 px-0.5 py-0.5">
                    {lanes > 0 && (
                      <div className="grid grid-cols-7 gap-y-0.5" style={{ gridTemplateRows: `repeat(${lanes}, auto)` }}>
                        {placed.map((span) => (
                          <button
                            key={span.activity.id}
                            type="button"
                            title={span.activity.label}
                            onClick={() => onActivityClick?.(span.activity.id)}
                            className="mx-0.5 truncate rounded bg-violet-100 px-1 py-0.5 text-left text-[11px] leading-4 text-violet-950 hover:bg-violet-200 dark:bg-violet-950/50 dark:text-violet-100"
                            style={{ gridColumn: `${span.start + 1} / ${span.end + 2}`, gridRow: span.lane + 1 }}
                          >
                            {span.activity.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {hidden > 0 && (
                      <p className="px-1 text-[10px] text-muted-foreground">+{hidden} more activities</p>
                    )}
                  </div>
                )}
                {week.map((day) => {
                  const daySignals = items.filter((item) => itemCoversDay(item, day));
                  const visibleSignals = daySignals.slice(0, 3);
                  const extra = daySignals.length - visibleSignals.length;
                  const outside = !isSameMonth(day, month);
                  return (
                    <div
                      key={format(day, "yyyy-MM-dd")}
                      className={cn(
                        "min-h-24 border-r p-1 last:border-r-0",
                        outside && "bg-muted/30",
                        isSameDay(day, new Date()) && "ring-1 ring-inset ring-primary"
                      )}
                    >
                      <div className={cn("mb-1 text-xs", outside ? "text-muted-foreground/70" : "text-foreground")}>
                        {format(day, "d")}
                      </div>
                      <div className="space-y-0.5">
                        {visibleSignals.map((item) => (
                          <Link
                            key={item.signalId}
                            href={`/projects/alerts#signal-${item.signalId}`}
                            title={item.label}
                            className={cn("block truncate rounded px-1 py-0.5 text-[11px] leading-4", KIND_CLASS[item.kind])}
                          >
                            {item.label}
                          </Link>
                        ))}
                        {extra > 0 && <p className="px-1 text-[10px] text-muted-foreground">+{extra} more</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
