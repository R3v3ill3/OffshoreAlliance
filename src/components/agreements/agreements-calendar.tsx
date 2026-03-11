"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  addWeeks,
  subWeeks,
  differenceInDays,
  format,
  isWithinInterval,
  isSameDay,
  addDays,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgreementRow {
  agreement_id: number;
  agreement_name: string;
  short_name: string | null;
  expiry_date: string | null;
  status: string;
  employer: { employer_name: string } | null;
  [key: string]: unknown;
}

interface AgreementsCalendarProps {
  agreements: AgreementRow[];
}

const WEEKS_BEFORE = 6;
const WEEKS_AFTER = 4;
const VISIBLE_MONTHS = 3;

function truncate(s: string, max = 40) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function AgreementsCalendar({ agreements }: AgreementsCalendarProps) {
  const router = useRouter();

  // Window start: beginning of the month 1 month ago so near-term expiries are visible
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

  // Only agreements with an expiry date
  const withExpiry = useMemo(
    () => agreements.filter((a) => !!a.expiry_date),
    [agreements]
  );
  const withoutExpiry = agreements.length - withExpiry.length;

  // Agreements whose bar overlaps the visible window
  const visible = useMemo(() => {
    return withExpiry.filter((a) => {
      const expiry = new Date(a.expiry_date!);
      const barStart = subWeeks(expiry, WEEKS_BEFORE);
      const barEnd = addWeeks(expiry, WEEKS_AFTER);
      return barStart <= windowEnd && barEnd >= windowStart;
    });
  }, [withExpiry, windowStart, windowEnd]);

  // Month segments for the header
  const monthSegments = useMemo(() => {
    const segments: { label: string; startDay: number; days: number }[] = [];
    let cursor = startOfMonth(windowStart);
    while (cursor <= windowEnd) {
      const segStart = cursor < windowStart ? windowStart : cursor;
      const segEnd = endOfMonth(cursor) > windowEnd ? windowEnd : endOfMonth(cursor);
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

  // Week tick positions (every 7 days from window start)
  const weekTicks = useMemo(() => {
    const ticks: number[] = [];
    let d = 7;
    while (d < totalDays) {
      ticks.push(d);
      d += 7;
    }
    return ticks;
  }, [totalDays]);

  // Today marker position
  const todayOffset = useMemo(() => {
    const today = new Date();
    if (today < windowStart || today > windowEnd) return null;
    return differenceInDays(today, windowStart);
  }, [windowStart, windowEnd]);

  function dayPct(dayOffset: number) {
    return `${((dayOffset / totalDays) * 100).toFixed(4)}%`;
  }

  function getBarStyle(agreement: AgreementRow) {
    const expiry = new Date(agreement.expiry_date!);
    const barStart = subWeeks(expiry, WEEKS_BEFORE);
    const barEnd = addWeeks(expiry, WEEKS_AFTER);

    // Clamp to visible window
    const clampedStart = barStart < windowStart ? windowStart : barStart;
    const clampedEnd = barEnd > windowEnd ? windowEnd : barEnd;

    const leftOffset = differenceInDays(clampedStart, windowStart);
    const width = differenceInDays(clampedEnd, clampedStart) + 1;

    // Proportion of bar that is the "red" pre-expiry section vs total bar
    // The full bar is WEEKS_BEFORE + WEEKS_AFTER weeks = 70 days
    // The red/green split is at the expiry date
    const totalBarDays = WEEKS_BEFORE * 7 + WEEKS_AFTER * 7;
    const redDays = differenceInDays(expiry, barStart); // 42 days if unclamped
    const redPct = (redDays / totalBarDays) * 100; // ~60%

    // Recalculate gradient stops based on where in the visible clamped bar the expiry falls
    const clampedBarDays = differenceInDays(clampedEnd, clampedStart) + 1;
    const expiryInBar = differenceInDays(expiry, clampedStart);
    const expiryPct = clampedBarDays > 0 ? (expiryInBar / clampedBarDays) * 100 : redPct;

    const leftPct = ((leftOffset / totalDays) * 100).toFixed(4);
    const widthPct = ((width / totalDays) * 100).toFixed(4);

    // Gradient: light-red → dark-red → dark-green → light-green
    // Split point at expiryPct within the bar
    const splitA = Math.max(0, expiryPct - 3).toFixed(1);
    const splitB = Math.min(100, expiryPct + 3).toFixed(1);

    const gradient = `linear-gradient(to right, #fca5a5 0%, #dc2626 ${splitA}%, #16a34a ${splitB}%, #bbf7d0 100%)`;

    return {
      left: leftPct + "%",
      width: widthPct + "%",
      background: gradient,
      expiryPct: expiryPct.toFixed(2),
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

      {withoutExpiry > 0 && (
        <p className="text-xs text-muted-foreground">
          {withoutExpiry} agreement{withoutExpiry !== 1 ? "s" : ""} without an
          expiry date are not shown.
        </p>
      )}

      {/* Calendar grid */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Month header */}
        <div className="relative h-8 border-b bg-muted/30" style={{ marginLeft: "220px" }}>
          {monthSegments.map((seg) => (
            <div
              key={seg.label}
              className="absolute top-0 h-full flex items-center px-2 border-r last:border-r-0"
              style={{
                left: dayPct(seg.startDay),
                width: dayPct(seg.days),
              }}
            >
              <span className="text-xs font-semibold text-muted-foreground truncate">
                {seg.label}
              </span>
            </div>
          ))}
        </div>

        {/* Week ticks subheader */}
        <div
          className="relative h-5 border-b bg-muted/10"
          style={{ marginLeft: "220px" }}
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
          {/* Today marker in subheader */}
          {todayOffset !== null && (
            <div
              className="absolute top-0 h-full border-l-2 border-blue-500/70"
              style={{ left: dayPct(todayOffset) }}
            />
          )}
        </div>

        {/* Agreement rows */}
        {visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No agreements with expiry dates fall within this period.
          </div>
        ) : (
          <div className="divide-y">
            {visible.map((agreement) => {
              const barStyle = getBarStyle(agreement);
              const displayName = agreement.short_name || agreement.agreement_name;
              const expiryLabel = format(new Date(agreement.expiry_date!), "dd MMM yyyy");

              return (
                <div key={agreement.agreement_id} className="flex items-center h-10 group">
                  {/* Agreement name label (fixed left column) */}
                  <div
                    className="flex-shrink-0 w-[220px] px-3 py-1 text-xs font-medium truncate text-foreground border-r bg-card"
                    title={agreement.agreement_name}
                  >
                    {truncate(displayName, 28)}
                  </div>

                  {/* Timeline track */}
                  <div className="relative flex-1 h-full bg-muted/5">
                    {/* Month dividers */}
                    {monthSegments.slice(1).map((seg) => (
                      <div
                        key={seg.label}
                        className="absolute top-0 h-full border-l border-border/20"
                        style={{ left: dayPct(seg.startDay) }}
                      />
                    ))}

                    {/* Week dividers */}
                    {weekTicks.map((tick) => (
                      <div
                        key={tick}
                        className="absolute top-0 h-full border-l border-border/10"
                        style={{ left: dayPct(tick) }}
                      />
                    ))}

                    {/* Today line */}
                    {todayOffset !== null && (
                      <div
                        className="absolute top-0 h-full border-l-2 border-blue-500/40 z-10"
                        style={{ left: dayPct(todayOffset) }}
                      />
                    )}

                    {/* Agreement bar */}
                    <button
                      type="button"
                      className="absolute top-1/2 -translate-y-1/2 h-7 rounded cursor-pointer transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 overflow-hidden"
                      style={{
                        left: barStyle.left,
                        width: barStyle.width,
                        background: barStyle.background,
                      }}
                      onClick={() => router.push(`/agreements/${agreement.agreement_id}`)}
                      title={`${agreement.agreement_name}\nExpiry: ${expiryLabel}`}
                    >
                      {/* Expiry divider line within the bar */}
                      <div
                        className="absolute top-0 h-full border-l-2 border-white/60"
                        style={{ left: barStyle.expiryPct + "%" }}
                      />

                      {/* Agreement label text */}
                      <span className="absolute inset-0 flex items-center justify-center px-2 text-[11px] font-semibold text-white drop-shadow-sm truncate">
                        {truncate(displayName, 32)}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-6 px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div
              className="w-16 h-3 rounded"
              style={{
                background:
                  "linear-gradient(to right, #fca5a5, #dc2626)",
              }}
            />
            <span>6 weeks to expiry</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-16 h-3 rounded"
              style={{
                background:
                  "linear-gradient(to right, #16a34a, #bbf7d0)",
              }}
            />
            <span>4 weeks post-expiry</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-4 bg-blue-500/70" />
            <span>Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-4 bg-white/60 border border-border" />
            <span>Expiry date</span>
          </div>
        </div>
      </div>
    </div>
  );
}
