import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UNASSIGNED_KEY,
  activityIdsForWallChartSelections,
  buildAssessmentMetricsInput,
  effectiveAssessmentForScope,
  hierarchyViewKey,
  readHierarchyView,
  scopeAssessmentFilterAndSort,
} from "../wall-chart-model";
import { DEFAULT_FILTER_STATE, applyFilters, applySort } from "../filters";
import type {
  ActivityRating,
  AssessmentSelection,
  WallChartRatingSummary,
  WallChartWorker,
} from "../types";

/**
 * WP2.3 Stage 1 — behavioural tests for the helpers moved verbatim out of
 * `campaign-wall-chart.tsx` into `wall-chart-model.ts`.
 *
 * Every expectation is a fixed literal chosen by reading what the behaviour
 * should be, never a value computed by re-implementing the helper. Before the
 * move these behaviours were only reachable through the component; the
 * characterisation and interaction suites still exercise them that way, so
 * these tests are an addition, not a replacement.
 */

const CUMULATIVE: AssessmentSelection = { kind: "cumulative" };

function assessment(activityId: number, over: Partial<Extract<AssessmentSelection, { kind: "assessment" }>> = {}) {
  return {
    kind: "assessment" as const,
    activityId,
    title: `Activity ${activityId}`,
    isBinary: false,
    supporterOutcomeValue: null,
    ratingLabels: null,
    ...over,
  };
}

function rating(workerId: number, activityId: number, value: number | null): ActivityRating {
  return {
    rating_id: workerId * 1000 + activityId,
    worker_id: workerId,
    activity_id: activityId,
    rating: value,
    binary_value: null,
    rating_phase: null,
    rated_at: null,
    source: null,
    notes: null,
  };
}

/** Two activities: 7 has three rated workers, 9 has one. */
function ratingsByActivity(): Map<number, Map<number, ActivityRating>> {
  return new Map([
    [
      7,
      new Map([
        [101, rating(101, 7, 5)],
        [102, rating(102, 7, 3)],
        [103, rating(103, 7, 1)],
      ]),
    ],
    [9, new Map([[101, rating(101, 9, 2)]])],
  ]);
}

/**
 * Inputs for the one test that runs the real filter and sort through the
 * helper's output. Only the fields those two functions read are meaningful.
 */
function pipelineWorker(workerId: number, firstName: string, lastName: string): WallChartWorker {
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

function cumulative(workerId: number, value: number): WallChartRatingSummary {
  return {
    worker_id: workerId,
    cumulative_rating: value,
    last_activity_rating: value,
    has_supportive_activity_rating: false,
    supportive_activity_count: 0,
  };
}

const PIPELINE_WORKERS = new Map(
  [
    pipelineWorker(801, "Ann", "Nash"),
    pipelineWorker(802, "Bea", "Mills"),
    pipelineWorker(803, "Cal", "Lloyd"),
    pipelineWorker(804, "Dov", "Kerr"),
    pipelineWorker(805, "Eve", "James"),
  ].map((w) => [w.worker_id, w])
);

/** Cumulative ratings, deliberately at odds with the activity-7 ratings below. */
const PIPELINE_CUMULATIVE = new Map(
  [cumulative(801, 3), cumulative(802, 5), cumulative(803, 4), cumulative(804, 1), cumulative(805, 2)].map(
    (r) => [r.worker_id, r]
  )
);

/** Activity 7 only; 805 is deliberately absent, so it reads as unrated. */
const PIPELINE_RATINGS = new Map<number, Map<number, ActivityRating>>([
  [
    7,
    new Map([
      [801, rating(801, 7, 1)],
      [802, rating(802, 7, 4)],
      [803, rating(803, 7, 2)],
      [804, rating(804, 7, 5)],
    ]),
  ],
]);

describe("UNASSIGNED_KEY", () => {
  it("is 0, the scope key the unassigned card and its filters use", () => {
    expect(UNASSIGNED_KEY).toBe(0);
  });
});

describe("effectiveAssessmentForScope", () => {
  it("returns the unit's override when the scope has one", () => {
    const overrides = new Map<number, AssessmentSelection>([[12, assessment(7)]]);
    expect(effectiveAssessmentForScope(12, CUMULATIVE, overrides)).toEqual(assessment(7));
  });

  it("returns the campaign default when the scope has no override", () => {
    const overrides = new Map<number, AssessmentSelection>([[12, assessment(7)]]);
    expect(effectiveAssessmentForScope(99, assessment(9), overrides)).toEqual(assessment(9));
  });

  it("returns cumulative when neither the scope nor the campaign selects an assessment", () => {
    expect(effectiveAssessmentForScope(12, CUMULATIVE, new Map())).toEqual({ kind: "cumulative" });
  });

  it("lets a unit override the campaign default back to cumulative", () => {
    const overrides = new Map<number, AssessmentSelection>([[12, CUMULATIVE]]);
    expect(effectiveAssessmentForScope(12, assessment(7), overrides)).toEqual({ kind: "cumulative" });
  });
});

describe("activityIdsForWallChartSelections", () => {
  it("collects distinct ids from the campaign default and every override, ascending", () => {
    const overrides = new Map<number, AssessmentSelection>([
      [1, assessment(9)],
      [2, assessment(3)],
      [3, assessment(9)],
    ]);
    expect(activityIdsForWallChartSelections(assessment(7), overrides)).toEqual([3, 7, 9]);
  });

  it("ignores cumulative selections", () => {
    const overrides = new Map<number, AssessmentSelection>([
      [1, CUMULATIVE],
      [2, assessment(4)],
    ]);
    expect(activityIdsForWallChartSelections(CUMULATIVE, overrides)).toEqual([4]);
  });

  it("returns an empty list when nothing selects an assessment", () => {
    expect(activityIdsForWallChartSelections(CUMULATIVE, new Map())).toEqual([]);
  });
});

describe("buildAssessmentMetricsInput", () => {
  it("returns undefined for a cumulative selection", () => {
    expect(buildAssessmentMetricsInput(CUMULATIVE, ratingsByActivity())).toBeUndefined();
  });

  it("carries only the selected activity's ratings, with its binary settings", () => {
    const input = buildAssessmentMetricsInput(
      assessment(7, { isBinary: true, supporterOutcomeValue: "attended" }),
      ratingsByActivity()
    );
    expect(input?.isBinary).toBe(true);
    expect(input?.supportiveBinaryValue).toBe("attended");
    expect([...(input?.ratings.keys() ?? [])]).toEqual([101, 102, 103]);
    expect(input?.ratings.get(102)?.rating).toBe(3);
  });

  it("returns an empty ratings map when the activity has no ratings yet", () => {
    const input = buildAssessmentMetricsInput(assessment(404), ratingsByActivity());
    expect(input?.ratings.size).toBe(0);
    expect(input?.isBinary).toBe(false);
  });

  it("keys the ratings off the selection's activityId, not the first or only entry", () => {
    // §4.5 asks for an explicit activityId assertion. The returned shape has no
    // activityId field to read, so the behaviour is pinned where it is
    // observable: with two activities present, every rating handed to the
    // metrics belongs to the selected one, and switching the selection
    // switches the ratings.
    const byActivity = ratingsByActivity();

    const seven = buildAssessmentMetricsInput(assessment(7), byActivity);
    expect([...(seven?.ratings.values() ?? [])].map((r) => r.activity_id)).toEqual([7, 7, 7]);
    expect([...(seven?.ratings.keys() ?? [])]).toEqual([101, 102, 103]);

    const nine = buildAssessmentMetricsInput(assessment(9), byActivity);
    expect([...(nine?.ratings.values() ?? [])].map((r) => r.activity_id)).toEqual([9]);
    expect([...(nine?.ratings.keys() ?? [])]).toEqual([101]);
    expect(nine?.ratings.get(101)?.rating).toBe(2);
  });
});

describe("scopeAssessmentFilterAndSort", () => {
  it("returns nothing to filter or sort by when the scope resolves to cumulative", () => {
    expect(scopeAssessmentFilterAndSort(12, CUMULATIVE, new Map(), ratingsByActivity())).toEqual({});
  });

  it("resolves through the override and hands back that activity's ratings for both filter and sort", () => {
    const overrides = new Map<number, AssessmentSelection>([[12, assessment(9)]]);
    const result = scopeAssessmentFilterAndSort(12, assessment(7), overrides, ratingsByActivity());

    expect([...(result.activityRatings?.keys() ?? [])]).toEqual([101]);
    expect(result.ratingCtx?.selection).toEqual(assessment(9));
    expect(result.sortAssessment?.selection).toEqual(assessment(9));
    // Filter and sort read the same map instance, so they can never disagree.
    expect(result.sortAssessment?.activityRatings).toBe(result.activityRatings);
  });

  it("falls back to the campaign default when the scope has no override", () => {
    const result = scopeAssessmentFilterAndSort(99, assessment(7), new Map(), ratingsByActivity());
    expect([...(result.activityRatings?.keys() ?? [])]).toEqual([101, 102, 103]);
  });

  it("returns an empty ratings map — not undefined — for an assessment with no ratings", () => {
    const result = scopeAssessmentFilterAndSort(12, assessment(404), new Map(), ratingsByActivity());
    expect(result.activityRatings?.size).toBe(0);
    expect(result.sortAssessment?.selection.activityId).toBe(404);
  });

  it("drives a real filter and a real sort over an unsorted five-worker input", () => {
    // Fix round 3. The previous version of this test asserted only the key
    // order of the Map the helper returns, which is the order it was given —
    // a tautology that called neither `applyFilters` nor `applySort`. The
    // helper's whole purpose is to supply those two functions with the right
    // per-scope assessment context, so it is now asserted through them.
    //
    // Five workers whose *assessment* ratings disagree with their *cumulative*
    // ratings, given to the pipeline in neither name nor rating order:
    //
    //   id   name        cumulative   activity 7
    //   801  Ann Nash        3            1
    //   802  Bea Mills       5            4
    //   803  Cal Lloyd       4            2
    //   804  Dov Kerr        1            5
    //   805  Eve James       2         (unrated)
    const unsortedIds = [804, 801, 803, 805, 802];
    const filter = {
      ...DEFAULT_FILTER_STATE(),
      ratings: new Set(["4", "5"] as const),
      sort: "cumulative_asc" as const,
    };

    const fa = scopeAssessmentFilterAndSort(31, assessment(7), new Map(), PIPELINE_RATINGS);

    const filtered = applyFilters(
      unsortedIds,
      PIPELINE_WORKERS,
      PIPELINE_CUMULATIVE,
      filter,
      fa.activityRatings,
      fa.ratingCtx
    );
    const sorted = applySort(filtered, PIPELINE_WORKERS, PIPELINE_CUMULATIVE, filter.sort, {
      ...(fa.sortAssessment ? { assessmentSort: fa.sortAssessment } : {}),
    });

    // Buckets 4 and 5 over the *assessment* ratings keep Dov (5) and Bea (4),
    // in the order they were supplied …
    expect(filtered).toEqual([804, 802]);
    // … and the sort then reverses them, ascending by assessment rating. A
    // bypassed sort would leave [804, 802] and fail here.
    expect(sorted).toEqual([802, 804]);

    // Each of the helper's three outputs is load-bearing, shown by removing it:
    // without `activityRatings`/`ratingCtx` the filter falls back to cumulative
    // ratings and keeps a different pair of workers …
    expect(applyFilters(unsortedIds, PIPELINE_WORKERS, PIPELINE_CUMULATIVE, filter)).toEqual([
      803, 802,
    ]);
    // … and without `sortAssessment` the sort orders by cumulative rating,
    // which for this pair is the opposite direction.
    expect(
      applySort(filtered, PIPELINE_WORKERS, PIPELINE_CUMULATIVE, filter.sort)
    ).toEqual([804, 802]);
  });
});

describe("hierarchyViewKey", () => {
  it("namespaces the sub-unit view by campaign id", () => {
    expect(hierarchyViewKey("7")).toBe("wallchart:subUnitView:7");
  });
});

describe("readHierarchyView", () => {
  const store = new Map<string, string>();

  function stubLocalStorage() {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
      },
    });
  }

  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it("reads the stored map, keyed by numeric ou_id", () => {
    store.set("wallchart:subUnitView:7", JSON.stringify({ "10": "subunit", "11": "unit" }));
    stubLocalStorage();

    const view = readHierarchyView("7");
    expect(view.get(10)).toBe("subunit");
    expect(view.get(11)).toBe("unit");
    expect(view.size).toBe(2);
  });

  it("drops entries whose mode is not a known view", () => {
    store.set("wallchart:subUnitView:7", JSON.stringify({ "10": "subunit", "11": "sideways" }));
    stubLocalStorage();

    const view = readHierarchyView("7");
    expect([...view.keys()]).toEqual([10]);
  });

  it("returns an empty map when the key is missing", () => {
    stubLocalStorage();
    expect(readHierarchyView("7").size).toBe(0);
  });

  it("returns an empty map for corrupt JSON rather than throwing", () => {
    store.set("wallchart:subUnitView:7", "{not json");
    stubLocalStorage();
    expect(readHierarchyView("7").size).toBe(0);
  });

  it("returns an empty map for JSON that is not an object", () => {
    store.set("wallchart:subUnitView:7", "42");
    stubLocalStorage();
    expect(readHierarchyView("7").size).toBe(0);
  });

  it("returns an empty map on the server, where there is no window", () => {
    // The node environment has no `window` at all, which is the guard's case.
    expect(readHierarchyView("7").size).toBe(0);
  });
});
