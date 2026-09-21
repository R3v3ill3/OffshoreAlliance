/**
 * WP3.8 (wp3.8.md §3.7 "Selector") — the one grouping every assessment
 * control shares: the chart's Colour-by selector, the per-unit View control,
 * the tile rating picker and the tests.
 *
 * Pure (no React, no Supabase) so `__tests__/assessment-selector.grouping.test.ts`
 * runs in the node environment. Re-exported from `assessment-selector.tsx`.
 *
 * With no parent the two owned groups are exactly today's two groups in
 * today's order (the characterisation suites pin that DOM); the family group
 * exists only with a parent, and lists the parent's `scope = family`
 * assessments rated and unrated together.
 */

import { isFamilyActivity } from "@/lib/campaign/families";
import type { WallChartAssessmentOption } from "./types";

export type GroupedAssessmentOptions<T extends WallChartAssessmentOption = WallChartAssessmentOption> = {
  /** Owned assessments with at least one rating, in input order. */
  withRatings: T[];
  /** Owned assessments never rated, in input order. */
  withoutRatings: T[];
  /** The parent's shared assessments (rated and unrated together), in input order; empty without a parent. */
  family: T[];
};

export function groupAssessmentOptions<T extends WallChartAssessmentOption>(
  options: readonly T[],
  campaignId: number | string,
  parentId: number | string | null | undefined
): GroupedAssessmentOptions<T> {
  const withRatings: T[] = [];
  const withoutRatings: T[] = [];
  const family: T[] = [];
  for (const opt of options) {
    if (parentId != null && isFamilyActivity(opt, campaignId, parentId)) {
      family.push(opt);
    } else if (opt.last_rated_at != null) {
      withRatings.push(opt);
    } else {
      withoutRatings.push(opt);
    }
  }
  return { withRatings, withoutRatings, family };
}
