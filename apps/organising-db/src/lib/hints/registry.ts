// WP1.7 — the first-use hint registry.
//
// Plan 4 principle 15: no product tours; first-use hints only. Plan 5.1
// principle 6: what an organiser sees is per-user server-side state, never
// localStorage — so `seen` is a row in user_hint_dismissals, not a browser key.
//
// One entry per hint, ids stable and snake_case, never derived from copy.
// `pending` names the work package that will wire an entry whose target does
// not exist yet; a pending entry is data only and shouldShowHint() refuses it.
//
// Pure data: no React, no next/*, so the environment:node vitest suite imports
// it directly, and so does the Playwright spec (tests/e2e/wall-chart.spec.ts)
// for the literal copy it asserts on.

export type HintId = "wall_chart_rating" | "wall_chart_group_selector";

export interface Hint {
  id: HintId;
  /** Human note about where it anchors. Not rendered. */
  target: string;
  /** Exactly one sentence, plan-3.6 vocabulary. Rendered verbatim. */
  copy: string;
  /** Prose statement of the trigger; the executable form is shouldShowHint(). */
  showWhen: string;
  /** Set when the target does not exist yet. Never rendered while set. */
  pending?: "WP2.4";
}

export const HINTS: readonly Hint[] = [
  {
    id: "wall_chart_rating",
    target: "the rating number on a worker tile in the wall chart",
    copy: "Tap a worker's rating to set it — 1 is a supportive leader, 5 is opposed.",
    showWhen:
      "the first time this user opens a wall chart that has at least one tile they can edit, in either mode",
  },
  {
    id: "wall_chart_group_selector",
    target: "the wall chart's Group selector",
    copy: "Choose one Group at a time — Unassigned holds anyone not in a Unit.",
    showWhen:
      "the first time this user opens a wall chart after the Group selector ships",
    pending: "WP2.4",
  },
];

export const HINT_BY_ID: Readonly<Record<HintId, Hint>> = Object.fromEntries(
  HINTS.map((h) => [h.id, h])
) as Readonly<Record<HintId, Hint>>;
