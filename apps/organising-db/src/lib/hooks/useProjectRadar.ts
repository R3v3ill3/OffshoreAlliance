"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { RadarSignal } from "@/lib/projects/merge-work-programme";
import { scheduleColumnMissing, type CalendarSignal } from "@/lib/mobilisation/schedule";

const SIGNAL_COLUMNS =
  "signal_id, source_layer, source, source_key, signal_type, occurred_at, title, extract, url, confidence, in_region, region_label, external_id, matched_terms, vessel_id, watch_contractor_id, operator_id, worksite_id, vessels(name), watch:mobilisation_watch_contractors(canonical_name), operator:employers!mobilisation_signals_operator_id_fkey(employer_name)";

interface SignalJoin {
  signal_id: number;
  source_layer: string;
  source: string;
  source_key: string | null;
  signal_type: string;
  occurred_at: string;
  title: string;
  extract: string | null;
  url: string | null;
  confidence: number;
  in_region: boolean;
  region_label: string | null;
  external_id: string | null;
  matched_terms: string[] | null;
  vessel_id: number | null;
  watch_contractor_id: number | null;
  operator_id: number | null;
  worksite_id: number | null;
  vessels: { name: string } | null;
  watch: { canonical_name: string } | null;
  operator: { employer_name: string } | null;
}

function toRadar(row: SignalJoin): RadarSignal {
  return {
    signal_id: row.signal_id,
    source_layer: row.source_layer,
    source: row.source,
    source_key: row.source_key,
    signal_type: row.signal_type,
    occurred_at: row.occurred_at,
    title: row.title,
    extract: row.extract,
    url: row.url,
    confidence: Number(row.confidence),
    in_region: row.in_region,
    region_label: row.region_label,
    external_id: row.external_id,
    matched_terms: row.matched_terms,
    vessel_id: row.vessel_id,
    vessel_name: row.vessels?.name ?? null,
    watch_contractor_id: row.watch_contractor_id,
    watch_name: row.watch?.canonical_name ?? null,
    operator_id: row.operator_id,
    operator_name: row.operator?.employer_name ?? null,
    worksite_id: row.worksite_id,
  };
}

/** Regulatory signals used to attach radar context to catalogue rows and to fill gaps. */
export function useRegulatorySignals() {
  return useQuery({
    queryKey: ["project-regulatory-signals"],
    queryFn: async (): Promise<RadarSignal[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("mobilisation_signals")
        .select(SIGNAL_COLUMNS)
        .eq("source_layer", "regulatory")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as SignalJoin[]).map(toRadar);
    },
    staleTime: 60_000,
  });
}

const SCHEDULE_COLUMNS =
  "signal_id, title, signal_type, occurred_at, extract, source_layer, vessel_id, vessels(name), watch:mobilisation_watch_contractors(canonical_name)";

/** Signals that can carry an arrival or a stated stay, for the shared calendar. */
export function useScheduleSignals() {
  return useQuery({
    queryKey: ["mobilisation-calendar"],
    queryFn: async (): Promise<CalendarSignal[]> => {
      const sb = createClient();
      const withSchedule = await sb
        .from("mobilisation_signals")
        .select(`${SCHEDULE_COLUMNS}, arrival_at, ends_at`)
        .order("occurred_at", { ascending: false })
        .limit(1000);
      const result =
        withSchedule.error && scheduleColumnMissing(withSchedule.error.message)
          ? await sb.from("mobilisation_signals").select(SCHEDULE_COLUMNS).order("occurred_at", { ascending: false }).limit(1000)
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
    },
    staleTime: 60_000,
  });
}

/** Commercial and AIS signals that share a contractor or vessel with the open activity. */
export function useRelatedLayerSignals(watchId: number | null, vesselId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["project-related-signals", watchId, vesselId],
    enabled: enabled && (watchId != null || vesselId != null),
    queryFn: async (): Promise<RadarSignal[]> => {
      const sb = createClient();
      const filters: string[] = [];
      if (watchId != null) filters.push(`watch_contractor_id.eq.${watchId}`);
      if (vesselId != null) filters.push(`vessel_id.eq.${vesselId}`);
      const { data, error } = await sb
        .from("mobilisation_signals")
        .select(SIGNAL_COLUMNS)
        .in("source_layer", ["commercial", "ais"])
        .or(filters.join(","))
        .order("occurred_at", { ascending: false })
        .limit(12);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as SignalJoin[]).map(toRadar);
    },
    staleTime: 60_000,
  });
}
