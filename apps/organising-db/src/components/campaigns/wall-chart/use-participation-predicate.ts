"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ParticipationSource } from "./participation-selector";

export type ParticipationResult = {
  /** True when the default metric logic (any rating recorded) should apply. */
  useAnyRatingFallback: boolean;
  /** Worker ids that participated in the resolved source. Empty when still loading. */
  participatedIds: Set<number>;
};

/**
 * Resolves participation membership for the selected source.
 * - kind "any" → returns `useAnyRatingFallback: true`; callers omit the predicate
 *   so the default "any rating recorded" metric logic applies.
 * - otherwise → fetches rating rows for the resolved activity and returns the
 *   set of worker_ids that participated.
 */
export function useParticipationPredicate(
  campaignId: string,
  source: ParticipationSource
): ParticipationResult {
  const supabase = createClient();

  const { data: latestActivity } = useQuery({
    queryKey: ["wallchart-latest-activity", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activities")
        .select("activity_id")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data ?? [])[0] as { activity_id: number } | undefined;
    },
    enabled: source.kind === "latest",
  });

  const resolvedActivityId =
    source.kind === "activity"
      ? source.activityId
      : source.kind === "task_list"
      ? source.activityId
      : source.kind === "latest"
      ? latestActivity?.activity_id ?? null
      : null;

  const { data: ratedIds } = useQuery({
    queryKey: ["wallchart-participation", campaignId, source.kind, resolvedActivityId],
    queryFn: async () => {
      if (resolvedActivityId == null) return new Set<number>();
      const { data, error } = await supabase
        .from("campaign_activity_ratings")
        .select("worker_id")
        .eq("activity_id", resolvedActivityId);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.worker_id as number));
    },
    enabled: resolvedActivityId != null,
  });

  return {
    useAnyRatingFallback: source.kind === "any",
    participatedIds: ratedIds ?? new Set<number>(),
  };
}
