// @vitest-environment jsdom
/**
 * WP3.8 (wp3.8.md §4.3) — the Assessments tab under the WP2.3 harness:
 *
 *   child   — "Shared from ROV sector wide", the family pill with a Shared
 *             badge and no Remove button (the owned pill keeps its Remove
 *             button); selecting the family pill and saving a rating upserts
 *             against the parent's `activity_id` (RAT-a, never copied);
 *   none    — a no-parent fixture renders no heading and no badge (today's DOM);
 *   parent  — a fixture with two children and an owned `family` row shows
 *             "Shared with 2 campaigns" and the sharing toggle; toggling
 *             records `update({ scope: "campaign" })` on the owned row only.
 */

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authContextMock,
  fetchApiMock,
  navigationMock,
  resetSpies,
  sonnerMock,
  supabaseClientMock,
} from "../wall-chart/__tests__/harness/mocks";
import { queryInvocations, resetBackend, writeInvocations } from "../wall-chart/__tests__/harness/backend";
import {
  buildWallChartFixture,
  type BuildWallChartFixtureOptions,
  type WallChartFixture,
} from "../wall-chart/__tests__/harness/fixture";
import { button, selectOption } from "../wall-chart/__tests__/harness/locate";
import { click, mountWallChart, type MountedWallChart } from "../wall-chart/__tests__/harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => authContextMock());
vi.mock("sonner", () => sonnerMock());

// Imported last: it pulls in the mocked edges above.
import { CampaignAssessmentsSection } from "../campaign-assessments";

/** The wall-chart fixture plus the tables the Assessments tab reads beyond the chart's. */
function buildTabFixture(opts: BuildWallChartFixtureOptions = {}): WallChartFixture {
  const base = buildWallChartFixture("small", opts);
  return {
    ...base,
    tables: {
      ...base.tables,
      campaign_stage_plans: [],
      plan_ambitions: [],
      campaign_ambitions: [],
      ambition_options: [],
      campaign_leader_tokens: [],
    },
    apiRoutes: {
      ...base.apiRoutes,
      [`/api/campaigns/${base.campaignId}/task-lists/progress-batch`]: {},
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function pillButton(root: ParentNode, title: string): HTMLButtonElement {
  const matches = [...root.querySelectorAll<HTMLButtonElement>("button")].filter((b) =>
    (b.textContent ?? "").replace(/\s+/gu, " ").trim().startsWith(title)
  );
  if (matches.length !== 1) {
    throw new Error(`Expected one pill "${title}", found ${matches.length}`);
  }
  return matches[0];
}

function removeButtons(root: ParentNode): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('button[title="Remove activity"]')];
}

describe("Assessments tab — campaign families", () => {
  let mounted: MountedWallChart | null = null;

  beforeEach(() => {
    resetSpies();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    resetBackend();
  });

  it("child: renders the Shared-from section, a Shared badge, no Remove on the family pill, and rates against the parent's row", async () => {
    mounted = await mountWallChart({
      Component: CampaignAssessmentsSection,
      fixture: buildTabFixture({ family: { parentId: 9, parentName: "ROV sector wide" } }),
    });
    const { container } = mounted;

    expect(container.textContent).toContain("Shared from ROV sector wide");
    const familyPill = pillButton(container, "Sector petition");
    expect(familyPill.textContent).toContain("Shared");
    // One Remove button: the owned pill's. The family pill's row has none.
    expect(removeButtons(container)).toHaveLength(1);
    expect(familyPill.parentElement?.querySelector('button[title="Remove activity"]')).toBeNull();
    // No sharing toggle in a child.
    expect(container.querySelector('button[role="switch"]')).toBeNull();

    await click(familyPill);
    await flush();
    // The ambition-links panel is the owner's; a family selection shows none.
    expect(container.textContent).not.toContain("Linked ambitions");

    // Rate Ada Adams (101) 2 on the selected (family) assessment (the fake
    // serves every rating row, so her existing 1 is already shown; a new
    // value is what makes the select fire).
    const adaRow = [...container.querySelectorAll("tr")].find((tr) =>
      (tr.textContent ?? "").includes("Ada Adams")
    );
    if (!adaRow) throw new Error("No table row for Ada Adams");
    const ratingTrigger = adaRow.querySelector<HTMLButtonElement>('button[role="combobox"]');
    if (!ratingTrigger) throw new Error("No rating select in Ada's row");
    await click(ratingTrigger);
    await click(selectOption("2"));
    await flush();

    const upserts = writeInvocations().filter(
      (w) => w.table === "campaign_activity_ratings" && w.op === "upsert"
    );
    expect(upserts).toHaveLength(1);
    const payload = upserts[0].payload as { activity_id: number; worker_id: number; rating: number };
    expect(payload).toMatchObject({ activity_id: 901, worker_id: 101, rating: 2 });
    // Nothing was written to campaign_activities: the definition is the parent's.
    expect(writeInvocations().filter((w) => w.table === "campaign_activities")).toHaveLength(0);
  });

  it("no parent: no Shared-from heading, no badge, no toggle (today's DOM)", async () => {
    mounted = await mountWallChart({
      Component: CampaignAssessmentsSection,
      fixture: buildTabFixture(),
    });
    const { container } = mounted;
    expect(container.textContent).not.toContain("Shared from");
    expect(container.textContent).not.toContain("Shared with");
    expect(pillButton(container, "Petition ask").textContent).not.toContain("Shared");
    expect(removeButtons(container)).toHaveLength(1);
    expect(container.querySelector('button[role="switch"]')).toBeNull();
  });

  it("parent: shows 'Shared with 2 campaigns' and the toggle; turning sharing off confirms, then updates { scope: 'campaign' } on the owned row", async () => {
    mounted = await mountWallChart({
      Component: CampaignAssessmentsSection,
      fixture: buildTabFixture({
        family: {
          children: [
            { campaign_id: 61, name: "Fugro" },
            { campaign_id: 62, name: "DOF" },
          ],
          ownedScope: "family",
        },
      }),
    });
    const { container } = mounted;

    expect(pillButton(container, "Petition ask").textContent).toContain("Shared with 2 campaigns");
    const toggle = container.querySelector<HTMLButtonElement>('button[role="switch"]');
    if (!toggle) throw new Error("No sharing toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain("Share with family campaigns");

    await click(toggle);
    await flush();
    // Two children: the warning first, nothing written yet.
    expect(document.body.textContent).toContain(
      "Child campaigns will no longer see this assessment. Ratings recorded from them stay here."
    );
    expect(writeInvocations().filter((w) => w.table === "campaign_activities")).toHaveLength(0);

    await click(button(document.body, "Stop sharing"));
    await flush();

    const updates = writeInvocations().filter(
      (w) => w.table === "campaign_activities" && w.op === "update"
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ scope: "campaign" });
    // … on the owned row only: `.eq("activity_id", 501).eq("campaign_id", 1)`.
    const chain = queryInvocations().find(
      (q) => q.table === "campaign_activities" && q.ops.some((o) => o.method === "update")
    );
    expect(chain?.ops.map((o) => [o.method, ...o.args])).toEqual([
      ["update", { scope: "campaign" }],
      ["eq", "activity_id", 501],
      ["eq", "campaign_id", 1],
    ]);
  });
});
