"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  MemberEndorsementVote,
  MemberEndorsementVoteInsert,
  MemberEndorsementVoteUpdate,
} from "@oa/db-types";

const QUERY_KEY = "endorsement-votes";

// ──────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────

/**
 * Fetches all endorsement vote records for a campaign, ordered newest
 * first. Returns an empty array when the table doesn't exist yet or
 * when no votes have been recorded.
 */
export function useEndorsementVotes(campaignId: number | null | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: [QUERY_KEY, campaignId],
    queryFn: async (): Promise<MemberEndorsementVote[]> => {
      if (!campaignId) return [];
      try {
        const { data, error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("member_endorsement_votes" as any)
          .select("*")
          .eq("campaign_id", campaignId)
          .order("created_at", { ascending: false });

        if (error) {
          console.warn("[useEndorsementVotes] query error:", error.message);
          return [];
        }
        return (data ?? []) as unknown as MemberEndorsementVote[];
      } catch {
        return [];
      }
    },
    enabled: !!campaignId,
    staleTime: 30_000,
  });
}

// ──────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────

/** Creates a new endorsement vote record for a campaign. */
export function useCreateEndorsementVote(campaignId: number | null | undefined) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: Omit<MemberEndorsementVoteInsert, "campaign_id">
    ): Promise<MemberEndorsementVote> => {
      if (!campaignId) throw new Error("campaignId is required");

      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("member_endorsement_votes" as any)
        .insert({ ...input, campaign_id: campaignId })
        .select()
        .single();

      if (error) {
        const parts = [error.message, error.details, error.hint].filter(Boolean);
        throw new Error(parts.join(" — ") || "Failed to create endorsement vote");
      }
      return data as unknown as MemberEndorsementVote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaignId] });
    },
  });
}

/** Updates an existing endorsement vote record. */
export function useUpdateEndorsementVote(campaignId: number | null | undefined) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      vote_id,
      ...updates
    }: MemberEndorsementVoteUpdate & { vote_id: number }): Promise<MemberEndorsementVote> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("member_endorsement_votes" as any)
        .update(updates)
        .eq("vote_id", vote_id)
        .select()
        .single();

      if (error) {
        const parts = [error.message, error.details, error.hint].filter(Boolean);
        throw new Error(parts.join(" — ") || "Failed to update endorsement vote");
      }
      return data as unknown as MemberEndorsementVote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaignId] });
    },
  });
}
