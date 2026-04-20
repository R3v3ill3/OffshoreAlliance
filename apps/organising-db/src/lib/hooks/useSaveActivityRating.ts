import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

export type SaveActivityRatingArgs = {
  activityId: number;
  workerId: number;
  rating: number | null;
  binary_value: string | null;
  notes?: string | null;
  source?: string;
  rating_phase?: "actual" | "expected";
  event_id?: number | null;
};

export type UseSaveActivityRatingOptions = {
  campaignId: string | number;
  onSuccess?: (args: SaveActivityRatingArgs) => void;
  onError?: (err: Error, args: SaveActivityRatingArgs) => void;
};

/**
 * Shared mutation for upserting a row into `campaign_activity_ratings`.
 * Used by both the worker detail sheet (Ratings tab) and the wall chart
 * inline rating popover.
 *
 * On success, invalidates the campaign rating summary (cumulative tile colour),
 * the per-activity ratings query (assessment-mode tile colour), and the
 * per-worker ratings history (drawer).
 */
export function useSaveActivityRating({
  campaignId,
  onSuccess,
  onError,
}: UseSaveActivityRatingOptions) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useAuthAwareMutation<void, Error, SaveActivityRatingArgs>({
    mutationFn: async (args) => {
      const payload = {
        activity_id: args.activityId,
        worker_id: args.workerId,
        rating: args.rating,
        binary_value: args.binary_value,
        notes: args.notes?.trim() ? args.notes.trim() : null,
        source: args.source ?? "staff",
        rated_at: new Date().toISOString(),
        rating_phase: args.rating_phase ?? "actual",
        event_id: args.event_id ?? null,
      };
      const { error } = await supabase
        .from("campaign_activity_ratings")
        .upsert(payload, {
          onConflict: "activity_id,worker_id,rating_phase,event_id",
        });
      if (error) throw error;
    },
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({
        queryKey: ["campaign-rating-summary", campaignId],
      });
      queryClient.invalidateQueries({
        queryKey: ["campaign-activity-ratings", campaignId, args.activityId],
      });
      queryClient.invalidateQueries({
        queryKey: ["worker-activity-ratings", campaignId, args.workerId],
      });
      onSuccess?.(args);
    },
    onError: (err, args) => {
      onError?.(err as Error, args);
    },
  });
}
