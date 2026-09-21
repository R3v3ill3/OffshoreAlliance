/**
 * WP3.8 (wp3.8.md §4.1) — `groupAssessmentOptions`, the one grouping the
 * Colour-by selector, the per-unit View control and the tile rating picker
 * share. With no parent the two owned groups are today's two groups in
 * today's order; the family group exists only with a parent.
 */

import { describe, expect, it } from "vitest";

import { groupAssessmentOptions } from "../assessment-option-groups";
import type { WallChartAssessmentOption } from "../types";

function option(
  activityId: number,
  overrides: Partial<WallChartAssessmentOption> = {}
): WallChartAssessmentOption {
  return {
    activity_id: activityId,
    title: `Assessment ${activityId}`,
    is_binary: false,
    supporter_outcome_value: null,
    last_rated_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    has_linked_ambition: false,
    rating_labels: null,
    campaign_id: 1,
    scope: "campaign",
    is_family: false,
    ...overrides,
  };
}

const RATED = "2026-02-01T00:00:00.000Z";

describe("groupAssessmentOptions", () => {
  it("with no parent: rated then unrated owned options, input order kept, no family group", () => {
    const options = [
      option(3, { last_rated_at: RATED }),
      option(1),
      option(2, { last_rated_at: RATED }),
      option(4),
    ];
    const grouped = groupAssessmentOptions(options, "1", null);
    expect(grouped.withRatings.map((o) => o.activity_id)).toEqual([3, 2]);
    expect(grouped.withoutRatings.map((o) => o.activity_id)).toEqual([1, 4]);
    expect(grouped.family).toEqual([]);
  });

  it("with no parent: a row marked family-shaped is still owned (the family group needs a parent)", () => {
    const options = [option(9, { campaign_id: 9, scope: "family", is_family: true })];
    const grouped = groupAssessmentOptions(options, "1", null);
    expect(grouped.family).toEqual([]);
    expect(grouped.withoutRatings.map((o) => o.activity_id)).toEqual([9]);
  });

  it("with a parent: the parent's family rows form the family group, rated and unrated together, in input order", () => {
    const options = [
      option(901, { campaign_id: 9, scope: "family", is_family: true, last_rated_at: RATED }),
      option(501, { last_rated_at: RATED }),
      option(902, { campaign_id: 9, scope: "family", is_family: true }),
      option(502),
    ];
    const grouped = groupAssessmentOptions(options, "1", 9);
    expect(grouped.family.map((o) => o.activity_id)).toEqual([901, 902]);
    expect(grouped.withRatings.map((o) => o.activity_id)).toEqual([501]);
    expect(grouped.withoutRatings.map((o) => o.activity_id)).toEqual([502]);
  });

  it("with a parent: the parent's campaign-scoped row and a sibling's row are not family", () => {
    const options = [
      option(903, { campaign_id: 9, scope: "campaign" }),
      option(701, { campaign_id: 7, scope: "family" }),
    ];
    const grouped = groupAssessmentOptions(options, 1, 9);
    expect(grouped.family).toEqual([]);
    // Anything the database filter let through that is not family is listed as owned, never hidden.
    expect(grouped.withoutRatings.map((o) => o.activity_id)).toEqual([903, 701]);
  });

  it("accepts string and numeric ids alike", () => {
    const options = [option(901, { campaign_id: 9, scope: "family", is_family: true })];
    expect(groupAssessmentOptions(options, 1, "9").family).toHaveLength(1);
    expect(groupAssessmentOptions(options, "1", 9).family).toHaveLength(1);
  });
});
