// @vitest-environment jsdom
/**
 * WP2.3 Stage 0 — characterisation ("golden master") of the wall chart.
 *
 * These snapshots describe what the *current, unmodified* `CampaignWallChart`
 * renders. They are not a specification of what it should render: their only
 * job is to fail if Stage 1's extraction changes the output. Nothing in here
 * re-implements product logic — every expected value is produced by mounting
 * the real component over a deterministic fixture.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { characterize, domSkeleton } from "./harness/characterize";
import { buildWallChartFixture } from "./harness/fixture";
import { mountWallChart, type MountedWallChart } from "./harness/mount";

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

let mounted: MountedWallChart | null = null;

beforeEach(() => {
  resetSpies();
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe("CampaignWallChart characterization", () => {
  it("default: writable, hint dismissed, no query string", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: buildWallChartFixture("small"),
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("default: structural skeleton", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: buildWallChartFixture("small"),
    });
    expect(domSkeleton(mounted.container)).toMatchSnapshot();
  });

  it("read-only: canWrite false", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: buildWallChartFixture("small"),
      canWrite: false,
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("hint-visible: rating hint not yet dismissed", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: buildWallChartFixture("small", { hintDismissals: [] }),
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("build-list-open: ?buildList=1", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: buildWallChartFixture("small"),
      search: "buildList=1&view=wall-chart",
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("no-units: campaign with no organising units", async () => {
    const fixture = buildWallChartFixture("small");
    mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: {
        ...fixture,
        tables: { ...fixture.tables, campaign_organising_units: [], campaign_worker_ou: [] },
      },
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("hidden-unit: one unit hidden via stored visibility", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: buildWallChartFixture("small"),
      localStorage: { "wallchart:unit-visibility:1": JSON.stringify([20]) },
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("count-mode: stored display mode is counts, not percentages", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChart,
      fixture: buildWallChartFixture("small"),
      localStorage: { "wallchart:displayMode:1": "count" },
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });
});
