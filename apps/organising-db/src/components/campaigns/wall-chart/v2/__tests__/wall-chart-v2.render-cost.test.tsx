// @vitest-environment jsdom
/**
 * WP2.4 Stage 2 (wp2.4.md §4.4) — render cost of the v2 wall chart at
 * campaign scale, beside the legacy chart's, from the SAME run.
 *
 * The `large` fixture (305 members / 161 units) in two shapes: its largest
 * group (Worksite: 153 units, everyone placed) and decision 4's all-Unassigned
 * shape (every member in one Unassigned card). Each is mounted three times
 * and reported as a median; the legacy chart is mounted the same way in this
 * file so the comparison is between numbers from one process on one machine.
 *
 * The standard (§4.4, §8.4 item 5): the v2 numbers are reported alongside the
 * legacy number from the same run and are not worse. The legacy suite's own
 * absolute budget (6 s) is known to fail on sandboxed runners, so the
 * assertion here is the relative one, with the absolute figure printed.
 */

import { describe, expect, it, vi } from "vitest";

import {
  authContextMock,
  fetchApiMock,
  moveWorkerMutationMock,
  navigationMock,
  resetSpies,
  sonnerMock,
  supabaseClientMock,
  workerDetailProviderMock,
} from "../../__tests__/harness/mocks";
import { buildWallChartFixture, buildWallChartFixtureV2, type WallChartFixture } from "../../__tests__/harness/fixture";
import { mountWallChart, type WallChartComponent } from "../../__tests__/harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => authContextMock());
vi.mock("@/components/campaigns/campaign-worker-detail-provider", () =>
  workerDetailProviderMock()
);
vi.mock("@/components/campaigns/wall-chart/move-worker-mutation", () =>
  moveWorkerMutationMock()
);
vi.mock("sonner", () => sonnerMock());

// Imported last: these modules pull in every mocked edge above.
import { CampaignWallChart } from "../../../campaign-wall-chart";
import { CampaignWallChartV2 } from "../../../campaign-wall-chart-v2";

const RUNS = 3;
/** The legacy suite's budget, printed for reference; the assertion is relative (§4.4). */
const LEGACY_BUDGET_MS = 6000;
/** Tolerance on "not worse": run-to-run noise on a shared machine is ~10 %. */
const NOT_WORSE_FACTOR = 1.1;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function measure(
  label: string,
  Component: WallChartComponent,
  fixture: WallChartFixture,
  search?: string
): Promise<{ ms: number; tiles: number; cards: number }> {
  const timings: number[] = [];
  let tiles = 0;
  let cards = 0;
  for (let run = 0; run < RUNS; run++) {
    resetSpies();
    const started = performance.now();
    const mounted = await mountWallChart({ Component, fixture, search });
    timings.push(performance.now() - started);
    tiles = mounted.container.querySelectorAll("[data-worker-id]").length;
    cards = mounted.container.querySelectorAll('[class~="print:break-inside-avoid"]').length;
    mounted.unmount();
  }
  const ms = median(timings);
  console.log(
    `[wp2.4] render-cost ${label}: median ${ms.toFixed(0)}ms over ${RUNS} runs ` +
      `(runs: ${timings.map((t) => t.toFixed(0)).join(", ")}; tiles=${tiles}, cards=${cards}; legacy budget ${LEGACY_BUDGET_MS}ms)`
  );
  return { ms, tiles, cards };
}

describe("CampaignWallChartV2 render cost (same run as the legacy chart)", () => {
  it("renders the largest group of the 305 / 161 fixture, and the all-Unassigned shape, no worse than the legacy chart", async () => {
    const legacy = await measure("legacy", CampaignWallChart, buildWallChartFixture("large"));
    // Worksite is listed first in the large fixture, so it is the default group.
    const largest = await measure("v2 largest group (Worksite)", CampaignWallChartV2, buildWallChartFixtureV2("large"));
    const base = buildWallChartFixtureV2("large");
    const allUnassigned = await measure(
      "v2 all-Unassigned (decision 4)",
      CampaignWallChartV2,
      { ...base, tables: { ...base.tables, campaign_worker_ou: [] } }
    );

    // A mis-seeded fixture would render an empty shell very fast, so the
    // timings are only meaningful alongside these.
    expect(legacy.tiles).toBe(250);
    expect(legacy.cards).toBe(162);
    // 305 members, each placed in one Worksite unit; 153 unit cards + Unassigned + the summary.
    expect(largest.tiles).toBe(305);
    expect(largest.cards).toBe(155);
    // Every member in the one Unassigned card; the 153 empty units are hidden (Show empty units off).
    expect(allUnassigned.tiles).toBe(305);
    expect(allUnassigned.cards).toBe(2);

    expect(largest.ms).toBeLessThanOrEqual(legacy.ms * NOT_WORSE_FACTOR);
    expect(allUnassigned.ms).toBeLessThanOrEqual(legacy.ms * NOT_WORSE_FACTOR);
  }, 240_000);
});
