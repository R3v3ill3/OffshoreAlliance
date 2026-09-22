// @vitest-environment jsdom
/**
 * WP3.8 follow-up (wp3.8.md D41) — the shared "Part of" control on its own,
 * under the WP2.3 harness: it lists the writable candidates (never the
 * campaign itself, never an archived / episode / already-a-child campaign),
 * hands the chosen id back as a string, and is disabled with the reason when
 * the campaign has children. The Settings page has no jsdom harness, so this
 * is the coverage for the control it now embeds; the sheet's own suite stays
 * as it was.
 */

import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authContextMock,
  fetchApiMock,
  navigationMock,
  resetSpies,
  sonnerMock,
  supabaseClientMock,
} from "../wall-chart/__tests__/harness/mocks";
import { answerRpc, resetBackend, rpcInvocations } from "../wall-chart/__tests__/harness/backend";
import { buildWallChartFixture, type WallChartFixture } from "../wall-chart/__tests__/harness/fixture";
import { click, mountWallChart, type MountedWallChart } from "../wall-chart/__tests__/harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => {
  const base = authContextMock();
  return { useAuth: () => ({ ...base.useAuth(), canWrite: true, isLeadOrganiser: false }) };
});
vi.mock("sonner", () => sonnerMock());

// Imported last: it pulls in the mocked edges above.
import { CampaignParentSelect, parentSelectHint } from "../campaign-parent-select";

const CAMPAIGN = 1;
const onChange = vi.fn<(value: string) => void>();
let initialValue = "";

function Wrapper({ campaignId }: { campaignId: string; canWrite: boolean }) {
  const [value, setValue] = useState(initialValue);
  return (
    <CampaignParentSelect
      id="settings-parent"
      campaignId={Number(campaignId)}
      value={value}
      onChange={(v) => {
        onChange(v);
        setValue(v);
      }}
    />
  );
}

function buildFixture(opts: { children?: boolean } = {}): WallChartFixture {
  const base = buildWallChartFixture("small");
  const own = base.tables.campaigns[0] as Record<string, unknown>;
  const campaigns: unknown[] = [
    own,
    { campaign_id: 9, name: "ROV sector wide", parent_campaign_id: null, is_sms_episode: false, is_standing: false },
    { campaign_id: 12, name: "Not mine", parent_campaign_id: null, is_sms_episode: false, is_standing: false },
    { campaign_id: 13, name: "SMS episode", parent_campaign_id: null, is_sms_episode: true, is_standing: false },
    { campaign_id: 14, name: "Already a child", parent_campaign_id: 9, is_sms_episode: false, is_standing: false },
    { campaign_id: 15, name: "Archived", parent_campaign_id: null, is_sms_episode: false, is_standing: false, archived_at: "2026-01-01T00:00:00.000Z" },
    ...(opts.children
      ? [
          { campaign_id: 61, name: "Fugro", parent_campaign_id: CAMPAIGN, is_sms_episode: false, is_standing: false },
          { campaign_id: 62, name: "DOF", parent_campaign_id: CAMPAIGN, is_sms_episode: false, is_standing: false },
        ]
      : []),
  ];
  return { ...base, tables: { ...base.tables, campaigns } };
}

function trigger(): HTMLButtonElement {
  const el = document.getElementById("settings-parent");
  if (!(el instanceof HTMLButtonElement)) throw new Error("No Part of trigger");
  return el;
}

function optionLabels(): string[] {
  return [...document.body.querySelectorAll('[role="option"]')].map((o) =>
    (o.textContent ?? "").replace(/\s+/gu, " ").trim()
  );
}

describe("CampaignParentSelect (shared Part of control, D41)", () => {
  let mounted: MountedWallChart | null = null;

  beforeEach(() => {
    resetSpies();
    onChange.mockReset();
    initialValue = "";
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    resetBackend();
  });

  it("renders the writable candidates only, labelled Part of, and hands the chosen id back as a string", async () => {
    answerRpc("campaigns_i_can_write", { data: [9, 13, 15], error: null });
    mounted = await mountWallChart({ Component: Wrapper, fixture: buildFixture() });
    const { container } = mounted;

    expect(container.querySelector('label[for="settings-parent"]')?.textContent).toBe("Part of");
    expect(container.textContent).toContain(parentSelectHint(0));
    const access = rpcInvocations().filter((c) => c.name === "campaigns_i_can_write");
    expect(access).toHaveLength(1);
    expect(access[0].args).toEqual({ p_campaign_ids: [9, 12] });

    expect(trigger().disabled).toBe(false);
    await click(trigger());
    expect(optionLabels()).toEqual(["None", "ROV sector wide"]);
    const option = [...document.body.querySelectorAll('[role="option"]')].find(
      (o) => (o.textContent ?? "").trim() === "ROV sector wide"
    );
    if (!option) throw new Error("No ROV option");
    await click(option);
    expect(onChange).toHaveBeenCalledWith("9");
    expect(trigger().textContent).toContain("ROV sector wide");
  });

  it("keeps a non-writable current parent selectable (D22)", async () => {
    initialValue = "9";
    answerRpc("campaigns_i_can_write", { data: [12], error: null });
    mounted = await mountWallChart({ Component: Wrapper, fixture: buildFixture() });
    expect(trigger().textContent).toContain("ROV sector wide");
    await click(trigger());
    expect(optionLabels()).toEqual(["None", "ROV sector wide", "Not mine"]);
  });

  it("is disabled with the reason when the campaign has children", async () => {
    answerRpc("campaigns_i_can_write", { data: [9], error: null });
    mounted = await mountWallChart({ Component: Wrapper, fixture: buildFixture({ children: true }) });
    expect(trigger().disabled).toBe(true);
    expect(mounted.container.textContent).toContain(
      "This campaign has 2 child campaigns, so it cannot be part of another campaign."
    );
    expect(parentSelectHint(1)).toBe(
      "This campaign has 1 child campaign, so it cannot be part of another campaign."
    );
  });
});
