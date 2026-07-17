"use client";

/**
 * Coverage Map data hooks: the derived per-unit coverage view
 * (worker/member counts, density, leader/second/48h layer, status)
 * plus WOC unit representation. Own query keys — never the canonical
 * ["campaign-ous"] cache.
 */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { CoverageMapRow, CoverageSummaryRow, WocUnitRepresentationRow } from "./types";

export function useCoverageMap(campaignId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["coverage-map", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_campaign_coverage_map")
        .select("*")
        .eq("campaign_id", Number(campaignId))
        .order("ou_name");
      if (error) throw error;
      return (data ?? []) as CoverageMapRow[];
    },
  });
}

export function useCoverageSummary(campaignId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["coverage-summary", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_campaign_coverage_summary")
        .select("*")
        .eq("campaign_id", Number(campaignId))
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CoverageSummaryRow | null;
    },
  });
}

/** Per-unit WOC representation, deduped across committees: a unit is
 * "in a WOC's scope" if any WOC covers it, "represented" if any does. */
export function useWocRepresentationByUnit(campaignId: string) {
  const supabase = createClient();
  const query = useQuery({
    queryKey: ["woc-representation-by-unit", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_woc_unit_representation")
        .select("*")
        .eq("campaign_id", Number(campaignId));
      if (error) throw error;
      return (data ?? []) as WocUnitRepresentationRow[];
    },
  });
  const byUnit = useMemo(() => {
    const m = new Map<number, { inScope: boolean; represented: boolean }>();
    for (const r of query.data ?? []) {
      if (r.ou_id == null) continue;
      const prev = m.get(r.ou_id) ?? { inScope: false, represented: false };
      m.set(r.ou_id, {
        inScope: true,
        represented: prev.represented || !!r.represented,
      });
    }
    return m;
  }, [query.data]);
  return { ...query, byUnit };
}

export function useSaveOuCoverage(campaignId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async (args: {
      ouId: number;
      update: {
        leader_worker_id?: number | null;
        second_worker_id?: number | null;
        reachable_48h?: boolean | null;
        priority_action?: string | null;
      };
    }) => {
      const { error } = await supabase.from("campaign_ou_coverage").upsert(
        { ou_id: args.ouId, ...args.update },
        { onConflict: "ou_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coverage-map", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["coverage-summary", campaignId] });
    },
    onError: (e: Error) => toast.error(`Failed to save coverage: ${e.message}`),
  });
}
