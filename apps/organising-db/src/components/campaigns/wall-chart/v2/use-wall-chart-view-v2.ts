import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

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
import { filterStateFromPrefs, filterStateToPrefs, type WallChartPrefs } from "@/lib/campaign/groups/wall-chart-prefs";
import type { SetWallChartPrefs } from "@/lib/hooks/useUserCampaignPrefs";
import { collapseActivityRatingsToWorkerMap } from "@/lib/utils/collapse-activity-ratings";
import {
  activeFilterKeys,
  applyFilters,
  applySort,
  factSortOpts,
  hasParticipationFilter,
  type WallChartFilterState,
} from "../filters";
import { computeMetrics, type WallChartMetrics } from "../metrics";
import type { ParticipationSource } from "../participation-selector";
import type { DisplayMode } from "../unit-summary-metrics";
import { useParticipationPredicate } from "../use-participation-predicate";
import { useDerivedOptions } from "../wall-chart-filter-bar";
import { buildAssessmentMetricsInput } from "../wall-chart-model";
import type { ActivityRating, AssessmentSelection, ListActivityChannel } from "../types";
import type { WallChartCoreData } from "../hooks/use-wall-chart-core-data";
import type { WallChartShellV2Env } from "./use-wall-chart-shell-v2";
import type { WallChartGroupView } from "./use-wall-chart-group-view";

const ANY_PARTICIPATION: ParticipationSource = { kind: "any" };
/** The v2 tile context never overrides per unit (§3.10): both maps stay empty for the life of the mount. */
const NO_ASSESSMENT_OVERRIDES = new Map<number, AssessmentSelection>();
const NO_BADGE_OVERRIDES = new Map<number, Set<ListActivityChannel> | undefined>();
/** Stable while the ratings query is disabled, so the memos below do not re-run every render. */
const NO_RATINGS = new Map<number, Map<number, ActivityRating>>();

/**
 * WP2.4 block D′ — the v2 wall chart's view state and metrics (wp2.4.md §3.4,
 * §3.10, principle 4 "one pipeline").
 *
 * Every view preference is read from the prefs document (`wallChart`, with
 * this mount's changes overlaid by `useUserCampaignPrefs`) and written back
 * through `setWallChart`: Colour by, the ONE filter (with Sort and the
 * Participation source inside it), Show empty units, `%`/`#`, Links and the
 * badge channels. Nothing here is React state and nothing is per-scope: a
 * card's list is `filter → sort` of its members under the one state, and its
 * metrics are computed from its unfiltered members under the one Colour by.
 *
 * The activity-ratings query is the legacy block B query under the same key
 * (`["campaign-activity-ratings", id, ids]`), fed by the v2 selections; block
 * B's own copy stays disabled because the v2 shell never touches its state.
 */
export function useWallChartViewV2({
  campaignId,
  env,
  wallChart,
  setWallChart,
  core,
  structure,
}: {
  campaignId: string;
  env: Pick<WallChartShellV2Env, "supabase">;
  wallChart: WallChartPrefs;
  setWallChart: SetWallChartPrefs;
  core: WallChartCoreData;
  structure: WallChartGroupView;
}) {
  const { supabase } = env;
  const { ratingSummary, dataFields, leaderLinks } = core;
  const factsByWorker = core.facts.factsByWorker;
  const assessmentFilterLookup = core.activityRatingLookup;
  const selectionByActivity = core.assessmentOptions.selectionByActivity;
  const { memberRows, workerById, ratingByWorker, unitsByWorkerAll } = structure.index;
  const { workersByUnit, unassignedWorkerIds, notInAnyGroupIds, campaign, shownUnits } = structure;
  const { rollupByUnit, shownChildrenByRoot } = structure;

  // ---- Colour by (§3.10): the stored selection, resolved against the live options.
  const colourBy = useMemo<AssessmentSelection>(() => {
    const stored = wallChart.colourBy;
    if (!stored || stored.kind !== "assessment") return { kind: "cumulative" };
    return selectionByActivity.get(stored.activityId) ?? { kind: "cumulative" };
  }, [wallChart.colourBy, selectionByActivity]);
  const setColourBy = useCallback(
    (next: AssessmentSelection) => {
      setWallChart({
        colourBy: next.kind === "assessment" ? { kind: "assessment", activityId: next.activityId } : { kind: "cumulative" },
      });
    },
    [setWallChart]
  );

  // ---- The one filter state (§3.10), Sets restored from the stored arrays.
  const filter = useMemo(() => filterStateFromPrefs(wallChart), [wallChart]);
  const participationSource: ParticipationSource = filter.participation ?? ANY_PARTICIPATION;

  /** wallchart_first_interaction (WP0.2), exactly as block D fires it. */
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

  const setFilter = useCallback(
    (next: WallChartFilterState) => {
      trackWallchartFilterApplied({
        campaign_id: Number(campaignId),
        scope: "campaign",
        filter_keys: activeFilterKeys(next),
        sort_key: next.sort,
      });
      noteFirstInteraction("filter");
      setWallChart(filterStateToPrefs(next), { debounce: true });
    },
    [campaignId, noteFirstInteraction, setWallChart]
  );

  // ---- The other persisted toggles (§3.5, §3.11).
  const displayMode: DisplayMode = wallChart.displayMode ?? "pct";
  const setDisplayMode = useCallback((m: DisplayMode) => setWallChart({ displayMode: m }), [setWallChart]);
  const overlayEnabled = wallChart.overlay ?? false;
  const setOverlayEnabled = useCallback((v: boolean) => setWallChart({ overlay: v }), [setWallChart]);
  const showEmptyUnits = wallChart.showEmptyUnits ?? false;
  const setShowEmptyUnits = useCallback((v: boolean) => setWallChart({ showEmptyUnits: v }), [setWallChart]);
  const badges = useMemo(() => new Set<ListActivityChannel>(wallChart.badges ?? []), [wallChart.badges]);
  const setBadges = useCallback(
    (next: Set<ListActivityChannel>) => setWallChart({ badges: [...next] }),
    [setWallChart]
  );

  // ---- Ratings to load: the Colour by assessment plus any assessment the filter names.
  const activityIdsForRatings = useMemo(() => {
    const set = new Set<number>();
    if (colourBy.kind === "assessment") set.add(colourBy.activityId);
    for (const af of filter.assessmentFilters) if (af.buckets.size > 0) set.add(af.activityId);
    return [...set].sort((a, b) => a - b);
  }, [colourBy, filter.assessmentFilters]);
  const activityIdsKey = activityIdsForRatings.join(",");
  const { data: activityRatingsByActivityId = NO_RATINGS } = useQuery({
    queryKey: ["campaign-activity-ratings", campaignId, activityIdsKey],
    enabled: activityIdsForRatings.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activity_ratings")
        .select("rating_id, worker_id, activity_id, rating, binary_value, rating_phase, rated_at, source, notes")
        .in("activity_id", activityIdsForRatings);
      if (error) throw error;
      const byActivityRows = new Map<number, ActivityRating[]>();
      for (const row of (data ?? []) as ActivityRating[]) {
        const list = byActivityRows.get(row.activity_id) ?? [];
        list.push(row);
        byActivityRows.set(row.activity_id, list);
      }
      const out = new Map<number, Map<number, ActivityRating>>();
      for (const id of activityIdsForRatings) {
        out.set(id, collapseActivityRatingsToWorkerMap(byActivityRows.get(id) ?? []));
      }
      return out;
    },
  });
  const ratingLookup = useMemo(
    () => ({ ratingsByActivity: activityRatingsByActivityId, selectionByActivity: assessmentFilterLookup.selectionByActivity }),
    [activityRatingsByActivityId, assessmentFilterLookup.selectionByActivity]
  );

  // ---- Participation (inside Filter, §3.5 item 4): the predicate is computed as block D did.
  const participation = useParticipationPredicate(campaignId, participationSource, ratingSummary);
  const participationPredicate = useMemo(() => {
    if (participation.useAnyRatingFallback) return undefined;
    const ids = participation.participatedIds;
    return (workerId: number) => ids.has(workerId);
  }, [participation.useAnyRatingFallback, participation.participatedIds]);

  // ---- Filter option labels (block D, unchanged).
  const filterLabels = useMemo(() => {
    const membershipTypes = new Map<number, string>();
    const occupations = new Map<number, string>();
    for (const row of memberRows) {
      const w = row.worker;
      if (!w) continue;
      if (w.union_membership_type_id != null && w.union_membership_type) {
        membershipTypes.set(
          w.union_membership_type_id,
          w.union_membership_type.display_name ?? w.union_membership_type.type_name ?? `Type ${w.union_membership_type_id}`
        );
      }
      if (w.canonical_occupation_id != null && w.canonical_occupation) {
        occupations.set(w.canonical_occupation_id, w.canonical_occupation.canonical_name);
      }
    }
    return { membershipTypes, occupations };
  }, [memberRows]);
  const derivedOptions = useDerivedOptions(memberRows, filterLabels);

  // ---- The one pipeline: filter → sort under the one state and the one Colour by.
  const colourByRatings = useMemo(
    () => (colourBy.kind === "assessment" ? (activityRatingsByActivityId.get(colourBy.activityId) ?? new Map<number, ActivityRating>()) : undefined),
    [colourBy, activityRatingsByActivityId]
  );
  const visibleIds = useCallback(
    (ids: number[]): number[] => {
      const byState = applyFilters(
        ids,
        workerById,
        ratingByWorker,
        filter,
        colourByRatings,
        colourBy.kind === "assessment" ? { selection: colourBy } : undefined,
        factsByWorker,
        ratingLookup,
        unitsByWorkerAll
      );
      // Participation is a real filter (fix round 2, A2): a non-`any` source
      // keeps only the workers its predicate names, so the chip, the tiles
      // and the metrics' participation denominator agree. The predicate is
      // still computed by `useParticipationPredicate` (it needs a query), so
      // it is applied here rather than inside the pure `applyFilters`.
      const filtered =
        hasParticipationFilter(filter) && participationPredicate
          ? byState.filter((id) => participationPredicate(id))
          : byState;
      return applySort(filtered, workerById, ratingByWorker, filter.sort, {
        ...(colourBy.kind === "assessment" && colourByRatings
          ? { assessmentSort: { selection: colourBy, activityRatings: colourByRatings } }
          : {}),
        relationshipLinks: leaderLinks,
        ...factSortOpts(filter, factsByWorker),
      });
    },
    [workerById, ratingByWorker, filter, colourByRatings, colourBy, factsByWorker, ratingLookup, unitsByWorkerAll, leaderLinks, participationPredicate]
  );
  /**
   * The tiles each card draws: every shown card of the tree — a root, each of
   * its shown nested children, and the flat foreign-nested cards (wp2.4c.md
   * §3.6). A root's own list is the members in NONE of its children (B1).
   */
  const visibleByUnit = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const u of shownUnits) {
      m.set(u.ou_id, visibleIds(workersByUnit.get(u.ou_id) ?? []));
      for (const c of shownChildrenByRoot.get(u.ou_id) ?? []) {
        m.set(c.ou_id, visibleIds(workersByUnit.get(c.ou_id) ?? []));
      }
    }
    return m;
  }, [shownUnits, shownChildrenByRoot, workersByUnit, visibleIds]);
  const visibleUnassigned = useMemo(() => visibleIds(unassignedWorkerIds), [visibleIds, unassignedWorkerIds]);
  const visibleNotInAnyGroup = useMemo(() => visibleIds(notInAnyGroupIds), [visibleIds, notInAnyGroupIds]);

  /**
   * The roll-up each card is emptiness-tested on: a root's WHOLE subtree, a
   * child's own tiles — a hidden child's workers still count for its root
   * (§3.6), so the test is over `rollupByUnit`, not over the rendered cards.
   */
  const visibleRollupCount = useCallback(
    (ouId: number) => visibleIds(rollupByUnit.get(ouId) ?? []).length,
    [visibleIds, rollupByUnit]
  );

  /** "Show empty units" off hides units with no VISIBLE worker after filtering (§3.5 item 2). */
  const renderedUnits = useMemo(
    () => (showEmptyUnits ? shownUnits : shownUnits.filter((u) => visibleRollupCount(u.ou_id) > 0)),
    [showEmptyUnits, shownUnits, visibleRollupCount]
  );
  /** The nested cards actually rendered under each rendered root, same rule. */
  const renderedChildrenByRoot = useMemo(() => {
    const m = new Map<number, typeof shownUnits>();
    for (const u of renderedUnits) {
      const children = shownChildrenByRoot.get(u.ou_id) ?? [];
      m.set(
        u.ou_id,
        showEmptyUnits ? children : children.filter((c) => (visibleByUnit.get(c.ou_id)?.length ?? 0) > 0)
      );
    }
    return m;
  }, [renderedUnits, shownChildrenByRoot, showEmptyUnits, visibleByUnit]);
  /**
   * "N empty units hidden" counts both levels (§3.6): a root whose whole
   * subtree is empty counts once (its children are empty by construction and
   * are not rendered either), plus every empty child of a rendered root.
   */
  const emptyHiddenCount = useMemo(() => {
    let n = shownUnits.length - renderedUnits.length;
    for (const u of renderedUnits) {
      n += (shownChildrenByRoot.get(u.ou_id) ?? []).length - (renderedChildrenByRoot.get(u.ou_id) ?? []).length;
    }
    return n;
  }, [shownUnits, renderedUnits, shownChildrenByRoot, renderedChildrenByRoot]);

  // ---- Metrics: unfiltered members of each scope under the one Colour by (as block D).
  const metricsInput = useMemo(
    () => buildAssessmentMetricsInput(colourBy, activityRatingsByActivityId),
    [colourBy, activityRatingsByActivityId]
  );
  const allWorkerIds = useMemo(() => memberRows.map((r) => r.worker_id), [memberRows]);
  const campaignMetrics = useMemo(
    () => computeMetrics(allWorkerIds, workerById, ratingByWorker, participationPredicate, metricsInput),
    [allWorkerIds, workerById, ratingByWorker, participationPredicate, metricsInput]
  );
  /**
   * Per card, over the members it rolls up (B5): a root's summary metrics and
   * placeholders cover its subtree, a child's cover its own list. Unfiltered,
   * as every other v2 metric is.
   */
  const metricsByUnit = useMemo(() => {
    const m = new Map<number, WallChartMetrics>();
    for (const [ouId, ids] of rollupByUnit) {
      m.set(ouId, computeMetrics(ids, workerById, ratingByWorker, participationPredicate, metricsInput));
    }
    return m;
  }, [rollupByUnit, workerById, ratingByWorker, participationPredicate, metricsInput]);
  const unassignedMetrics = useMemo(
    () => computeMetrics(unassignedWorkerIds, workerById, ratingByWorker, participationPredicate, metricsInput),
    [unassignedWorkerIds, workerById, ratingByWorker, participationPredicate, metricsInput]
  );
  const notInAnyGroupMetrics = useMemo(
    () => computeMetrics(notInAnyGroupIds, workerById, ratingByWorker, participationPredicate, metricsInput),
    [notInAnyGroupIds, workerById, ratingByWorker, participationPredicate, metricsInput]
  );

  const estimate = (campaign?.total_worker_estimate as number | null) ?? 0;
  const campaignGreySlots = Math.max(0, estimate - memberRows.length);

  /** The tile context's scope state: the campaign-wide values, no overrides (§3.10). */
  const scopeState = useMemo(
    () => ({
      campaignAssessmentDefault: colourBy,
      unitAssessmentOverride: NO_ASSESSMENT_OVERRIDES,
      campaignBadgeDefault: badges,
      unitBadgeOverride: NO_BADGE_OVERRIDES,
    }),
    [colourBy, badges]
  );

  return {
    colourBy,
    setColourBy,
    assessmentTitle: colourBy.kind === "assessment" ? colourBy.title : null,
    filter,
    setFilter,
    participationSource,
    displayMode,
    setDisplayMode,
    overlayEnabled,
    setOverlayEnabled,
    showEmptyUnits,
    setShowEmptyUnits,
    badges,
    setBadges,
    activityRatingsByActivityId,
    scopeState,
    derivedOptions,
    noteFirstInteraction,
    visibleByUnit,
    visibleUnassigned,
    visibleNotInAnyGroup,
    renderedUnits,
    renderedChildrenByRoot,
    emptyHiddenCount,
    metrics: { campaignMetrics, metricsByUnit, unassignedMetrics, notInAnyGroupMetrics },
    campaignGreySlots,
    dataFields,
  };
}

export type WallChartViewV2 = ReturnType<typeof useWallChartViewV2>;
