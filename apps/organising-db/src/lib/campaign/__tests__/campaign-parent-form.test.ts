/**
 * WP3.8 follow-up (wp3.8.md D41) — the "Part of" save rules shared by the
 * Basics sheet and the Settings page: the column joins an update payload
 * only when it changed (F1/D32), a `campaign_family_*` refusal reads as its
 * sentence, and the after-save hook invalidates and emits only on a change.
 * Node only; posthog is never reached (telemetry no-ops without `window`).
 */

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  NO_PARENT_VALUE,
  afterCampaignParentSaved,
  applyParentChange,
  campaignSaveError,
  currentParentIdOf,
  resolveParentChange,
} from "../campaign-parent-form";

describe("currentParentIdOf", () => {
  it("reads the row's parent, normalising strings and treating null/undefined/blank/0 as none", () => {
    expect(currentParentIdOf({ parent_campaign_id: 64 })).toBe(64);
    expect(currentParentIdOf({ parent_campaign_id: "64" })).toBe(64);
    expect(currentParentIdOf({ parent_campaign_id: null })).toBeNull();
    expect(currentParentIdOf({})).toBeNull();
    expect(currentParentIdOf(null)).toBeNull();
    expect(currentParentIdOf({ parent_campaign_id: "" })).toBeNull();
    expect(currentParentIdOf({ parent_campaign_id: 0 })).toBeNull();
  });
});

describe("resolveParentChange / applyParentChange (F1/D32)", () => {
  it("an unchanged parent is not a change and stays out of the payload", () => {
    expect(resolveParentChange("64", 64)).toEqual({ nextParentId: 64, changed: false });
    expect(resolveParentChange("", null)).toEqual({ nextParentId: null, changed: false });
    const payload: Record<string, unknown> = { name: "Fugro" };
    applyParentChange(payload, "64", 64);
    expect(Object.keys(payload)).toEqual(["name"]);
  });

  it("setting, changing and clearing a parent are changes and go into the payload", () => {
    expect(resolveParentChange("64", null)).toEqual({ nextParentId: 64, changed: true });
    expect(resolveParentChange("65", 64)).toEqual({ nextParentId: 65, changed: true });
    expect(resolveParentChange("", 64)).toEqual({ nextParentId: null, changed: true });
    const set: Record<string, unknown> = {};
    expect(applyParentChange(set, "64", null)).toEqual({ nextParentId: 64, changed: true });
    expect(set).toEqual({ parent_campaign_id: 64 });
    const cleared: Record<string, unknown> = {};
    applyParentChange(cleared, "", 64);
    expect(cleared).toEqual({ parent_campaign_id: null });
  });

  it("the select's none value and unusable strings read as none", () => {
    expect(resolveParentChange(NO_PARENT_VALUE, 64)).toEqual({ nextParentId: null, changed: true });
    expect(resolveParentChange(undefined, null).nextParentId).toBeNull();
    expect(resolveParentChange("abc", null)).toEqual({ nextParentId: null, changed: false });
    expect(resolveParentChange(" 64 ", 64).changed).toBe(false);
  });
});

describe("campaignSaveError", () => {
  it("maps a campaign_family_* refusal to its sentence and passes anything else through", () => {
    expect(
      campaignSaveError({ code: "23514", message: "campaign_family_parent_has_parent" }).message
    ).toBe("The chosen parent is itself part of a campaign (one level).");
    expect(campaignSaveError({ code: "42501", message: "campaign_family_parent_not_writable" }).message).toBe(
      "You need write access to the parent campaign to make this campaign part of it."
    );
    expect(campaignSaveError({ code: "23505", message: "duplicate key" }).message).toBe("duplicate key");
    expect(campaignSaveError({ message: "boom" })).toBeInstanceOf(Error);
  });
});

describe("afterCampaignParentSaved", () => {
  it("does nothing when the parent did not change", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    afterCampaignParentSaved(client, 61, 64, 64);
    afterCampaignParentSaved(client, 61, null, null);
    expect(spy).not.toHaveBeenCalled();
  });

  it("invalidates the family readers when the parent changed", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    afterCampaignParentSaved(client, 61, null, 64);
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      ["campaign-parent", 61],
      ["campaign-children"],
      ["campaign-parent-candidates"],
      ["campaign-activities-family", "61"],
      ["campaign-assessments-rated", "61"],
    ]);
  });
});
