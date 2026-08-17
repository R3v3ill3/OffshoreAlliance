/**
 * How a recorded rating is shown: label, hover description, colour.
 *
 * An assessment may override the level names via
 * `campaign_activities.rating_labels` ("1" → "Ready to strike"), so a
 * rating cannot be rendered from RATING_LEVELS alone — the override
 * wins for the name while the standard level still supplies the colour
 * and the underlying meaning.
 *
 * Pure module — unit tested in __tests__/rating-display.test.ts.
 */

import { RATING_LEVELS } from "@/types/planner-types";

export type RatingLabelOverrides = Record<string, string> | null | undefined;

/** The 1–5 scale, excluding the 0 "unassessed" sentinel. */
export const RATING_KEY_LEVELS = RATING_LEVELS.filter((r) => r.value > 0);

/** Short name for a level — the assessment's override if it has one. */
export function ratingLabel(
  level: number,
  overrides?: RatingLabelOverrides,
): string {
  const override = overrides?.[String(level)];
  if (override) return override;
  return (
    RATING_LEVELS.find((r) => r.value === level)?.shortLabel ?? String(level)
  );
}

/** Background class for a level. Always the standard scale colour. */
export function ratingBg(level: number): string {
  return RATING_LEVELS.find((r) => r.value === level)?.tailwindBg ?? "bg-muted";
}

/**
 * Hover text for a rating chip.
 *
 * Names the assessment first — with several pinned, the chip is
 * meaningless without knowing which one it belongs to — then the level
 * and what it means. When the assessment renames a level, both names
 * are shown: the organiser sees their own wording without losing the
 * standard meaning behind it.
 */
export function ratingTooltip(
  activityTitle: string,
  value: { rating: number | null; binary_value: string | null },
  overrides?: RatingLabelOverrides,
): string {
  if (value.rating == null && value.binary_value == null) {
    return `${activityTitle}: not assessed`;
  }

  if (value.rating == null) {
    return `${activityTitle}: ${value.binary_value}`;
  }

  const level = RATING_LEVELS.find((r) => r.value === value.rating);
  const shown = ratingLabel(value.rating, overrides);
  const standard = level?.shortLabel;
  const renamed = standard != null && standard !== shown;

  const head = `${activityTitle}: ${value.rating} — ${shown}${
    renamed ? ` (${standard})` : ""
  }`;
  return level?.description ? `${head}\n${level.description}` : head;
}
