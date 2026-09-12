// @vitest-environment jsdom
/**
 * WP2.3 fix round 2 — nested CHILD and GRANDCHILD scope coverage.
 *
 * Why this file exists. `wall-chart-unit-hierarchy.tsx` retains four separate
 * filter→sort→render pipelines (§1.4, §3.3): unassigned (#1, in
 * `wall-chart-unassigned-card.tsx`), top-level unit (#2), child sub-unit (#3)
 * and grandchild sub-unit (#4). Until now nothing asserted #3 or #4 against
 * real tiles: the characterisation snapshots leave child cards collapsed, so
 * they render no tiles at all and a grandchild card is not in the DOM; the
 * interaction suite only checked that headings appear after expansion; and
 * preview campaign 1 is flat, so the e2e specs never reach a nested scope
 * either. Breaking child or grandchild tile rendering, or bypassing either
 * nested `applyFilters` call, would have passed every gate.
 *
 * These tests drive the product's own controls — the per-card "Expand unit"
 * chevron and the filter popover's "Apply to all units" — and assert exact
 * worker identities per scope, so a regression in either nested pipeline
 * fails here with a readable diff.
 *
 * The default collapsed state is pinned rather than changed: the first test
 * asserts it, and every other test reaches the nested scopes by clicking.
 *
 * Fixture geometry (`harness/fixture.ts`, "small"), all fixed literals:
 *
 *   Acme Group (10, group container)  tiles: 101 Ada
 *     ├─ Acme North (11)              tiles: 102 Ben, 107 Gina        ← child, pipeline #3
 *     └─ Acme South (12)              tiles: 103 Cara, 108 Hugo       ← child, pipeline #3
 *          └─ South Deck (13)         tiles: 104 Dan                  ← grandchild, pipeline #4
 *   Port Alpha (20, flat)             tiles: 105, 106, 107, 109, 110, 111
 *   Unassigned                        tiles: 112 Lena
 *
 * Cumulative ratings: 101→1, 102→2, 103→3, 104→4, 105→5, 107→2, 112→3;
 * 106, 108, 109, 110, 111 unrated. So the rating-bucket filters "3 (3–<4)" and
 * "4 (4–<5)" cut the child and grandchild scopes in opposite directions, which
 * is what lets one test prove each pipeline both drops and keeps tiles.
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
import { buildWallChartFixture } from "./harness/fixture";
import {
  button,
  cardTiles,
  filterCheckbox,
  filterTrigger,
  unitCard,
  unitTitles,
} from "./harness/locate";
import { click, mountWallChart, type MountedWallChart } from "./harness/mount";

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

const ACME_GROUP = "Acme Group";
const ACME_NORTH = "Acme North";
const ACME_SOUTH = "Acme South";
const SOUTH_DECK = "South Deck";

const NORTH_ALL = ["102 Ben Baker", "107 Gina Grant"];
const SOUTH_ALL = ["103 Cara Carter", "108 Hugo Hall"];
const DECK_ALL = ["104 Dan Dawson"];

let mounted: MountedWallChart;

async function mount(): Promise<MountedWallChart> {
  mounted = await mountWallChart({
    Component: CampaignWallChart,
    fixture: buildWallChartFixture("small"),
  });
  return mounted;
}

/** Tiles a card renders itself, addressed by heading so the card is re-read after each render. */
function tilesOf(container: HTMLElement, title: string): string[] {
  return cardTiles(unitCard(container, title));
}

/** Reveal both nested levels through the product's own expand chevrons. */
async function revealNestedScopes(container: HTMLElement): Promise<void> {
  await click(button(unitCard(container, ACME_NORTH), "Expand unit"));
  await click(button(unitCard(container, ACME_SOUTH), "Expand unit"));
  // South Deck only enters the DOM once its parent's content is open.
  await click(button(unitCard(container, SOUTH_DECK), "Expand unit"));
}

beforeEach(() => {
  resetSpies();
});

afterEach(() => {
  mounted?.unmount();
});

describe("nested scopes — reveal", () => {
  it("child cards start collapsed and a grandchild card is not rendered at all", async () => {
    const { container } = await mount();

    // Pinned as current behaviour, not asserted as desirable: this is exactly
    // why the characterisation snapshots never covered a nested tile.
    expect(unitTitles(container)).toEqual([
      "Unassigned workers",
      ACME_GROUP,
      ACME_NORTH,
      ACME_SOUTH,
      "Port Alpha",
    ]);
    expect(tilesOf(container, ACME_NORTH)).toEqual([]);
    expect(tilesOf(container, ACME_SOUTH)).toEqual([]);
    expect(tilesOf(container, ACME_GROUP)).toEqual(["101 Ada Adams"]);
  });

  it("expanding a child card renders that child's own workers and no one else's", async () => {
    const { container } = await mount();

    await click(button(unitCard(container, ACME_SOUTH), "Expand unit"));

    expect(tilesOf(container, ACME_SOUTH)).toEqual(SOUTH_ALL);
    // The child's workers stay in the child: the parent still shows only its
    // own, and the sibling child is untouched.
    expect(tilesOf(container, ACME_GROUP)).toEqual(["101 Ada Adams"]);
    expect(tilesOf(container, ACME_NORTH)).toEqual([]);
  });

  it("expanding a grandchild card renders that grandchild's own worker", async () => {
    const { container } = await mount();

    await click(button(unitCard(container, ACME_SOUTH), "Expand unit"));
    expect(unitTitles(container)).toContain(SOUTH_DECK);
    expect(tilesOf(container, SOUTH_DECK)).toEqual([]);

    await click(button(unitCard(container, SOUTH_DECK), "Expand unit"));

    expect(tilesOf(container, SOUTH_DECK)).toEqual(DECK_ALL);
    // Depth 2 does not absorb depth 1, or vice versa.
    expect(tilesOf(container, ACME_SOUTH)).toEqual(SOUTH_ALL);
    expect(tilesOf(container, ACME_GROUP)).toEqual(["101 Ada Adams"]);
  });
});

describe("nested scopes — filtering", () => {
  it("a top-level card's own filter does not reach its child or grandchild cards", async () => {
    // Pipelines #3 and #4 read `getFilter(child.ou_id)` / `getFilter(gc.ou_id)`.
    // If either were re-pointed at the parent's scope key, this fails.
    const { container } = await mount();
    await revealNestedScopes(container);

    await click(filterTrigger(unitCard(container, ACME_GROUP)));
    await click(filterCheckbox("3 (3–<4)"));

    // Ada is rated 1, so the parent's own grid empties …
    expect(tilesOf(container, ACME_GROUP)).toEqual([]);
    // … and nothing nested moves.
    expect(tilesOf(container, ACME_NORTH)).toEqual(NORTH_ALL);
    expect(tilesOf(container, ACME_SOUTH)).toEqual(SOUTH_ALL);
    expect(tilesOf(container, SOUTH_DECK)).toEqual(DECK_ALL);
  });

  it("Apply to all runs the child and grandchild filter pipelines over their own workers", async () => {
    const { container } = await mount();
    await revealNestedScopes(container);

    // Pre-filter, so a regression that simply stops rendering nested tiles
    // cannot be mistaken for a filter that removed them.
    expect(tilesOf(container, ACME_NORTH)).toEqual(NORTH_ALL);
    expect(tilesOf(container, ACME_SOUTH)).toEqual(SOUTH_ALL);
    expect(tilesOf(container, SOUTH_DECK)).toEqual(DECK_ALL);

    await click(filterTrigger(unitCard(container, ACME_GROUP)));
    await click(filterCheckbox("3 (3–<4)"));
    await click(button(document.body, "Apply to all units"));

    // Child scope keeps the one worker in the bucket and drops the other, so
    // pipeline #3 is proven to filter *and* to still render.
    expect(tilesOf(container, ACME_SOUTH)).toEqual(["103 Cara Carter"]);
    // Its sibling child has nobody in the bucket — the pipeline is evaluated
    // per child scope, not once and shared.
    expect(tilesOf(container, ACME_NORTH)).toEqual([]);
    // Grandchild: Dan is rated 4, so pipeline #4 drops him.
    expect(tilesOf(container, SOUTH_DECK)).toEqual([]);

    // Now the opposite cut, so each nested pipeline is proven in both
    // directions: the grandchild keeps its worker and the child empties.
    await click(filterCheckbox("3 (3–<4)"));
    await click(filterCheckbox("4 (4–<5)"));
    await click(button(document.body, "Apply to all units"));

    expect(tilesOf(container, SOUTH_DECK)).toEqual(DECK_ALL);
    expect(tilesOf(container, ACME_SOUTH)).toEqual([]);
    expect(tilesOf(container, ACME_NORTH)).toEqual([]);
  });
});
