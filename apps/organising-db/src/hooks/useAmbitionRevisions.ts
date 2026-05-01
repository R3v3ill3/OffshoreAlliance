"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

/**
 * A campaign_ambitions row that has review_due_since set.
 * Uses the actual column names from the campaign_ambitions table:
 *   campaign_ambition_id, campaign_id, category, label, review_due_since
 */
export interface DueAmbition {
  campaign_ambition_id: number;
  campaign_id: number;
  category: string;
  label: string;
  review_due_since: string;
  [key: string]: unknown;
}

/**
 * A campaign_ambition_revisions row.
 */
export interface AmbitionRevision {
  id: number;
  ambition_id: number;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  triggered_by_event_id: number | null;
  triggered_by_vote_id: number | null;
  triggered_by_event_type: string | null;
  reviewed_without_change: boolean;
  created_at: string;
}

// ──────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────

export function useAmbitionRevisions(campaignId: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const queryClient = useQueryClient();

  // All revision rows for this campaign (via the ambition FK)
  const revisionsQuery = useQuery<AmbitionRevision[]>({
    queryKey: ["ambition-revisions", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_ambition_revisions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AmbitionRevision[];
    },
    enabled: !!campaignId,
  });

  // Ambitions with review_due_since set (industrial_outcomes, this campaign)
  const dueAmbitionsQuery = useQuery<DueAmbition[]>({
    queryKey: ["due-ambitions", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_ambitions")
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("category", "industrial_outcomes")
        .not("review_due_since", "is", null);
      if (error) throw new Error(error.message);
      return (data ?? []) as DueAmbition[];
    },
    enabled: !!campaignId,
  });

  // Mark a single ambition as reviewed: write revision row + clear flag + apply changes
  const markReviewedMutation = useMutation({
    mutationFn: async ({
      ambitionId,
      reason,
      changedValues,
      reviewedWithoutChange,
    }: {
      ambitionId: number;
      reason: string;
      changedValues?: Record<string, unknown>;
      reviewedWithoutChange?: boolean;
    }) => {
      // Fetch current value
      const { data: current, error: fetchErr } = await supabase
        .from("campaign_ambitions")
        .select("*")
        .eq("campaign_ambition_id", ambitionId)
        .single();
      if (fetchErr) throw new Error(fetchErr.message);

      const noChange = reviewedWithoutChange ?? !changedValues;

      // Insert revision row (append-only)
      const { error: insertErr } = await supabase
        .from("campaign_ambition_revisions")
        .insert({
          ambition_id: ambitionId,
          previous_value: current,
          new_value: changedValues ? { ...current, ...changedValues } : current,
          reason,
          reviewed_without_change: noChange,
        });
      if (insertErr) throw new Error(insertErr.message);

      // Clear review_due_since
      const { error: clearErr } = await supabase
        .from("campaign_ambitions")
        .update({ review_due_since: null })
        .eq("campaign_ambition_id", ambitionId);
      if (clearErr) throw new Error(clearErr.message);

      // Apply field changes if provided
      if (changedValues && Object.keys(changedValues).length > 0) {
        const { error: updateErr } = await supabase
          .from("campaign_ambitions")
          .update(changedValues)
          .eq("campaign_ambition_id", ambitionId);
        if (updateErr) throw new Error(updateErr.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["due-ambitions", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["ambition-revisions", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ambitions", campaignId] });
    },
  });

  return {
    revisions: revisionsQuery.data ?? [],
    dueAmbitions: dueAmbitionsQuery.data ?? [],
    isLoading: dueAmbitionsQuery.isLoading,
    hasDueAmbitions: (dueAmbitionsQuery.data?.length ?? 0) > 0,
    markReviewed: markReviewedMutation.mutate,
    isMarkingReviewed: markReviewedMutation.isPending,
    markReviewedError: markReviewedMutation.error,
  };
}
