import { describe, expect, it } from "vitest";
import { rollingMovementSeries, weeklyMovementSeries } from "../movement-series";

function snap(as_of: string, n: number, r: number, res: number, u: number) {
  return {
    as_of,
    new_members: n,
    recommenced_members: r,
    resigned_members: res,
    unfinancial_members: u,
  };
}

/** Week endings seven days apart, starting 2026-01-03. */
function weekEnding(i: number): string {
  return new Date(Date.UTC(2026, 0, 3 + i * 7)).toISOString().slice(0, 10);
}

describe("weeklyMovementSeries", () => {
  it("sorts oldest first and derives ins, outs and net", () => {
    const series = weeklyMovementSeries([
      snap("2026-09-19", 4, 1, 2, 5),
      snap("2026-09-05", 15, 9, 6, 17),
    ]);
    expect(series.map((p) => p.asOf)).toEqual(["2026-09-05", "2026-09-19"]);
    expect(series[0]).toMatchObject({ ins: 24, outs: 23, net: 1 });
    expect(series[1]).toMatchObject({ ins: 5, outs: 7, net: -2 });
  });
});

describe("rollingMovementSeries", () => {
  it("accumulates from the start until 13 weeks of history exist", () => {
    const weekly = weeklyMovementSeries([
      snap(weekEnding(0), 3, 0, 1, 0),
      snap(weekEnding(1), 2, 1, 0, 4),
      snap(weekEnding(2), 1, 0, 0, 0),
    ]);
    const rolling = rollingMovementSeries(weekly);
    expect(rolling.map((p) => p.net)).toEqual([2, 1, 2]);
    expect(rolling.map((p) => p.weeksInWindow)).toEqual([1, 2, 3]);
    expect(rolling[2]).toMatchObject({ ins: 7, outs: 5 });
  });

  it("drops a week once it is more than 13 weeks old", () => {
    const weekly = weeklyMovementSeries(
      Array.from({ length: 15 }, (_, i) => snap(weekEnding(i), i + 1, 0, 0, 0))
    );
    const rolling = rollingMovementSeries(weekly);
    // Week 13 (index 12) covers weeks 1–13; week 14 drops week 1; week 15 drops week 2.
    expect(rolling[12]).toMatchObject({ ins: 91, weeksInWindow: 13 });
    expect(rolling[13]).toMatchObject({ ins: 91 - 1 + 14, weeksInWindow: 13 });
    expect(rolling[14]).toMatchObject({ ins: 91 - 1 - 2 + 14 + 15, weeksInWindow: 13 });
  });

  it("windows by date, so a missing week is not replaced by an older one", () => {
    const weekly = weeklyMovementSeries([
      snap(weekEnding(0), 5, 0, 0, 0),
      snap(weekEnding(12), 1, 0, 0, 0),
      snap(weekEnding(13), 1, 0, 0, 0),
    ]);
    const rolling = rollingMovementSeries(weekly);
    expect(rolling[1]).toMatchObject({ ins: 6, weeksInWindow: 2 });
    expect(rolling[2]).toMatchObject({ ins: 2, weeksInWindow: 2 });
  });
});
