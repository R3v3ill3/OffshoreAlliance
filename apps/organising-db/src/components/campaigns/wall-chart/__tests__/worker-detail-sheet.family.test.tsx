// @vitest-environment jsdom
/**
 * WP3.8 (wp3.8.md §4.3) — the worker sheet's Ratings tab on a child campaign:
 * picking the parent's shared assessment and saving posts the upsert against
 * the parent's `activity_id` (acceptance item 3, RAT-a — never copied); the
 * history list marks a family row "Shared" and hides a row whose activity is
 * neither owned nor family (a sibling's, which the real filter never
 * returns but the fake backend does).
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
} from "./harness/mocks";
import { resetBackend, writeInvocations } from "./harness/backend";
import { buildWallChartFixture, type WallChartFixture } from "./harness/fixture";
import { button, selectOption } from "./harness/locate";
import { click, mountWallChart, type MountedWallChart } from "./harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => authContextMock());
vi.mock("sonner", () => sonnerMock());

// Imported last: it pulls in the mocked edges above.
import { RatingsTab } from "../worker-detail-sheet";

/** Ada Adams (101) — a member of campaign 1, rated 1 on the owned "Petition ask". */
const ADA = 101;

function Wrapper({ campaignId, canWrite }: { campaignId: string; canWrite: boolean }) {
  return <RatingsTab campaignId={campaignId} workerId={ADA} workerName="Ada Adams" canWrite={canWrite} />;
}

/** The history rows as the sheet renders them, with the embedded activity the real embed returns. */
function buildFixture(): WallChartFixture {
  const base = buildWallChartFixture("small", {
    family: { parentId: 9, parentName: "ROV sector wide" },
  });
  const ratings = [
    {
      rating_id: 9001,
      worker_id: ADA,
      activity_id: 501,
      rating: 1,
      binary_value: null,
      notes: null,
      rated_at: "2026-01-02T00:00:00.000Z",
      source: "fixture",
      activity: { activity_id: 501, title: "Petition ask", is_binary: false, campaign_id: 1, scope: "campaign" },
    },
    {
      rating_id: 9101,
      worker_id: ADA,
      activity_id: 901,
      rating: 2,
      binary_value: null,
      notes: null,
      rated_at: "2026-01-04T00:00:00.000Z",
      source: "staff",
      activity: { activity_id: 901, title: "Sector petition", is_binary: false, campaign_id: 9, scope: "family" },
    },
    {
      rating_id: 9201,
      worker_id: ADA,
      activity_id: 701,
      rating: 3,
      binary_value: null,
      notes: null,
      rated_at: "2026-01-05T00:00:00.000Z",
      source: "staff",
      // A sibling campaign's row: the family filter never returns it; the fake does.
      activity: { activity_id: 701, title: "Sibling ask", is_binary: false, campaign_id: 7, scope: "family" },
    },
  ];
  return {
    ...base,
    tables: { ...base.tables, campaign_activity_ratings: ratings },
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

function historyTitles(root: ParentNode): string[] {
  return [...root.querySelectorAll("p.font-medium.truncate")].map((p) =>
    (p.textContent ?? "").replace(/\s+/gu, " ").trim()
  );
}

describe("worker sheet Ratings tab — campaign families", () => {
  let mounted: MountedWallChart | null = null;

  beforeEach(() => {
    resetSpies();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    resetBackend();
  });

  it("shows the family history row with a Shared badge and hides a sibling's row", async () => {
    mounted = await mountWallChart({ Component: Wrapper, fixture: buildFixture() });
    expect(historyTitles(mounted.container)).toEqual(["Petition ask", "Sector petitionShared"]);
  });

  it("rating the shared assessment upserts against the parent's activity_id", async () => {
    mounted = await mountWallChart({ Component: Wrapper, fixture: buildFixture() });
    const { container } = mounted;

    // The Assessment select: owned first, then the parent's group.
    const triggers = [...container.querySelectorAll<HTMLButtonElement>('button[role="combobox"]')];
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    await click(triggers[0]);
    const labels = [...document.body.querySelectorAll('[role="option"]')].map((o) =>
      (o.textContent ?? "").replace(/\s+/gu, " ").trim()
    );
    expect(labels).toEqual(["Petition ask", "Sector petition · shared"]);
    expect(document.body.textContent).toContain("Shared from ROV sector wide");
    await click(selectOption("Sector petition · shared"));
    await flush();

    // Rating 1 on the (non-binary) picker.
    const ratingTrigger = [...container.querySelectorAll<HTMLButtonElement>('button[role="combobox"]')][1];
    await click(ratingTrigger);
    const one = [...document.body.querySelectorAll('[role="option"]')].find((o) =>
      (o.textContent ?? "").trim().startsWith("1 —")
    );
    if (!one) throw new Error("No rating option 1");
    await click(one);
    await flush();

    await click(button(container, "Save rating"));
    await flush();

    const upserts = writeInvocations().filter(
      (w) => w.table === "campaign_activity_ratings" && w.op === "upsert"
    );
    expect(upserts).toHaveLength(1);
    const payload = upserts[0].payload as { activity_id: number; worker_id: number; rating: number };
    expect(payload.activity_id).toBe(901);
    expect(payload.worker_id).toBe(ADA);
    expect(payload.rating).toBe(1);
  });
});
