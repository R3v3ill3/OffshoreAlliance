// @vitest-environment jsdom
/**
 * WP2.4 Stage 2 (wp2.4.md §4.3) — characterisation of the v2 wall chart.
 *
 * The same contract reducer as the legacy chart's golden master
 * (`harness/characterize.ts`), over the `small` fixture with its three groups:
 * default (first group, Employer), read-only, no groups, all Unassigned, a
 * hidden unit from a seeded prefs document, and the Not in any group view.
 * Nothing here re-implements product logic; every value is produced by
 * mounting the real `CampaignWallChartV2`.
 *
 * WP2.4c (wp2.4c.md §4.3): the `small` fixture's ou 13 "South Deck" is a
 * Shift child of the Employer unit "Acme South", so the `default` and
 * `read-only` snapshots now carry it as a NESTED card (level 2) inside Acme
 * South, with Dan under it instead of in "Unassigned in Employer" — and a
 * `nested` case is added over the campaign-42 fixture.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authContextMock,
  fetchApiMock,
  navigationMock,
  resetSpies,
  sonnerMock,
  supabaseClientMock,
  workerDetailProviderMock,
} from "../../__tests__/harness/mocks";
import { characterize, domSkeleton } from "../../__tests__/harness/characterize";
import { buildWallChartFixtureV2 } from "../../__tests__/harness/fixture";
import { mountWallChart, type MountedWallChart } from "../../__tests__/harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => authContextMock());
vi.mock("@/components/campaigns/campaign-worker-detail-provider", () =>
  workerDetailProviderMock()
);
vi.mock("sonner", () => sonnerMock());
vi.mock("@/lib/workers/sync-campaign-universe", () => ({
  stampEmployerWorksiteFromOu: async () => 0,
  syncWorkersToMatchingCampaigns: async () => ({}),
}));

// Imported last: this module pulls in every mocked edge above.
import { CampaignWallChartV2 } from "../../../campaign-wall-chart-v2";

let mounted: MountedWallChart | null = null;

beforeEach(() => {
  resetSpies();
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe("CampaignWallChartV2 characterization", () => {
  it("default: writable, hints dismissed, no query string (first group)", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChartV2,
      fixture: buildWallChartFixtureV2("small"),
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("default: structural skeleton", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChartV2,
      fixture: buildWallChartFixtureV2("small"),
    });
    expect(domSkeleton(mounted.container)).toMatchSnapshot();
  });

  it("read-only: canWrite false", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChartV2,
      fixture: buildWallChartFixtureV2("small"),
      canWrite: false,
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("no-groups: the whole membership as one flat grid", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChartV2,
      fixture: buildWallChartFixtureV2("small", { groups: [] }),
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("all-unassigned: no placements at all", async () => {
    const fixture = buildWallChartFixtureV2("small");
    mounted = await mountWallChart({
      Component: CampaignWallChartV2,
      fixture: { ...fixture, tables: { ...fixture.tables, campaign_worker_ou: [] } },
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("hidden-unit: one unit hidden by the stored prefs document", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChartV2,
      fixture: buildWallChartFixtureV2("small", { prefs: { wallChart: { v: 1, hiddenOuIds: [11] } } }),
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("not-in-any-group: ?group=none", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChartV2,
      fixture: buildWallChartFixtureV2("small"),
      search: "group=none",
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("nested: the campaign-42 shape, Worksite (wp2.4c.md §4.3)", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChartV2,
      fixture: buildWallChartFixtureV2("nested"),
      search: "group=2",
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });

  it("hint-visible: group-selector hint not yet dismissed", async () => {
    mounted = await mountWallChart({
      Component: CampaignWallChartV2,
      fixture: buildWallChartFixtureV2("small", { hintDismissals: ["wall_chart_rating"] }),
    });
    expect(characterize(mounted.container, mounted.queryClient)).toMatchSnapshot();
  });
});
