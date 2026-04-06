"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useDeleteCampaign() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: number) => {
      const { error } = await supabase.rpc("delete_campaign", { p_campaign_id: campaignId });
      if (error) throw error;
    },
    onSuccess: (_data, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });
}
