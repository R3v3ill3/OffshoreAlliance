"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { renderSituationContext } from "@/lib/situation-analysis/serialise";
import type { CampaignSituationAnalysis } from "@/lib/situation-analysis/types";

/**
 * Read the current situation analysis row for a campaign on the client.
 * Returns `null` when the campaign has no analysis on file (or when the
 * environment doesn't have the migration applied yet).
 *
 * Pairs with `loadSituationContextString` (server-side) — both render the
 * same text via `renderSituationContext`.
 */
export function useSituationAnalysis(campaignId: number | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["campaign-situation-analysis", campaignId],
    queryFn: async (): Promise<{
      row: CampaignSituationAnalysis | null;
      contextString: string | null;
    }> => {
      if (!campaignId) return { row: null, contextString: null };
      try {
        const { data, error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("campaign_situation_analyses" as any)
          .select("*")
          .eq("campaign_id", campaignId)
          .eq("is_current", true)
          .maybeSingle();
        if (error || !data) return { row: null, contextString: null };
        const row = data as unknown as CampaignSituationAnalysis;
        return { row, contextString: renderSituationContext(row) };
      } catch {
        return { row: null, contextString: null };
      }
    },
    enabled: !!campaignId,
    staleTime: 60_000,
  });
}
