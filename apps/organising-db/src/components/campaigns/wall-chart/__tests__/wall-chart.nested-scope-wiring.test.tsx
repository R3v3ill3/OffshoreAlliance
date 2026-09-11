// @vitest-environment jsdom
/**
 * WP2.3 fix round 3 — direct coverage of the extracted nested render path.
 *
 * What the confirmation reviewer blocked on. The full-component nested tests
 * (`wall-chart.nested-scopes.test.tsx`, kept as public-flow coverage) reach a
 * nested filter only through "Apply to all units", which writes the **same**
 * state to every scope. Identical state per scope cannot distinguish:
 *
 *   - a grandchild reading its own scope key from one reading its parent's,
 *     its sibling's or its child's;
 *   - a real `applySort` from fixture insertion order.
 *
 * So this file tests `WallChartSubUnits` — the real extracted product
 * component that contains pipelines #3 and #4 — directly, with a
 * `getFilter(scopeId)` that returns a **different filter and a different sort
 * per scope id**, which the public UI cannot construct today. Product source
 * is untouched; only the inputs are ours.
 *
 * Geometry and data (`harness/nested-scope-context.tsx`):
 *
 *   Parent Unit (500, not a group container → children render expanded)
 *     ├─ Child Alpha   (510)  ids [604, 601, 606, 603, 602, 605]   ← pipeline #3
 *     │    └─ Grandchild One (511)  ids [701, 703, 704, 702]       ← pipeline #4
 *     └─ Child Sibling (520)  ids [607, 608]                       ← pipeline #3
 *
 * Every id list is deliberately unsorted, and no two scopes share a filter or
 * a sort, so each scope's exact tile order is unique to the state registered
 * under its own id.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import {
  authContextMock,
  fetchApiMock,
  navigationMock,
  sonnerMock,
  supabaseClientMock,
  workerDetailProviderMock,
} from "./harness/mocks";
import { createWallChartQueryClient } from "./harness/query-client";
import { button, cardTiles, unitCard } from "./harness/locate";
import { click, installJsdomShims } from "./harness/mount";
import {
  noFilter,
  ou,
  ratingFilter,
  subUnitsProps,
  worker,
  type NestedScopeSetup,
} from "./harness/nested-scope-context";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => authContextMock());
vi.mock("@/components/campaigns/campaign-worker-detail-provider", () =>
  workerDetailProviderMock()
);
vi.mock("sonner", () => sonnerMock());

// Imported last: this module pulls in every mocked edge above.
import { WallChartSubUnits } from "../wall-chart-unit-hierarchy";

const PARENT = 500;
const CHILD = 510;
const GRANDCHILD = 511;
const SIBLING = 520;

/** first/last names chosen so first-name order and last-name order disagree. */
const WORKERS = [
  worker(601, "Ada", "Zane"),
  worker(602, "Bo", "Yates"),
  worker(603, "Cy", "Xu"),
  worker(604, "Di", "Ware"),
  worker(605, "Eli", "Vance"),
  worker(606, "Fay", "Upton"),
  worker(607, "Gil", "Tell"),
  worker(608, "Hana", "Sun"),
  worker(701, "Gus", "Tate"),
  worker(702, "Hal", "Sims"),
  worker(703, "Ira", "Reed"),
  worker(704, "Jo", "Quinn"),
];

const CUMULATIVE = new Map<number, number | null>([
  [601, 3], [602, 2], [603, 5], [604, 3], [605, 1], [606, 2],
  [607, 5], [608, 1],
  [701, 4], [702, 2], [703, 4], [704, 3],
]);

/** Deliberately unsorted: neither name order nor rating order. */
const CHILD_IDS = [604, 601, 606, 603, 602, 605];
const GRANDCHILD_IDS = [701, 703, 704, 702];
const SIBLING_IDS = [607, 608];

const PARENT_OU = ou(PARENT, "Parent Unit");
const CHILD_OU = ou(CHILD, "Child Alpha", { parent_ou_id: PARENT });
const GRANDCHILD_OU = ou(GRANDCHILD, "Grandchild One", { parent_ou_id: CHILD });
const SIBLING_OU = ou(SIBLING, "Child Sibling", { parent_ou_id: PARENT });

function setup(filterByScope: Map<number, ReturnType<typeof noFilter>>): NestedScopeSetup {
  return {
    parentOu: PARENT_OU,
    visibleChildList: [CHILD_OU, SIBLING_OU],
    workersByOu: new Map([
      [PARENT, []],
      [CHILD, CHILD_IDS],
      [GRANDCHILD, GRANDCHILD_IDS],
      [SIBLING, SIBLING_IDS],
    ]),
    childrenByParent: new Map([[CHILD, [GRANDCHILD_OU]]]),
    workers: WORKERS,
    cumulativeByWorker: CUMULATIVE,
    filterByScope,
  };
}

let root: Root | null = null;
let container: HTMLElement | null = null;

async function render(filterByScope: Map<number, ReturnType<typeof noFilter>>): Promise<HTMLElement> {
  installJsdomShims();
  const queryClient = createWallChartQueryClient();
  container = document.createElement("div");
  document.body.appendChild(container);
  const props = subUnitsProps(setup(filterByScope));
  await act(async () => {
    root = createRoot(container as HTMLElement);
    root.render(
      <QueryClientProvider client={queryClient}>
        <WallChartSubUnits {...props} />
      </QueryClientProvider>
    );
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

/** Grandchild cards are `contentCollapsible` with no initial expansion. */
async function expandGrandchild(host: HTMLElement): Promise<void> {
  await click(button(unitCard(host, "Grandchild One"), "Expand unit"));
}

describe("WallChartSubUnits — per-scope filter and sort wiring", () => {
  it("filters and sorts each nested scope by the state registered under its own ou_id", async () => {
    // Four scopes, four different filters, three different sorts. No two
    // scopes can produce the same tile list from the same ids.
    const host = await render(
      new Map([
        [PARENT, noFilter("cumulative_desc")],
        [CHILD, ratingFilter(["2", "3"], "first_name")],
        [GRANDCHILD, ratingFilter(["4"], "last_name")],
        [SIBLING, ratingFilter(["5", "1"], "last_name")],
      ])
    );
    await expandGrandchild(host);

    // Child: buckets 2 and 3 keep 604(3), 601(3), 606(2), 602(2) — in that
    // input order — then first_name sorts them Ada, Bo, Di, Fay.
    expect(cardTiles(unitCard(host, "Child Alpha"))).toEqual([
      "601 Ada Zane",
      "602 Bo Yates",
      "604 Di Ware",
      "606 Fay Upton",
    ]);

    // Grandchild: bucket 4 keeps 701 and 703 — in that input order — then
    // last_name sorts them Reed before Tate, which reverses them.
    expect(cardTiles(unitCard(host, "Grandchild One"))).toEqual([
      "703 Ira Reed",
      "701 Gus Tate",
    ]);

    // Sibling: buckets 5 and 1 keep 607 and 608 — in that input order — then
    // last_name sorts them Sun before Tell, which reverses them.
    expect(cardTiles(unitCard(host, "Child Sibling"))).toEqual([
      "608 Hana Sun",
      "607 Gil Tell",
    ]);
  });

  it("swapping the child's and grandchild's states swaps their tiles, so neither reads the other's key", async () => {
    // The same two states as above, registered under each other's ids. A
    // grandchild that read the child's key (or a child that read the
    // grandchild's) would be unmoved by this swap and so must fail one of
    // these two tests.
    const host = await render(
      new Map([
        [PARENT, noFilter("cumulative_desc")],
        [CHILD, ratingFilter(["4"], "last_name")],
        [GRANDCHILD, ratingFilter(["2", "3"], "first_name")],
        [SIBLING, ratingFilter(["5", "1"], "last_name")],
      ])
    );
    await expandGrandchild(host);

    // No child worker is in bucket 4.
    expect(cardTiles(unitCard(host, "Child Alpha"))).toEqual([]);
    // Buckets 2 and 3 keep 704(3) and 702(2) — in that input order — then
    // first_name sorts them Hal before Jo, which reverses them.
    expect(cardTiles(unitCard(host, "Grandchild One"))).toEqual([
      "702 Hal Sims",
      "704 Jo Quinn",
    ]);
    // Untouched by the swap.
    expect(cardTiles(unitCard(host, "Child Sibling"))).toEqual([
      "608 Hana Sun",
      "607 Gil Tell",
    ]);
  });

  it("gives each nested scope an unfiltered list in a sort order of its own", async () => {
    // With no filter anywhere, the only thing that can order the tiles is
    // `applySort` — so a bypassed sort leaves the unsorted input order and
    // fails, and each scope's order is still its own.
    const host = await render(
      new Map([
        [PARENT, noFilter("cumulative_desc")],
        [CHILD, noFilter("cumulative_desc")],
        [GRANDCHILD, noFilter("first_name")],
        [SIBLING, noFilter("last_name")],
      ])
    );
    await expandGrandchild(host);

    // cumulative_desc: 5, 3, 3, 2, 2, 1 — ties broken by the comparator's
    // stable fallback, which is the filtered input order.
    expect(cardTiles(unitCard(host, "Child Alpha"))).toEqual([
      "603 Cy Xu",
      "604 Di Ware",
      "601 Ada Zane",
      "606 Fay Upton",
      "602 Bo Yates",
      "605 Eli Vance",
    ]);
    // first_name: Gus, Hal, Ira, Jo — a different order from the input
    // [701, 703, 704, 702] and from every other scope's.
    expect(cardTiles(unitCard(host, "Grandchild One"))).toEqual([
      "701 Gus Tate",
      "702 Hal Sims",
      "703 Ira Reed",
      "704 Jo Quinn",
    ]);
    expect(cardTiles(unitCard(host, "Child Sibling"))).toEqual([
      "608 Hana Sun",
      "607 Gil Tell",
    ]);
  });
});
