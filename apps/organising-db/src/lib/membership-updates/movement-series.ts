/**
 * Chart series for the weekly membership movement report. Pure helpers: the
 * snapshots come from membership_movement_snapshots (one per week ending),
 * and everything here is derived from their four counts.
 *
 *   ins  = new + recommenced
 *   outs = resigned + unfinancial
 *   net  = ins − outs
 */

export const ROLLING_WINDOW_WEEKS = 13;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MovementCounts {
  as_of: string;
  new_members: number;
  recommenced_members: number;
  resigned_members: number;
  unfinancial_members: number;
}

export interface WeeklyMovementPoint {
  asOf: string;
  newMembers: number;
  recommenced: number;
  resigned: number;
  unfinancial: number;
  ins: number;
  outs: number;
  net: number;
}

export interface RollingMovementPoint {
  asOf: string;
  ins: number;
  outs: number;
  net: number;
  /** Weekly reports inside the window — fewer than 13 until enough history exists. */
  weeksInWindow: number;
}

/** Day number for a YYYY-MM-DD date, so week arithmetic is timezone-free. */
function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** One point per week ending, oldest first. */
export function weeklyMovementSeries(snapshots: MovementCounts[]): WeeklyMovementPoint[] {
  return [...snapshots]
    .sort((a, b) => a.as_of.localeCompare(b.as_of))
    .map((s) => {
      const ins = s.new_members + s.recommenced_members;
      const outs = s.resigned_members + s.unfinancial_members;
      return {
        asOf: s.as_of,
        newMembers: s.new_members,
        recommenced: s.recommenced_members,
        resigned: s.resigned_members,
        unfinancial: s.unfinancial_members,
        ins,
        outs,
        net: ins - outs,
      };
    });
}

/**
 * Ins, outs and net summed over the 13 weeks ending at each week, oldest
 * first. The window is by date (the 91 days up to and including the week
 * ending), so a missing week shortens the window rather than stretching it
 * back further.
 */
export function rollingMovementSeries(
  weekly: WeeklyMovementPoint[],
  windowWeeks = ROLLING_WINDOW_WEEKS
): RollingMovementPoint[] {
  const windowDays = windowWeeks * 7;
  return weekly.map((point) => {
    const end = dayNumber(point.asOf);
    const inWindow = weekly.filter((p) => {
      const day = dayNumber(p.asOf);
      return day <= end && day > end - windowDays;
    });
    const ins = inWindow.reduce((sum, p) => sum + p.ins, 0);
    const outs = inWindow.reduce((sum, p) => sum + p.outs, 0);
    return { asOf: point.asOf, ins, outs, net: ins - outs, weeksInWindow: inWindow.length };
  });
}
