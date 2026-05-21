import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

export type BatchSaveActivityRatingsArgs = {
  activityId: number;
  workerIds: number[];
  rating: number | null;
  binaryValue: string | null;
  notes?: string | null;
  source?: string;
  ratingPhase?: "actual" | "expected";
};

/**
 * Upserts the same rating/binary value for multiple workers against a single
 * campaign activity. Used by the workforce bulk-action toolbar.
 *
 * Note: this is the bulk equivalent of `useSaveActivityRating`. It does NOT
 * support per-worker rating notes (a deliberate scoping choice — a single
 * note string for a batch would be confusing) and does NOT support per-worker
 * event_id (always null). The unique constraint
 * `(activity_id, worker_id, rating_phase, event_id)` is honoured so re-running
 * the bulk action just updates the existing rows.
 */
export function useBatchSaveActivityRatings(campaignId: string | number) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useAuthAwareMutation<
    { upserted: number },
    Error,
    BatchSaveActivityRatingsArgs
  >({
    mutationFn: async (args) => {
      if (args.workerIds.length === 0) return { upserted: 0 };
      const now = new Date().toISOString();
      const rows = args.workerIds.map((workerId) => ({
        activity_id: args.activityId,
        worker_id: workerId,
        rating: args.rating,
        binary_value: args.binaryValue,
        notes: args.notes?.trim() ? args.notes.trim() : null,
        source: args.source ?? "staff",
        rated_at: now,
        rating_phase: args.ratingPhase ?? "actual",
        event_id: null,
      }));
      const { error } = await supabase
        .from("campaign_activity_ratings")
        .upsert(rows, {
          onConflict: "activity_id,worker_id,rating_phase,event_id",
        });
      if (error) throw error;
      return { upserted: rows.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings", campaignId] });
      queryClient.invalidateQueries({
        queryKey: ["campaign-activity-ratings-dist", campaignId],
      });
    },
  });
}
