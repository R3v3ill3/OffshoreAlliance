/**
 * WP3.8 pure-module tests (docs/organiser-ux-review/wp/wp3.8.md §4.1):
 * `familyActivityFilter` exact strings with and without a parent, string ids,
 * rejection of non-integers; `isFamilyActivity` true only for
 * `campaign_id === parentId && scope === 'family'` and never when the campaign
 * is its own parent; `isOwnedActivity`; `partitionFamilyActivities` (owned
 * first, family second, sibling's and grandparent's rows dropped, order
 * preserved, a `campaign`-scoped row of the parent excluded); the two labels;
 * `familyErrorMessage` for each `campaign_family_*` code and the pass-through.
 * Node only, no database.
 */

import { describe, expect, it } from "vitest";

import {
  FAMILY_ERROR_MESSAGES,
  familyActivityFilter,
  familyErrorMessage,
  familyLabel,
  isFamilyActivity,
  isOwnedActivity,
  partitionFamilyActivities,
  sharedWithLabel,
  type FamilyActivityLike,
} from "../families";

const act = (activity_id: number, campaign_id: number, scope?: string | null): FamilyActivityLike =>
  scope === undefined ? { activity_id, campaign_id } : { activity_id, campaign_id, scope };

describe("familyActivityFilter (wp3.8.md §3.5)", () => {
  it("is the plain owned clause without a parent", () => {
    expect(familyActivityFilter(61, null)).toBe("campaign_id.eq.61");
    expect(familyActivityFilter(61, undefined)).toBe("campaign_id.eq.61");
    expect(familyActivityFilter("61", "")).toBe("campaign_id.eq.61");
  });

  it("adds the parent's family arm with a parent", () => {
    expect(familyActivityFilter(61, 64)).toBe("campaign_id.eq.61,and(campaign_id.eq.64,scope.eq.family)");
  });

  it("accepts string ids and normalises them", () => {
    expect(familyActivityFilter("61", "64")).toBe("campaign_id.eq.61,and(campaign_id.eq.64,scope.eq.family)");
    expect(familyActivityFilter(" 61 ", 64)).toBe("campaign_id.eq.61,and(campaign_id.eq.64,scope.eq.family)");
  });

  it("treats a parent equal to the campaign as no parent", () => {
    expect(familyActivityFilter(61, 61)).toBe("campaign_id.eq.61");
  });

  it("throws on a non-integer id (the clause is interpolated into a query string)", () => {
    expect(() => familyActivityFilter("61; drop", 64)).toThrow(/campaignId/u);
    expect(() => familyActivityFilter(61.5, 64)).toThrow(/campaignId/u);
    expect(() => familyActivityFilter(0, 64)).toThrow(/campaignId/u);
    expect(() => familyActivityFilter(-1, 64)).toThrow(/campaignId/u);
    expect(() => familyActivityFilter(Number.NaN, 64)).toThrow(/campaignId/u);
    expect(() => familyActivityFilter(61, "64 or 1=1")).toThrow(/parentId/u);
    expect(() => familyActivityFilter(61, 64.2)).toThrow(/parentId/u);
    expect(() => familyActivityFilter(61, 0)).toThrow(/parentId/u);
    expect(() => familyActivityFilter("", 64)).toThrow(/campaignId/u);
  });
});

describe("isOwnedActivity / isFamilyActivity", () => {
  it("owned: the activity's campaign is this campaign, whatever its scope", () => {
    expect(isOwnedActivity(act(1, 61), 61)).toBe(true);
    expect(isOwnedActivity(act(1, 61, "family"), "61")).toBe(true);
    expect(isOwnedActivity(act(1, 64), 61)).toBe(false);
    expect(isOwnedActivity(act(1, 61), "x")).toBe(false);
  });

  it("family: only the parent's row with scope = family", () => {
    expect(isFamilyActivity(act(88, 64, "family"), 61, 64)).toBe(true);
    expect(isFamilyActivity(act(88, 64, "family"), "61", "64")).toBe(true);
    expect(isFamilyActivity(act(93, 64, "campaign"), 61, 64)).toBe(false);
    expect(isFamilyActivity(act(93, 64), 61, 64)).toBe(false);
    expect(isFamilyActivity(act(93, 64, null), 61, 64)).toBe(false);
    expect(isFamilyActivity(act(5, 62, "family"), 61, 64)).toBe(false); // a sibling's
    expect(isFamilyActivity(act(5, 61, "family"), 61, 64)).toBe(false); // owned, not family
  });

  it("family: never without a parent, and never when the campaign is its own parent", () => {
    expect(isFamilyActivity(act(88, 64, "family"), 61, null)).toBe(false);
    expect(isFamilyActivity(act(88, 64, "family"), 61, undefined)).toBe(false);
    expect(isFamilyActivity(act(88, 61, "family"), 61, 61)).toBe(false);
  });
});

describe("partitionFamilyActivities", () => {
  const rows = [
    act(88, 64, "family"),
    act(10, 61, "campaign"),
    act(93, 64, "campaign"), // the parent's unshared row
    act(11, 61, "family"), // owned rows keep their place whatever the scope
    act(7, 62, "family"), // a sibling's family row
    act(89, 64, "family"),
    act(3, 99, "family"), // a grandparent's row
    act(12, 61),
  ];

  it("owned first, then family, both in input order; everything else dropped", () => {
    const { owned, family } = partitionFamilyActivities(rows, 61, 64);
    expect(owned.map((r) => r.activity_id)).toEqual([10, 11, 12]);
    expect(family.map((r) => r.activity_id)).toEqual([88, 89]);
  });

  it("without a parent only the owned rows survive", () => {
    const { owned, family } = partitionFamilyActivities(rows, 61, null);
    expect(owned.map((r) => r.activity_id)).toEqual([10, 11, 12]);
    expect(family).toEqual([]);
  });

  it("in the parent, its own rows are owned and nothing is family", () => {
    const { owned, family } = partitionFamilyActivities(rows, 64, null);
    expect(owned.map((r) => r.activity_id)).toEqual([88, 93, 89]);
    expect(family).toEqual([]);
  });

  it("returns the same objects (no copies) and accepts string ids", () => {
    const { owned, family } = partitionFamilyActivities(rows, "61", "64");
    expect(owned[0]).toBe(rows[1]);
    expect(family[0]).toBe(rows[0]);
  });
});

describe("labels (wp3.8.md §3.7 terminology)", () => {
  it("familyLabel names the parent or falls back", () => {
    expect(familyLabel("Fugro")).toBe("Shared from Fugro");
    expect(familyLabel("  ROV sector wide ")).toBe("Shared from ROV sector wide");
    expect(familyLabel("")).toBe("Shared from parent campaign");
    expect(familyLabel("   ")).toBe("Shared from parent campaign");
    expect(familyLabel(null)).toBe("Shared from parent campaign");
    expect(familyLabel(undefined)).toBe("Shared from parent campaign");
  });

  it("sharedWithLabel is singular for one and plural otherwise", () => {
    expect(sharedWithLabel(1)).toBe("Shared with 1 campaign");
    expect(sharedWithLabel(3)).toBe("Shared with 3 campaigns");
    expect(sharedWithLabel(0)).toBe("Shared with 0 campaigns");
    expect(sharedWithLabel(-2)).toBe("Shared with 0 campaigns");
    expect(sharedWithLabel(Number.NaN)).toBe("Shared with 0 campaigns");
  });
});

describe("familyErrorMessage", () => {
  it.each(Object.keys(FAMILY_ERROR_MESSAGES))("maps %s (as PostgREST reports it in message) to its sentence", (token) => {
    expect(familyErrorMessage("23514", token)).toBe(FAMILY_ERROR_MESSAGES[token]);
    expect(familyErrorMessage(null, `${token}`)).toBe(FAMILY_ERROR_MESSAGES[token]);
  });

  it("names every trigger exception exactly once", () => {
    expect(Object.keys(FAMILY_ERROR_MESSAGES).sort()).toEqual(
      [
        "campaign_family_child_has_children",
        "campaign_family_child_kind",
        "campaign_family_parent_has_parent",
        "campaign_family_parent_kind",
        "campaign_family_parent_not_writable",
        "campaign_family_self",
      ].sort()
    );
  });

  it("maps SET-a's 42501 through its token, and the CHECK's 23514 self refusal", () => {
    expect(familyErrorMessage("42501", "campaign_family_parent_not_writable")).toBe(
      FAMILY_ERROR_MESSAGES.campaign_family_parent_not_writable
    );
    expect(
      familyErrorMessage("23514", 'new row for relation "campaigns" violates check constraint "campaigns_parent_not_self"')
    ).toBe(FAMILY_ERROR_MESSAGES.campaign_family_self);
  });

  it("passes any other message through unchanged", () => {
    expect(familyErrorMessage("42501", "permission denied for table campaigns")).toBe("permission denied for table campaigns");
    expect(familyErrorMessage(undefined, "Network error")).toBe("Network error");
    expect(familyErrorMessage("23503", "campaign_familiar_thing")).toBe("campaign_familiar_thing");
    expect(familyErrorMessage(null, "")).toBe("");
  });
});
