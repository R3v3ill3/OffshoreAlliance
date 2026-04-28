"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ParticipationSource } from "./participation-selector";
import type { WallChartRatingSummary } from "./types";

export type ParticipationResult = {
  /**
   * Deprecated — retained for API compatibility but always false now.
   * The "any" source previously meant "any rating recorded"; it now means
   * "supportive on ≥1 activity" and is backed by the campaign rating summary.
   */
  useAnyRatingFallback: boolean;
  /** Worker ids that count as participating for the resolved source. */
  participatedIds: Set<number>;
};

/**
 * Resolves participation membership for the selected source.
 *
 * - kind "any" → ids come from the already-loaded campaign rating summary
 *   (`has_supportive_activity_rating = true`). This means the "Any supportive
 *   rating" view consistently reflects real observed support, not just any
 *   rating row.
 * - kind "latest" → resolves the most recent activity and fetches that
 *   activity's raters (any rating counts, unchanged).
 * - kind "activity" / "task_list" → fetches that activity's raters (unchanged).
 */
export function useParticipationPredicate(
  campaignId: string,
  source: ParticipationSource,
  ratingSummary?: WallChartRatingSummary[]
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
      const first = (data ?? [])[0] as { activity_id: number } | undefined;
      return first ?? null;
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

  // "any" → derive from the campaign rating summary. Empty until the
  // summary loads; computeMetrics tolerates an empty predicate.
  const supportiveIds = useMemo(() => {
    if (source.kind !== "any") return new Set<number>();
    const set = new Set<number>();
    for (const r of ratingSummary ?? []) {
      if (r.has_supportive_activity_rating) set.add(r.worker_id);
    }
    return set;
  }, [source.kind, ratingSummary]);

  return {
    useAnyRatingFallback: false,
    participatedIds: source.kind === "any" ? supportiveIds : ratedIds ?? new Set<number>(),
  };
}
