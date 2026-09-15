// @vitest-environment jsdom
/**
 * WP2.4 Stage 2 (wp2.4.md §3.14, §4.3) — the workforce board: which shell
 * the `groups_v2` flag mounts, the sync-on-open query on both paths, and the
 * SY-c notice (shown only when something changed, dismissible, the two
 * invalidations only when something changed).
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
} from "../../wall-chart/__tests__/harness/mocks";
import { buildWallChartFixtureV2 } from "../../wall-chart/__tests__/harness/fixture";
import { button } from "../../wall-chart/__tests__/harness/locate";
import { click, mountWallChart, type MountedWallChart } from "../../wall-chart/__tests__/harness/mount";
import { createWallChartQueryClient } from "../../wall-chart/__tests__/harness/query-client";

const flags = vi.hoisted(() => ({ groupsV2: false }));

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
vi.mock("@/lib/workspace/use-workspace", () => ({
  useWorkspace: () => ({ flags }),
}));

// Imported last: this module pulls in every mocked edge above.
import { WorkforceBoard } from "../workforce-board";

const LEGACY_SENTENCE = "Campaign default view can be overridden per unit";
const V2_SENTENCE = "Each card is a Unit of the selected Group.";
const CHANGED = { success: true, workersAdded: 12, membersAdded: 1, ouAssignmentsUpserted: 2, ouAssignmentsSkipped: 1 };
const SKIPPED_ONLY = { success: true, workersAdded: 12, membersAdded: 0, ouAssignmentsUpserted: 0, ouAssignmentsSkipped: 3 };

let mounted: MountedWallChart | null = null;

function status(root: ParentNode): HTMLElement | null {
  return root.querySelector('[role="status"][aria-live="polite"]');
}

/** The sync query's state: `success` once the POST answered; `disabled` when it was never issued (`enabled: canWrite`). */
function syncCalls(): string {
  const state = mounted?.queryClient.getQueryCache().find({ queryKey: ["sync-universe-workers", "1"], exact: true })?.state;
  if (!state) return "absent";
  return state.dataUpdatedAt === 0 && state.fetchStatus === "idle" ? "disabled" : state.status;
}

beforeEach(() => {
  resetSpies();
  flags.groupsV2 = false;
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe("WorkforceBoard — shell choice", () => {
  it("flag off: mounts the legacy wall chart and issues the sync-on-open query", async () => {
    mounted = await mountWallChart({ Component: WorkforceBoard, fixture: buildWallChartFixtureV2("small"), search: "view=wall-chart" });

    expect(mounted.container.textContent).toContain(LEGACY_SENTENCE);
    expect(mounted.container.textContent).not.toContain(V2_SENTENCE);
    expect(syncCalls()).toBe("success");
    expect(status(mounted.container)).toBeNull();
  });

  it("flag on: mounts the v2 wall chart and issues the same sync-on-open query", async () => {
    flags.groupsV2 = true;
    mounted = await mountWallChart({ Component: WorkforceBoard, fixture: buildWallChartFixtureV2("small"), search: "view=wall-chart" });

    expect(mounted.container.textContent).toContain(V2_SENTENCE);
    expect(mounted.container.textContent).not.toContain(LEGACY_SENTENCE);
    expect(mounted.container.querySelector('button[aria-label="Group"]')).not.toBeNull();
    expect(syncCalls()).toBe("success");
  });

  it("a viewer (canWrite false) never issues the sync", async () => {
    mounted = await mountWallChart({
      Component: WorkforceBoard,
      fixture: buildWallChartFixtureV2("small"),
      search: "view=wall-chart",
      canWrite: false,
    });

    expect(syncCalls()).toBe("disabled");
    expect(status(mounted.container)).toBeNull();
  });
});

describe("WorkforceBoard — sync-on-open notice (SY-c)", () => {
  it("shows the sentence when the sync changed something, on the legacy path, and Dismiss removes it", async () => {
    mounted = await mountWallChart({
      Component: WorkforceBoard,
      fixture: buildWallChartFixtureV2("small", { syncResult: CHANGED }),
      search: "view=wall-chart",
    });

    const notice = status(mounted.container);
    expect(notice?.textContent).toContain(
      "Sync on open: 1 worker added to this campaign, 2 placed in units, 1 already placed."
    );

    await click(button(notice as HTMLElement, "Dismiss sync notice"));

    expect(status(mounted.container)).toBeNull();
  });

  it("shows the sentence on the v2 path too", async () => {
    flags.groupsV2 = true;
    mounted = await mountWallChart({
      Component: WorkforceBoard,
      fixture: buildWallChartFixtureV2("small", { syncResult: CHANGED }),
      search: "view=wall-chart",
    });

    expect(status(mounted.container)?.textContent).toContain("Sync on open: 1 worker added to this campaign");
    expect(mounted.container.textContent).toContain(V2_SENTENCE);
  });

  it("stays silent when only 'already placed' is non-zero, and when every count is zero", async () => {
    mounted = await mountWallChart({
      Component: WorkforceBoard,
      fixture: buildWallChartFixtureV2("small", { syncResult: SKIPPED_ONLY }),
      search: "view=wall-chart",
    });
    expect(status(mounted.container)).toBeNull();
    mounted.unmount();

    mounted = await mountWallChart({ Component: WorkforceBoard, fixture: buildWallChartFixtureV2("small"), search: "view=wall-chart" });
    expect(status(mounted.container)).toBeNull();
  });

  it("invalidates members and placements only when something changed", async () => {
    const changed = createWallChartQueryClient();
    const spyChanged = vi.spyOn(changed, "invalidateQueries");
    mounted = await mountWallChart({
      Component: WorkforceBoard,
      fixture: buildWallChartFixtureV2("small", { syncResult: CHANGED }),
      search: "view=wall-chart",
      queryClient: changed,
    });
    const keys = spyChanged.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(["campaign-members-full", "1"]));
    expect(keys).toContain(JSON.stringify(["campaign-worker-ou", "1"]));
    mounted.unmount();

    const unchanged = createWallChartQueryClient();
    const spyUnchanged = vi.spyOn(unchanged, "invalidateQueries");
    mounted = await mountWallChart({
      Component: WorkforceBoard,
      fixture: buildWallChartFixtureV2("small", { syncResult: SKIPPED_ONLY }),
      search: "view=wall-chart",
      queryClient: unchanged,
    });
    expect(spyUnchanged).not.toHaveBeenCalled();
  });
});
