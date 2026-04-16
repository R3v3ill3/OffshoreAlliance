import { ratingLevelFor } from '@/types/planner-types'

/** Tailwind background class for a wall-chart cell, based on cumulative rating. */
export function ratingBgClass(cumulative: number | null | undefined): string {
  return ratingLevelFor(cumulative).tailwindBg
}

export const WALL_CHART_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 print:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] print:gap-1.5";
