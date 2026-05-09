import { ratingLevelFor } from "@/types/planner-types";
import type { ActivityRating, AssessmentSelection } from "./types";
import { pseudoNumericForBinaryOutcome } from "./binary-assessment";

/** Tailwind background class for a wall-chart cell, based on cumulative rating. */
export function ratingBgClass(cumulative: number | null | undefined): string {
  return ratingLevelFor(cumulative).tailwindBg;
}

/** Tailwind border and text class for a wall-chart badge, based on cumulative rating. */
export function ratingBorderTextClass(cumulative: number | null | undefined): string {
  const token = ratingLevelFor(cumulative).colourToken;
  switch (token) {
    case "sky":
      return "border-sky-500 text-sky-700 dark:border-sky-600 dark:text-sky-400";
    case "emerald":
      return "border-emerald-500 text-emerald-700 dark:border-emerald-600 dark:text-emerald-400";
    case "amber":
      return "border-amber-500 text-amber-700 dark:border-amber-600 dark:text-amber-400";
    case "red":
      return "border-red-500 text-red-700 dark:border-red-600 dark:text-red-400";
    case "red-dark":
      return "border-red-700 text-red-800 dark:border-red-800 dark:text-red-500";
    case "zinc":
    default:
      return "border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400";
  }
}

export const WALL_CHART_GRID_CLASS =
  "grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 print:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] print:gap-1.5";

/**
 * Map binary vote to the same discrete scale as 5-point ratings for wall-chart colour:
 * supportive → 2 (green), unsure/abstain → 3 (amber), other → 4 (red in theme).
 */
export function pseudoNumericForBinaryWallChart(args: {
  binaryValue: string | null | undefined;
  supporterOutcomeValue: string | null | undefined;
}): number | null {
  return pseudoNumericForBinaryOutcome(args);
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
