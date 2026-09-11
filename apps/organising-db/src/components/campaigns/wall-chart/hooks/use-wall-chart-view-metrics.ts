import { useCallback, useMemo, useState } from "react";

import {
  trackWallchartFilterApplied,
  trackWallchartFirstInteraction,
  type Interaction,
} from "@/lib/analytics/events";
import {
  firstInteractionPayload,
  hasFiredFirstInteraction,
  markFirstInteractionFired,
  readLoginStamp,
} from "@/lib/analytics/session-timing";
import {
  DEFAULT_FILTER_STATE,
  activeFilterKeys,
  type WallChartFilterState,
} from "../filters";
import { computeMetrics } from "../metrics";
import { type ParticipationSource } from "../participation-selector";
import { useDerivedOptions } from "../wall-chart-filter-bar";
import { useDisplayMode } from "../use-display-mode";
import { useParticipationPredicate } from "../use-participation-predicate";
import {
  UNASSIGNED_KEY,
  buildAssessmentMetricsInput,
  effectiveAssessmentForScope,
  hierarchyViewKey,
  readHierarchyView,
  type UnitHierarchyViewMode,
} from "../wall-chart-model";
import type { WallChartCoreData } from "./use-wall-chart-core-data";
import type { WallChartStructure } from "./use-wall-chart-structure";

/**
 * WP2.3 block D — the wall chart's view and metrics, moved verbatim out of
 * `campaign-wall-chart.tsx` (`WC:885–1115`). Grey slots, display mode,
 * unit-hierarchy view state, the participation predicate, per-scope filter
 * reads and writes with their WP0.2 telemetry, filter option labels, and the
 * campaign / per-unit / unassigned metric computations.
 */
export function useWallChartViewMetrics({
  campaignId,
  scopeState,
  ratingSummary,
  ous,
  campaign,
  index,
  activityRatingsByActivityId,
}: {
  campaignId: string;
  scopeState: WallChartCoreData["scopeState"];
  ratingSummary: WallChartCoreData["ratingSummary"];
  ous: WallChartStructure["ous"];
  campaign: WallChartStructure["campaign"];
  index: WallChartStructure["index"];
  activityRatingsByActivityId: WallChartCoreData["activityRatings"];
}) {
  const {
    campaignAssessmentDefault,
    unitAssessmentOverride,
    filterByScope,
    setFilterByScope,
  } = scopeState;
  const {
    memberRows,
    workerById,
    ratingByWorker,
    unitsByWorker,
    unassignedWorkerIds,
    workersByOu,
    childrenByParent,
  } = index;

  const estimate = (campaign?.total_worker_estimate as number | null) ?? 0;
  const named = memberRows.length;
  const campaignGreySlots = Math.max(0, estimate - named);

  const [displayMode, setDisplayMode] = useDisplayMode(campaignId);
  const [hierarchyViewByParent, setHierarchyViewByParent] = useState<
    Map<number, UnitHierarchyViewMode>
  >(() => readHierarchyView(campaignId));
  const setHierarchyViewForParent = useCallback(
    (parentOuId: number, mode: UnitHierarchyViewMode) => {
      setHierarchyViewByParent((prev) => {
        const next = new Map(prev);
        next.set(parentOuId, mode);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              hierarchyViewKey(campaignId),
              JSON.stringify(Object.fromEntries(next))
            );
          } catch {
            // ignore
          }
        }
        return next;
      });
    },
    [campaignId]
  );

  /** Returns true when every parent OU with children is currently in sub-unit view. */
  const allParentsExpanded = useMemo(() => {
    const parents = ous.filter((o) => (childrenByParent.get(o.ou_id)?.length ?? 0) > 0);
    if (parents.length === 0) return false;
    return parents.every((o) => {
      const stored = hierarchyViewByParent.get(o.ou_id);
      if (stored !== undefined) return stored === "subunit";
      return !!o.is_group_container;
    });
  }, [ous, childrenByParent, hierarchyViewByParent]);

  const setAllHierarchyViews = useCallback(
    (mode: UnitHierarchyViewMode) => {
      const parents = ous.filter((o) => (childrenByParent.get(o.ou_id)?.length ?? 0) > 0);
      setHierarchyViewByParent((prev) => {
        const next = new Map(prev);
        for (const o of parents) next.set(o.ou_id, mode);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              hierarchyViewKey(campaignId),
              JSON.stringify(Object.fromEntries(next))
            );
          } catch {
            // ignore
          }
        }
        return next;
      });
    },
    [ous, childrenByParent, campaignId]
  );
  const [participationSource, setParticipationSource] = useState<ParticipationSource>({
    kind: "any",
  });
  const participation = useParticipationPredicate(campaignId, participationSource, ratingSummary);
  const participationPredicate = useMemo(() => {
    if (participation.useAnyRatingFallback) return undefined;
    const ids = participation.participatedIds;
    return (workerId: number) => ids.has(workerId);
  }, [participation.useAnyRatingFallback, participation.participatedIds]);

  // Per-unit filter state key: 0 = unassigned, positive = ou_id.
  // (State is declared earlier so the ratings query can react to it.)
  // UNASSIGNED_KEY is imported from wall-chart-model.

  const getFilter = (scope: number) => filterByScope.get(scope) ?? DEFAULT_FILTER_STATE();

  /**
   * wallchart_first_interaction (WP0.2) — fires at most once per browser tab,
   * so the §8 "seconds from login to the wall chart" metric is one number per
   * login rather than one per campaign opened in the same sitting. The whole
   * once-per-session + timing decision lives in the pure
   * `firstInteractionPayload`; a null payload means "do not fire".
   */
  const noteFirstInteraction = useCallback(
    (interaction: Interaction) => {
      const payload = firstInteractionPayload({
        stamp: readLoginStamp(),
        now: Date.now(),
        campaignId: Number(campaignId),
        interaction,
        alreadyFired: hasFiredFirstInteraction(),
      });
      if (!payload) return;
      markFirstInteractionFired();
      trackWallchartFirstInteraction(payload);
    },
    [campaignId]
  );

  const setFilter = (scope: number, next: WallChartFilterState) => {
    // wallchart_filter_applied (WP0.2). One function covers both filter bars
    // (Unassigned card and every unit card) and Sort, which WallChartFilterBar
    // routes through the same onChange — hence sort_key on the event.
    const keys = activeFilterKeys(next);
    trackWallchartFilterApplied({
      campaign_id: Number(campaignId),
      scope: scope === UNASSIGNED_KEY ? "unassigned" : "unit",
      filter_keys: keys,
      sort_key: next.sort,
    });
    noteFirstInteraction("filter");
    setFilterByScope((prev) => {
      const copy = new Map(prev);
      copy.set(scope, next);
      return copy;
    });
  };

  /** "Apply to all units" — shared by the Unassigned and unit filter bars. */
  const applyToAllScopes = (filter: WallChartFilterState) => {
    const keys = activeFilterKeys(filter);
    trackWallchartFilterApplied({
      campaign_id: Number(campaignId),
      scope: "all",
      filter_keys: keys,
      sort_key: filter.sort,
    });
    noteFirstInteraction("filter");
    const next = new Map<number, WallChartFilterState>();
    next.set(UNASSIGNED_KEY, { ...filter });
    for (const ou of ous) next.set(ou.ou_id, { ...filter });
    setFilterByScope(next);
  };

  // Labels for filter options, derived from the already-fetched worker data.
  const filterLabels = useMemo(() => {
    const membershipTypes = new Map<number, string>();
    const occupations = new Map<number, string>();
    for (const row of memberRows) {
      const w = row.worker;
      if (!w) continue;
      if (w.union_membership_type_id != null && w.union_membership_type) {
        const label =
          w.union_membership_type.display_name ??
          w.union_membership_type.type_name ??
          `Type ${w.union_membership_type_id}`;
        membershipTypes.set(w.union_membership_type_id, label);
      }
      if (w.canonical_occupation_id != null && w.canonical_occupation) {
        occupations.set(w.canonical_occupation_id, w.canonical_occupation.canonical_name);
      }
    }
    return { membershipTypes, occupations };
  }, [memberRows]);

  const derivedOptions = useDerivedOptions(memberRows, filterLabels);

  const allWorkerIds = useMemo(() => memberRows.map((r) => r.worker_id), [memberRows]);

  const campaignMetricsInput = useMemo(
    () => buildAssessmentMetricsInput(campaignAssessmentDefault, activityRatingsByActivityId),
    [campaignAssessmentDefault, activityRatingsByActivityId]
  );

  const campaignMetrics = useMemo(
    () =>
      computeMetrics(
        allWorkerIds,
        workerById,
        ratingByWorker,
        participationPredicate,
        campaignMetricsInput
      ),
    [allWorkerIds, workerById, ratingByWorker, participationPredicate, campaignMetricsInput]
  );

  const metricsByOu = useMemo(() => {
    const m = new Map<number, ReturnType<typeof computeMetrics>>();
    for (const [ouId, ids] of workersByOu.entries()) {
      const effective = effectiveAssessmentForScope(
        ouId,
        campaignAssessmentDefault,
        unitAssessmentOverride
      );
      const input = buildAssessmentMetricsInput(effective, activityRatingsByActivityId);
      const multiUnitWorkerIds = new Set(
        ids.filter((id) => (unitsByWorker.get(id)?.length ?? 0) > 1)
      );
      m.set(
        ouId,
        computeMetrics(ids, workerById, ratingByWorker, participationPredicate, input, {
          multiUnitWorkerIds,
        })
      );
    }
    return m;
  }, [
    workersByOu,
    workerById,
    ratingByWorker,
    participationPredicate,
    campaignAssessmentDefault,
    unitAssessmentOverride,
    activityRatingsByActivityId,
    unitsByWorker,
  ]);

  const unassignedMetrics = useMemo(() => {
    const effective = effectiveAssessmentForScope(
      UNASSIGNED_KEY,
      campaignAssessmentDefault,
      unitAssessmentOverride
    );
    const input = buildAssessmentMetricsInput(effective, activityRatingsByActivityId);
    return computeMetrics(
      unassignedWorkerIds,
      workerById,
      ratingByWorker,
      participationPredicate,
      input
    );
  }, [
    unassignedWorkerIds,
    workerById,
    ratingByWorker,
    participationPredicate,
    campaignAssessmentDefault,
    unitAssessmentOverride,
    activityRatingsByActivityId,
  ]);
  return {
    campaignGreySlots,
    displayMode: { mode: displayMode, setMode: setDisplayMode },
    hierarchy: {
      viewByParent: hierarchyViewByParent,
      setHierarchyViewForParent,
      allParentsExpanded,
      setAllHierarchyViews,
    },
    participation: {
      source: participationSource,
      setSource: setParticipationSource,
      state: participation,
      predicate: participationPredicate,
    },
    filters: {
      getFilter,
      setFilter,
      applyToAllScopes,
      noteFirstInteraction,
      filterLabels,
    },
    derivedOptions,
    metrics: { campaignMetrics, metricsByOu, unassignedMetrics },
  };
}

export type WallChartViewMetrics = ReturnType<typeof useWallChartViewMetrics>;
