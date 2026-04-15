/** Tailwind background class for a wall-chart cell, based on cumulative rating. */
export function ratingBgClass(cumulative: number | null | undefined): string {
  if (cumulative == null) return "bg-zinc-300/80 dark:bg-zinc-600/80";
  if (cumulative < 2) return "bg-sky-600/35";
  if (cumulative < 3) return "bg-emerald-600/35";
  if (cumulative < 4) return "bg-amber-600/35";
  return "bg-red-600/35";
}

export const WALL_CHART_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 print:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] print:gap-1.5";
