"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

export type MatchAction =
  | "confirm"
  | "override"
  | "create_link"
  | "reject"
  | "reopen";

export interface ConfirmMatchInput {
  id: number;
  action: MatchAction;
  employer_id?: number | null;
  notes?: string | null;
}

export function useConfirmUpcomingProjectMatch() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async (input: ConfirmMatchInput) => {
      const { data, error } = await supabase.rpc(
        "confirm_upcoming_project_match",
        { payload: input }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-projects"] });
    },
  });
}
