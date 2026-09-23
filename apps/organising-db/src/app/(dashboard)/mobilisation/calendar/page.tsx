"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { buildCalendarItems, scheduleColumnMissing, type CalendarSignal } from "@/lib/mobilisation/schedule";
import { MobilisationTabs } from "../_components/tabs";
import { MobilisationCalendar } from "../_components/calendar-grid";

const COLUMNS =
  "signal_id, title, signal_type, occurred_at, extract, source_layer, vessel_id, vessels(name), watch:mobilisation_watch_contractors(canonical_name)";

async function loadCalendarSignals(): Promise<CalendarSignal[]> {
  const sb = createClient();
  const withSchedule = await sb
    .from("mobilisation_signals")
    .select(`${COLUMNS}, arrival_at, ends_at`)
    .order("occurred_at", { ascending: false })
    .limit(1000);
  const result =
    withSchedule.error && scheduleColumnMissing(withSchedule.error.message)
      ? await sb.from("mobilisation_signals").select(COLUMNS).order("occurred_at", { ascending: false }).limit(1000)
      : withSchedule;
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const vessel = row.vessels as { name?: string } | null;
    const watch = row.watch as { canonical_name?: string } | null;
    return {
      signal_id: Number(row.signal_id),
      title: String(row.title ?? ""),
      signal_type: String(row.signal_type ?? ""),
      occurred_at: String(row.occurred_at ?? ""),
      arrival_at: (row.arrival_at as string | null) ?? null,
      ends_at: (row.ends_at as string | null) ?? null,
      extract: (row.extract as string | null) ?? null,
      source_layer: String(row.source_layer ?? ""),
      vessel_id: (row.vessel_id as number | null) ?? null,
      vessel_name: vessel?.name ?? null,
      contractor_name: watch?.canonical_name ?? null,
    };
  });
}

export default function MobilisationCalendarPage() {
  const signals = useQuery({ queryKey: ["mobilisation-calendar"], queryFn: loadCalendarSignals });
  const items = useMemo(() => buildCalendarItems(signals.data ?? [], new Date()), [signals.data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Mobilisation calendar</h1>
        <p className="text-sm text-muted-foreground">
          Estimated arrival, and the length of stay when a source states it. A label opens that item in the feed.
          A filing or article is shown when it gives a start date or a duration. AIS shows the day a hull enters a North-West area, or an ETA when its course reaches that area.
          “On site” means the last position was inside and no exit has been recorded.
        </p>
      </div>
      <MobilisationTabs current="/mobilisation/calendar" />
      {signals.isLoading && <p className="text-sm text-muted-foreground">Loading schedule…</p>}
      {signals.error && <p className="text-sm text-destructive">{(signals.error as Error).message}</p>}
      {signals.data && <MobilisationCalendar items={items} />}
    </div>
  );
}
