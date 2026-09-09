"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";

/**
 * Write access for a set of campaigns, in one RPC. The source of truth is the
 * database: `campaigns_i_can_write` applies the same rule as the WP1.6 write
 * policies (role floor AND can_write_to_campaign), so the UI never
 * re-implements it.
 *
 * `createClient()` returns an untyped `SupabaseClient`, so the RPC name needs
 * no cast even before the generated types know it.
 */
export function useCampaignWriteAccess(campaignIds: number[]) {
  const supabase = createClient();
  const { canWrite } = useAuth();
  const ids = [...new Set(campaignIds.filter((n) => Number.isFinite(n) && n > 0))].sort(
    (a, b) => a - b
  );
  return useQuery({
    queryKey: ["campaign-write-access", ids],
    enabled: canWrite && ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campaigns_i_can_write", { p_campaign_ids: ids });
      if (error) throw error;
      const rows: unknown[] = Array.isArray(data) ? data : [];
      return new Set<number>(rows.map((n) => Number(n)));
    },
  });
}

/**
 * Single-campaign convenience. `canWriteCampaign` is false while loading and
 * false when the RPC is unavailable (e.g. after a rollback); callers that
 * want "keep today's behaviour until the answer arrives" read `isLoading`.
 */
export function useCanWriteToCampaign(campaignId: string | number | undefined): {
  canWriteCampaign: boolean;
  isLoading: boolean;
} {
  const id = Number(campaignId);
  const { data, isLoading } = useCampaignWriteAccess(Number.isFinite(id) ? [id] : []);
  const { canWrite } = useAuth();
  return { canWriteCampaign: canWrite && (data?.has(id) ?? false), isLoading };
}
