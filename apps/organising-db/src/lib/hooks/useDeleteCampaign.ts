"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

export function useDeleteCampaign() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useAuthAwareMutation({
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
