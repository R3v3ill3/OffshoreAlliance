/**
 * Subjective organiser rating for an organising unit / sub-unit.
 *
 * A standalone 1..5 scale (independent of worker assessment ratings):
 *   1 extremely strong (solid green) → 5 hostile (red).
 */

export interface UnitRatingLevel {
  value: 1 | 2 | 3 | 4 | 5;
  label: string;
  /** Tailwind background class. */
  bg: string;
  /** Tailwind text class that reads on the background. */
  text: string;
}

export const UNIT_RATING_LEVELS: UnitRatingLevel[] = [
  { value: 1, label: "Extremely strong", bg: "bg-green-600", text: "text-white" },
  { value: 2, label: "Strong", bg: "bg-green-300", text: "text-green-950" },
  { value: 3, label: "Mediocre", bg: "bg-yellow-300", text: "text-yellow-950" },
  { value: 4, label: "Weak", bg: "bg-orange-400", text: "text-orange-950" },
  { value: 5, label: "Hostile", bg: "bg-red-600", text: "text-white" },
];

/** Resolve a (possibly decimal/average) rating to its level, rounding to nearest. */
export function unitRatingLevel(value: number | null | undefined): UnitRatingLevel | null {
  if (value == null) return null;
  const rounded = Math.min(5, Math.max(1, Math.round(value)));
  return UNIT_RATING_LEVELS.find((l) => l.value === rounded) ?? null;
}

/** Average of the non-null sub-unit ratings, or null when none are rated. */
export function averageSubunitRating(ratings: (number | null | undefined)[]): number | null {
  const vals = ratings.filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
