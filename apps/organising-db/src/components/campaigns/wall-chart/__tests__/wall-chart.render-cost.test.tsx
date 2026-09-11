// @vitest-environment jsdom
/**
 * WP2.3 Stage 0 — render-cost baseline at campaign scale.
 *
 * 305 members across 161 organising units, rendered as one tree, timed three
 * times and reported as a median. Stage 1 splits the monolith into a shell plus
 * five render components; if that introduces a re-render cascade or drops
 * memoisation, this is the test that notices.
 *
 * The threshold is deliberately loose. This is a regression tripwire on a
 * shared machine, not a benchmark — the useful output is the number printed
 * below, which Stage 1 is compared against.
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
} from "./harness/mocks";
import { buildWallChartFixture } from "./harness/fixture";
import { mountWallChart } from "./harness/mount";

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

// Imported last: this module pulls in every mocked edge above.
import { CampaignWallChart } from "../../campaign-wall-chart";

const RUNS = 3;
/**
 * Observed median on the Stage 0 baseline is ~2.2s. The budget is set well
 * above that so ordinary machine noise cannot fail the build, while a
 * re-render cascade — which costs multiples, not percentages — still does.
 */
const BUDGET_MS = 6000;
/**
 * 305 members, but 55 of them sit inside sub-unit cards that start collapsed,
 * so the default render puts 250 tiles in the DOM.
 */
const EXPECTED_TILES = 250;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

describe("CampaignWallChart render cost", () => {
  it("renders 305 members across 161 units within budget", async () => {
    resetSpies();
    const timings: number[] = [];
    let tiles = 0;
    let cards = 0;

    for (let run = 0; run < RUNS; run++) {
      const started = performance.now();
      const mounted = await mountWallChart({
        Component: CampaignWallChart,
        fixture: buildWallChartFixture("large"),
      });
      timings.push(performance.now() - started);

      tiles = mounted.container.querySelectorAll("[data-worker-id]").length;
      cards = mounted.container.querySelectorAll(
        '[class~="print:break-inside-avoid"]'
      ).length;
      mounted.unmount();
    }

    const ms = median(timings);
    // This number is the baseline artefact Stage 1 is compared against.
    console.log(
      `[wp2.3] render-cost median ${ms.toFixed(0)}ms over ${RUNS} runs ` +
        `(runs: ${timings.map((t) => t.toFixed(0)).join(", ")}; tiles=${tiles}, cards=${cards})`
    );

    // A mis-seeded fixture would render an empty shell very fast, so the
    // timing is only meaningful alongside these.
    expect(tiles).toBe(EXPECTED_TILES);
    expect(cards).toBe(162);
    expect(ms).toBeLessThan(BUDGET_MS);
  }, 120_000);
});
