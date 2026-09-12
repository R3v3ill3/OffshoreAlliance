// @vitest-environment jsdom
/**
 * WP2.3 fix round 2 — the mount harness releases what it acquired, even when
 * the mount fails.
 *
 * `mountWallChart` installs a module-global fixture, appends a container to
 * `document.body`, creates a React root and a QueryClient, and only then
 * returns the `unmount` that releases all four. Anything thrown in between —
 * a query that never settles, a query that settles as `error` — used to leave
 * every one of them behind, so the next test in the file inherited a live
 * chart in the DOM and someone else's fixture.
 *
 * The failure is provoked the way it would really happen: a fixture missing a
 * table the chart queries, which `harness/backend.ts` rejects loudly.
 */

import { describe, expect, it, vi } from "vitest";

import {
  authContextMock,
  fetchApiMock,
  moveWorkerMutationMock,
  navigationMock,
  sonnerMock,
  supabaseClientMock,
  workerDetailProviderMock,
} from "./harness/mocks";
import { backendInstalled } from "./harness/backend";
import { buildWallChartFixture, type WallChartFixture } from "./harness/fixture";
import { createWallChartQueryClient } from "./harness/query-client";
import { unitCard, cardTiles } from "./harness/locate";
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

/** The "small" fixture with one queried table removed, so the mount cannot settle. */
function fixtureMissingATable(): WallChartFixture {
  const fixture = buildWallChartFixture("small");
  return {
    ...fixture,
    tables: Object.fromEntries(
      Object.entries(fixture.tables).filter(
        ([table]) => table !== "campaign_worker_rating_summary"
      )
    ),
  };
}

describe("mount harness cleanup", () => {
  it("releases the container, the query cache and the installed fixture when a mount fails", async () => {
    const bodyBefore = document.body.childElementCount;
    // Supplied by the test because a failed mount returns nothing to read it from.
    const queryClient = createWallChartQueryClient();

    await expect(
      mountWallChart({
        Component: CampaignWallChart,
        fixture: fixtureMissingATable(),
        queryClient,
      })
    ).rejects.toThrow(/did not settle as success/u);

    expect(document.body.childElementCount).toBe(bodyBefore);
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(backendInstalled()).toBe(false);
  });

  it("still mounts, renders and unmounts normally when nothing fails", async () => {
    // The failure path must not have changed the successful one — and this
    // mount succeeding at all is the proof that the failed mount above left no
    // fixture, container or cache behind.
    const bodyBefore = document.body.childElementCount;

    const mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: buildWallChartFixture("small"),
    });

    expect(backendInstalled()).toBe(true);
    expect(cardTiles(unitCard(mounted.container, "Unassigned workers"))).toEqual([
      "112 Lena Lane",
    ]);

    mounted.unmount();

    expect(document.body.childElementCount).toBe(bodyBefore);
    expect(mounted.queryClient.getQueryCache().getAll()).toEqual([]);
    expect(backendInstalled()).toBe(false);
  });
});
