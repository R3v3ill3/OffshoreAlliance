// @vitest-environment jsdom
/**
 * WP3.8 (wp3.8.md §4.3) — the Basics sheet's "Part of" select under the
 * WP2.3 harness: it lists only the candidates the `campaigns_i_can_write`
 * fake returns, never the campaign itself, is disabled with the reason when
 * children exist, and Save records `parent_campaign_id` in the update
 * payload (SET-a: the trigger is the authority; this is the friendly
 * pre-check).
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
import {
  answerRpc,
  resetBackend,
  rpcInvocations,
  writeInvocations,
} from "../wall-chart/__tests__/harness/backend";
import { buildWallChartFixture, type WallChartFixture } from "../wall-chart/__tests__/harness/fixture";
import { button } from "../wall-chart/__tests__/harness/locate";
import { click, mountWallChart, type MountedWallChart } from "../wall-chart/__tests__/harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
// The write-access hook reads `canWrite` off the auth context; the shared
// mock has no such field, so it is widened here (additively) for this file.
vi.mock("@/lib/supabase/auth-context", () => {
  const base = authContextMock();
  return {
    useAuth: () => ({ ...base.useAuth(), canWrite: true, isLeadOrganiser: false }),
  };
});
vi.mock("sonner", () => sonnerMock());

// Imported last: it pulls in the mocked edges above.
import { CampaignBasicsEditSheet } from "../campaign-basics-edit-sheet";

const CAMPAIGN = 1;
const onSaved = vi.fn();

function Wrapper({ campaignId }: { campaignId: string; canWrite: boolean }) {
  return (
    <CampaignBasicsEditSheet
      open
      onOpenChange={() => {}}
      campaign={{
        campaign_id: Number(campaignId),
        name: "Test Campaign",
        start_date: null,
        end_date: null,
        plan_timeframe_weeks: null,
        total_worker_estimate: 20,
        organiser_id: null,
        parent_campaign_id: null,
      }}
      campaignId={Number(campaignId)}
      onSaved={onSaved}
    />
  );
}

/**
 * The `campaigns` table serves every row to every query (the fake ignores
 * filters), so the candidate list and the children list both see these rows
 * and the component's client-side predicates do the narrowing.
 */
function buildSheetFixture(opts: { children?: boolean } = {}): WallChartFixture {
  const base = buildWallChartFixture("small");
  const own = base.tables.campaigns[0] as Record<string, unknown>;
  const campaigns: unknown[] = [
    own,
    { campaign_id: 9, name: "ROV sector wide", parent_campaign_id: null, is_sms_episode: false, is_standing: false },
    { campaign_id: 12, name: "Not mine", parent_campaign_id: null, is_sms_episode: false, is_standing: false },
    { campaign_id: 13, name: "SMS episode", parent_campaign_id: null, is_sms_episode: true, is_standing: false },
    { campaign_id: 14, name: "Already a child", parent_campaign_id: 9, is_sms_episode: false, is_standing: false },
  ];
  if (opts.children) {
    campaigns.push(
      { campaign_id: 61, name: "Fugro", parent_campaign_id: CAMPAIGN, is_sms_episode: false, is_standing: false },
      { campaign_id: 62, name: "DOF", parent_campaign_id: CAMPAIGN, is_sms_episode: false, is_standing: false }
    );
  }
  return {
    ...base,
    tables: {
      ...base.tables,
      campaigns,
      user_profiles: [],
      campaign_ou_coverage_summary: [],
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

function partOfTrigger(): HTMLButtonElement {
  const el = document.getElementById("basics-parent");
  if (!(el instanceof HTMLButtonElement)) throw new Error("No Part of trigger");
  return el;
}

function optionLabels(): string[] {
  return [...document.body.querySelectorAll('[role="option"]')].map((o) =>
    (o.textContent ?? "").replace(/\s+/gu, " ").trim()
  );
}

describe("Basics sheet — Part of (campaign families)", () => {
  let mounted: MountedWallChart | null = null;

  beforeEach(() => {
    resetSpies();
    onSaved.mockReset();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    resetBackend();
  });

  it("lists only writable candidates, never the campaign itself, and saves parent_campaign_id", async () => {
    // Writable: 9 and 13 (an episode, excluded client-side) but not 12.
    answerRpc("campaigns_i_can_write", { data: [9, 13], error: null });
    mounted = await mountWallChart({ Component: Wrapper, fixture: buildSheetFixture() });

    // The write-access round trip was asked once, for the candidates (not the campaign itself).
    const access = rpcInvocations().filter((c) => c.name === "campaigns_i_can_write");
    expect(access).toHaveLength(1);
    expect(access[0].args).toEqual({ p_campaign_ids: [9, 12] });

    const trigger = partOfTrigger();
    expect(trigger.disabled).toBe(false);
    await click(trigger);
    expect(optionLabels()).toEqual(["None", "ROV sector wide"]);

    const option = [...document.body.querySelectorAll('[role="option"]')].find(
      (o) => (o.textContent ?? "").trim() === "ROV sector wide"
    );
    if (!option) throw new Error("No ROV option");
    await click(option);
    await flush();

    await click(button(document.body, "Save changes"));
    await flush();

    const updates = writeInvocations().filter((w) => w.table === "campaigns" && w.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ name: "Test Campaign", parent_campaign_id: 9 });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("is disabled with the reason when the campaign has children", async () => {
    answerRpc("campaigns_i_can_write", { data: [9], error: null });
    mounted = await mountWallChart({ Component: Wrapper, fixture: buildSheetFixture({ children: true }) });

    expect(partOfTrigger().disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "This campaign has 2 child campaigns, so it cannot be part of another campaign."
    );
  });

  it("clearing is always allowed: None saves parent_campaign_id null", async () => {
    answerRpc("campaigns_i_can_write", { data: [9], error: null });
    mounted = await mountWallChart({ Component: Wrapper, fixture: buildSheetFixture() });

    await click(button(document.body, "Save changes"));
    await flush();

    const updates = writeInvocations().filter((w) => w.table === "campaigns" && w.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ parent_campaign_id: null });
  });
});
