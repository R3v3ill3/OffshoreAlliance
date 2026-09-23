"use client";

import { useState } from "react";
import Link from "next/link";
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
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

export function MobilisationCalendar({ items, initialMonth }: { items: CalendarItem[]; initialMonth?: Date }) {
  const [month, setMonth] = useState(() => startOfMonth(initialMonth ?? new Date()));
  const gridStart = startOfWeek(month, { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const visibleCount = days.filter((day) => isSameMonth(day, month) && items.some((item) => itemCoversDay(item, day))).length;

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
      </div>

      {visibleCount === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing with an estimated arrival falls in {format(month, "MMMM yyyy")}.
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
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const shown = items.filter((item) => itemCoversDay(item, day));
              const visible = shown.slice(0, 3);
              const extra = shown.slice(3);
              const outside = !isSameMonth(day, month);
              return (
                <div
                  key={format(day, "yyyy-MM-dd")}
                  className={cn(
                    "min-h-24 border-b border-r p-1",
                    outside && "bg-muted/30",
                    isSameDay(day, new Date()) && "ring-1 ring-inset ring-primary"
                  )}
                >
                  <div className={cn("mb-1 text-xs", outside ? "text-muted-foreground/70" : "text-foreground")}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {visible.map((item) => (
                      <Link
                        key={item.signalId}
                        href={`/mobilisation#signal-${item.signalId}`}
                        title={item.label}
                        className={cn("block truncate rounded px-1 py-0.5 text-[11px] leading-4", KIND_CLASS[item.kind])}
                      >
                        {item.label}
                      </Link>
                    ))}
                    {extra.length > 0 && (
                      <p className="px-1 text-[10px] text-muted-foreground" title={extra.map((item) => item.label).join(", ")}>
                        +{extra.length} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
