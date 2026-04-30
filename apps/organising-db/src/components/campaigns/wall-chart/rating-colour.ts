import { ratingLevelFor } from "@/types/planner-types";
import type { ActivityRating, AssessmentSelection } from "./types";

/** Tailwind background class for a wall-chart cell, based on cumulative rating. */
export function ratingBgClass(cumulative: number | null | undefined): string {
  return ratingLevelFor(cumulative).tailwindBg;
}

export const WALL_CHART_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 print:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] print:gap-1.5";

/**
 * Map binary vote to the same discrete scale as 5-point ratings for wall-chart colour:
 * supportive → 2 (green), abstain → 3 (amber), other → 4 (red in theme).
 */
export function pseudoNumericForBinaryWallChart(args: {
  binaryValue: string | null | undefined;
  supporterOutcomeValue: string | null | undefined;
}): number | null {
  const raw = args.binaryValue?.trim();
  if (!raw) return null;
  const bv = raw.toLowerCase();
  const sup = args.supporterOutcomeValue?.trim().toLowerCase() ?? "";
  if (bv === "abstain") return 3;
  if (sup && bv === sup) return 2;
  return 4;
}

/** Numeric value that drives wall-chart tile colour in assessment mode (null = unrated grey). */
export function assessmentNumericForWallChart(
  selection: Extract<AssessmentSelection, { kind: "assessment" }>,
  activityRating: ActivityRating | null | undefined
): number | null {
  if (selection.isBinary) {
    return pseudoNumericForBinaryWallChart({
      binaryValue: activityRating?.binary_value,
      supporterOutcomeValue: selection.supporterOutcomeValue,
    });
  }
  return activityRating?.rating ?? null;
}
