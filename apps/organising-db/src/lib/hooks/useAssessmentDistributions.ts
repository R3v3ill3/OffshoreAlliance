"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchWallChartAssessmentOptions } from "@/components/campaigns/wall-chart/assessment-selector";
import { collapseActivityRatingsToWorkerMap } from "@/lib/utils/collapse-activity-ratings";
import type { WallChartAssessmentOption, WallChartOU } from "@/components/campaigns/wall-chart/types";
import { ouDisplayName } from "@/components/campaigns/wall-chart/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AmbitionTarget = {
  ambitionId: number;
  targetPct: number;
  label: string;
};

export type RatingDistribution = {
  entityId: string;
  entityLabel: string;
  totalWorkers: number;
  counts: { r0: number; r1: number; r2: number; r3: number; r4: number; r5: number };
  pcts: { r0: number; r1: number; r2: number; r3: number; r4: number; r5: number };
  supportivePct: number;
  metTarget: boolean;
};

export type OuGroup = {
  ouType: string | null;
  units: WallChartOU[];
  allWorkerIds: Set<number>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAssessmentDistributions(campaignId: string) {
  const supabase = createClient();

  // 1. Assessment options (sorted by last_rated_at desc)
  const { data: assessmentOptions = [], isLoading: loadingOptions } = useQuery({
    queryKey: ["campaign-assessments-rated", campaignId],
    queryFn: () => fetchWallChartAssessmentOptions(supabase, campaignId),
  });

  // 2. Campaign member IDs (the universe for unassessed count)
  const { data: memberRows = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["campaign-members", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select("worker_id")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as { worker_id: number }[];
    },
  });

  // 3. Organising units
  const { data: ous = [], isLoading: loadingOus } = useQuery({
    queryKey: ["campaign-ous", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, campaign_id, name, ou_type, total_workers_estimated, display_order")
        .eq("campaign_id", campaignId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WallChartOU[];
    },
  });

  const ouIdsKey = ous.map((o) => o.ou_id).join(",");

  // 4. Worker-OU assignments
  const { data: ouAssign = [], isLoading: loadingOuAssign } = useQuery({
    queryKey: ["campaign-worker-ou", campaignId, ouIdsKey],
    queryFn: async () => {
      if (ous.length === 0) return [];
      const { data, error } = await supabase
        .from("campaign_worker_ou")
        .select("ou_id, worker_id")
        .in(
          "ou_id",
          ous.map((o) => o.ou_id)
        );
      if (error) throw error;
      return (data ?? []) as { ou_id: number; worker_id: number }[];
    },
    enabled: ous.length > 0,
  });

  const activityIds = assessmentOptions.map((o) => o.activity_id);
  const activityIdsKey = activityIds.join(",");

  // 5. All activity ratings for all assessment activities
  const { data: rawRatings = [], isLoading: loadingRatings } = useQuery({
    queryKey: ["campaign-activity-ratings-dist", campaignId, activityIdsKey],
    queryFn: async () => {
      if (activityIds.length === 0) return [];
      const { data, error } = await supabase
        .from("campaign_activity_ratings")
        .select("rating_id, activity_id, worker_id, rating, binary_value, rating_phase, rated_at, source, notes")
        .in("activity_id", activityIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: activityIds.length > 0,
  });

  // 6. Ambition targets linked to assessment activities
  const { data: ambitionRows = [], isLoading: loadingAmbitions } = useQuery({
    queryKey: ["campaign-assessment-ambition-targets", campaignId, activityIdsKey],
    queryFn: async () => {
      if (activityIds.length === 0) return [];
      const { data, error } = await supabase
        .from("activity_ambitions")
        .select(
          `activity_id, is_primary, plan_ambition_id,
           plan_ambitions(ambition_id, metric_type, target_value, custom_text, ambition_option_id,
             ambition_options(option_id, option_text))`
        )
        .in("activity_id", activityIds);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        activity_id: number;
        is_primary: boolean;
        plan_ambition_id: number;
        plan_ambitions: {
          ambition_id: number;
          metric_type: string | null;
          target_value: string | null;
          custom_text: string | null;
          ambition_option_id: number | null;
          ambition_options: { option_id: number; option_text: string } | null;
        } | null;
      }>;
    },
    enabled: activityIds.length > 0,
  });

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const allMemberIds = useMemo(
    () => new Set(memberRows.map((r) => r.worker_id)),
    [memberRows]
  );

  const ratingsByActivity = useMemo(() => {
    const byActivity = new Map<number, typeof rawRatings>();
    for (const row of rawRatings) {
      const arr = byActivity.get(row.activity_id) ?? [];
      arr.push(row);
      byActivity.set(row.activity_id, arr);
    }
    const result = new Map<number, Map<number, number | null>>();
    for (const [activityId, rows] of byActivity.entries()) {
      const collapsed = collapseActivityRatingsToWorkerMap(rows as Parameters<typeof collapseActivityRatingsToWorkerMap>[0]);
      const workerRatings = new Map<number, number | null>();
      for (const [workerId, rating] of collapsed.entries()) {
        workerRatings.set(workerId, rating.rating);
      }
      result.set(activityId, workerRatings);
    }
    return result;
  }, [rawRatings]);

  const ambitionTargetByActivity = useMemo(() => {
    const result = new Map<number, AmbitionTarget | null>();
    // Group by activity_id, preferring is_primary=true, then lowest plan_ambition_id
    const byActivity = new Map<number, typeof ambitionRows>();
    for (const row of ambitionRows) {
      const arr = byActivity.get(row.activity_id) ?? [];
      arr.push(row);
      byActivity.set(row.activity_id, arr);
    }
    for (const [activityId, rows] of byActivity.entries()) {
      const sorted = [...rows].sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return a.plan_ambition_id - b.plan_ambition_id;
      });
      let found: AmbitionTarget | null = null;
      for (const row of sorted) {
        const pa = row.plan_ambitions;
        if (!pa || pa.metric_type !== "percentage" || !pa.target_value) continue;
        const parsed = parseFloat(pa.target_value);
        if (!isFinite(parsed)) continue;
        const label =
          pa.custom_text?.trim() ||
          pa.ambition_options?.option_text ||
          `Ambition #${pa.ambition_id}`;
        found = { ambitionId: pa.ambition_id, targetPct: parsed, label };
        break;
      }
      result.set(activityId, found);
    }
    // Ensure every assessment activity has an entry (null if no percentage ambition)
    for (const id of activityIds) {
      if (!result.has(id)) result.set(id, null);
    }
    return result;
  }, [ambitionRows, activityIds]);

  const ouGroups = useMemo((): OuGroup[] => {
    const workersByOu = new Map<number, Set<number>>();
    for (const a of ouAssign) {
      const s = workersByOu.get(a.ou_id) ?? new Set<number>();
      s.add(a.worker_id);
      workersByOu.set(a.ou_id, s);
    }
    const distinctTypes: (string | null)[] = [...new Set<string | null>(ous.map((o: WallChartOU) => o.ou_type as string | null))];
    return distinctTypes.map((ouType): OuGroup => {
      const units = ous.filter((o: WallChartOU) => o.ou_type === ouType);
      const allWorkerIds = new Set<number>();
      for (const unit of units) {
        for (const wid of workersByOu.get(unit.ou_id) ?? []) {
          allWorkerIds.add(wid);
        }
      }
      return { ouType, units, allWorkerIds };
    });
  }, [ous, ouAssign]);

  const workersByOu = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const a of ouAssign) {
      const s = map.get(a.ou_id) ?? new Set<number>();
      s.add(a.worker_id);
      map.set(a.ou_id, s);
    }
    return map;
  }, [ouAssign]);

  const defaultAssessmentIds = useMemo((): number[] => {
    const withRatings = assessmentOptions.filter((o) => o.last_rated_at != null);
    const candidates = withRatings.length > 0 ? withRatings : assessmentOptions;
    return candidates.slice(0, 3).map((o) => o.activity_id);
  }, [assessmentOptions]);

  // ---------------------------------------------------------------------------
  // Pure compute functions
  // ---------------------------------------------------------------------------

  function buildDistribution(
    entityId: string,
    entityLabel: string,
    workerIds: Iterable<number>,
    ratingMap: Map<number, number | null>,
    ambitionTarget: AmbitionTarget | null
  ): RatingDistribution {
    const counts = { r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
    let total = 0;
    for (const wid of workerIds) {
      total++;
      const r = ratingMap.get(wid);
      if (r == null) {
        counts.r0++;
      } else {
        const key = `r${r}` as keyof typeof counts;
        if (key in counts) counts[key]++;
        else counts.r0++;
      }
    }
    const pcts = {
      r0: total > 0 ? Math.round((counts.r0 / total) * 1000) / 10 : 0,
      r1: total > 0 ? Math.round((counts.r1 / total) * 1000) / 10 : 0,
      r2: total > 0 ? Math.round((counts.r2 / total) * 1000) / 10 : 0,
      r3: total > 0 ? Math.round((counts.r3 / total) * 1000) / 10 : 0,
      r4: total > 0 ? Math.round((counts.r4 / total) * 1000) / 10 : 0,
      r5: total > 0 ? Math.round((counts.r5 / total) * 1000) / 10 : 0,
    };
    const supportivePct = total > 0 ? Math.round(((counts.r1 + counts.r2) / total) * 1000) / 10 : 0;
    const metTarget = ambitionTarget != null && supportivePct >= ambitionTarget.targetPct;
    return { entityId, entityLabel, totalWorkers: total, counts, pcts, supportivePct, metTarget };
  }

  function computeDistributions(
    activityId: number,
    ouType: string | null
  ): {
    campaignRow: RatingDistribution;
    ouRows: RatingDistribution[];
    ambitionTarget: AmbitionTarget | null;
  } {
    const ratingMap = ratingsByActivity.get(activityId) ?? new Map<number, number | null>();
    const ambitionTarget = ambitionTargetByActivity.get(activityId) ?? null;

    const campaignRow = buildDistribution("campaign", "Whole Campaign", allMemberIds, ratingMap, ambitionTarget);

    const group = ouGroups.find((g) => g.ouType === ouType);
    if (!group) return { campaignRow, ouRows: [], ambitionTarget };

    const ouRows = group.units
      .map((ou): RatingDistribution => {
        const ids = workersByOu.get(ou.ou_id) ?? new Set<number>();
        return buildDistribution(
          String(ou.ou_id),
          ouDisplayName(ou),
          ids,
          ratingMap,
          ambitionTarget
        );
      })
      .sort((a, b) => {
        const ouA = group.units.find((u) => String(u.ou_id) === a.entityId);
        const ouB = group.units.find((u) => String(u.ou_id) === b.entityId);
        const estA = ouA?.total_workers_estimated ?? 0;
        const estB = ouB?.total_workers_estimated ?? 0;
        if (estB !== estA) return estB - estA;
        return (b.counts.r1 + b.counts.r2) - (a.counts.r1 + a.counts.r2);
      });

    return { campaignRow, ouRows, ambitionTarget };
  }

  function defaultOuType(forActivityIds: number[]): string | null {
    if (ouGroups.length === 0) return null;
    if (ouGroups.length === 1) return ouGroups[0].ouType;

    let bestGroup = ouGroups[0];
    let bestCompleteness = -1;

    for (const group of ouGroups) {
      if (group.allWorkerIds.size === 0) continue;
      let assessed = 0;
      for (const actId of forActivityIds) {
        const ratingMap = ratingsByActivity.get(actId) ?? new Map<number, number | null>();
        for (const wid of group.allWorkerIds) {
          const r = ratingMap.get(wid);
          if (r != null) assessed++;
        }
      }
      const avgCompleteness =
        forActivityIds.length > 0
          ? assessed / (group.allWorkerIds.size * forActivityIds.length)
          : 0;
      if (avgCompleteness > bestCompleteness) {
        bestCompleteness = avgCompleteness;
        bestGroup = group;
      } else if (avgCompleteness === bestCompleteness && group.allWorkerIds.size > bestGroup.allWorkerIds.size) {
        bestGroup = group;
      }
    }
    return bestGroup.ouType;
  }

  const isLoading = loadingOptions || loadingMembers || loadingOus || loadingOuAssign || loadingRatings || loadingAmbitions;

  return {
    assessmentOptions,
    defaultAssessmentIds,
    ouGroups,
    computeDistributions,
    defaultOuType,
    isLoading,
  };
}
