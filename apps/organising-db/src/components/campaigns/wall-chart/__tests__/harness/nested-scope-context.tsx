/**
 * WP2.3 fix round 3 — a hand-built props object for `WallChartSubUnits`, the
 * extracted product component that owns filter→sort→render pipelines #3
 * (child) and #4 (grandchild).
 *
 * Why this exists. The public UI cannot give a child and a grandchild
 * *different* filter states today: nested cards have no filter UI of their
 * own, so the only route to their state is the filter bar's "Apply to all
 * units", which writes the **same** state to every scope. Coverage built that
 * way cannot tell a grandchild reading its own scope key from one reading its
 * parent's, and cannot tell a real sort from fixture order. This module
 * supplies the one thing the UI cannot: a `getFilter(scopeId)` that returns a
 * genuinely different filter *and* sort per scope.
 *
 * Nothing here is a copy of product logic — it is data and stubs. The
 * component under test is the real one, and the filter and sort it runs are
 * the real `applyFilters` / `applySort`.
 *
 * `WallChartHierarchyProps` is not exported by the product module (and must
 * not be changed to make it so), so the assembled object is handed over as
 * `Parameters<typeof WallChartSubUnits>[0]`. Every field the component
 * actually reads is populated for real; the rest of those large hook-result
 * types are deliberately absent rather than faked, which is what the cast
 * covers.
 */

import { DEFAULT_FILTER_STATE, type SortKey, type RatingBucket, type WallChartFilterState } from "../../filters";
import type { WallChartOU, WallChartRatingSummary, WallChartWorker } from "../../types";
import type { WallChartSubUnits } from "../../wall-chart-unit-hierarchy";

export type SubUnitsProps = Parameters<typeof WallChartSubUnits>[0];

/** Only the fields the wall chart reads are meaningful; the rest are null/false. */
export function worker(
  workerId: number,
  firstName: string,
  lastName: string
): WallChartWorker {
  return {
    worker_id: workerId,
    first_name: firstName,
    last_name: lastName,
    email: null,
    phone: null,
    notes: null,
    member_role_type_id: null,
    is_bargaining_rep: null,
    is_hsr: null,
    union_membership_type_id: null,
    non_oa_union_option_id: null,
    canonical_occupation_id: null,
    employer_id: null,
    worksite_id: null,
    member_role_type: null,
    union_membership_type: null,
    non_oa_union_option: null,
    canonical_occupation: null,
    employer: null,
    worksite: null,
  };
}

export function ratingSummary(workerId: number, cumulative: number | null): WallChartRatingSummary {
  return {
    worker_id: workerId,
    cumulative_rating: cumulative,
    last_activity_rating: cumulative,
    has_supportive_activity_rating: false,
    supportive_activity_count: 0,
  };
}

export function ou(
  ouId: number,
  name: string,
  over: Partial<WallChartOU> = {}
): WallChartOU {
  return {
    ou_id: ouId,
    name,
    ou_type: "employer",
    total_workers_estimated: 0,
    display_order: ouId,
    is_group_container: false,
    parent_ou_id: null,
    user_rating: null,
    ...over,
  } as WallChartOU;
}

/** A filter that keeps only the named cumulative-rating buckets, sorted by `sort`. */
export function ratingFilter(buckets: RatingBucket[], sort: SortKey): WallChartFilterState {
  return { ...DEFAULT_FILTER_STATE(), ratings: new Set(buckets), sort };
}

/** No active filter, so `applyFilters` returns its input untouched. */
export function noFilter(sort: SortKey): WallChartFilterState {
  return { ...DEFAULT_FILTER_STATE(), sort };
}

export type NestedScopeSetup = {
  parentOu: WallChartOU;
  visibleChildList: WallChartOU[];
  /** ou_id → the worker ids assigned to it, in deliberately unsorted order. */
  workersByOu: Map<number, number[]>;
  /** parent ou_id → its child OUs. */
  childrenByParent: Map<number, WallChartOU[]>;
  workers: WallChartWorker[];
  /** worker_id → cumulative rating. */
  cumulativeByWorker: Map<number, number | null>;
  /** The whole point: a different filter *and* sort per scope id. */
  filterByScope: Map<number, WallChartFilterState>;
};

export function subUnitsProps(setup: NestedScopeSetup): SubUnitsProps {
  const workerById = new Map(setup.workers.map((w) => [w.worker_id, w]));
  const ratingByWorker = new Map(
    setup.workers.map((w) => [
      w.worker_id,
      ratingSummary(w.worker_id, setup.cumulativeByWorker.get(w.worker_id) ?? null),
    ])
  );
  const allOus = [setup.parentOu, ...setup.visibleChildList, ...[...setup.childrenByParent.values()].flat()];

  const getFilter = (scopeId: number): WallChartFilterState => {
    const found = setup.filterByScope.get(scopeId);
    if (!found) {
      // Loud rather than silently defaulted: a scope the component asks about
      // that the test did not describe is a wiring surprise worth failing on.
      throw new Error(`getFilter called for an undescribed scope: ${scopeId}`);
    }
    return found;
  };

  const noop = () => {};

  const tileContext = {
    campaignId: "1",
    canWrite: true,
    index: {
      workerById,
      unitsByWorker: new Map<number, number[]>(),
      ouNameById: new Map(allOus.map((o) => [o.ou_id, o.name])),
      ouTypeById: new Map(allOus.map((o) => [o.ou_id, o.ou_type])),
      ratingByWorker,
    },
    scopeState: {
      campaignAssessmentDefault: { kind: "cumulative" as const },
      unitAssessmentOverride: new Map(),
      campaignBadgeDefault: new Set(),
      unitBadgeOverride: new Map(),
    },
    activityRatingsByActivityId: new Map(),
    listActivityByWorker: new Map(),
    selection: {
      size: 0,
      has: () => false,
      toggle: noop,
      clear: noop,
      refs: () => [],
    },
    workerDetail: null,
    setTileUnitDialog: noop,
    buildListOpen: false,
    buildListWorkerIds: new Set<number>(),
    onBuildListWallDragStart: noop,
    onBuildListWallDragEnd: noop,
    noteFirstInteraction: noop,
    hint: { ratingHintAnchor: null, ratingHint: { visible: false, dismiss: noop } },
  };

  return {
    campaignId: "1",
    canWrite: true,
    parentOu: setup.parentOu,
    visibleChildList: setup.visibleChildList,
    shell: {
      buildListUrl: {
        buildListOpen: false,
        onBuildListWallDragStart: noop,
        onBuildListWallDragEnd: noop,
      },
      highlight: { highlightedOuId: null },
      visibility: { hiddenOuIds: new Set<number>() },
      dialogs: {
        setAddWorkerOpen: noop,
        setAddWorkerFormKey: noop,
        setAddWorkerContextOu: noop,
        setSplitTargetOu: noop,
        setDeleteTargetOu: noop,
        setTileUnitDialog: noop,
      },
    },
    core: {
      scopeState: {
        campaignAssessmentDefault: { kind: "cumulative" as const },
        unitAssessmentOverride: new Map(),
      },
      activityRatings: new Map(),
      activityRatingLookup: { ratingsByActivity: new Map(), selectionByActivity: new Map() },
      facts: { factsByWorker: new Map() },
      leaderLinks: [],
      coverage: { coverageByOu: new Map(), wocRepByUnit: new Map() },
    },
    struct: {
      index: {
        workerById,
        ratingByWorker,
        workersByOu: setup.workersByOu,
        childrenByParent: setup.childrenByParent,
      },
    },
    view: {
      filters: { getFilter },
      displayMode: { mode: "count" },
      participation: { source: "assessment" },
      metrics: { metricsByOu: new Map() },
    },
    actions: { handleWorkerDrop: noop },
    tileContext,
  } as unknown as SubUnitsProps;
}
