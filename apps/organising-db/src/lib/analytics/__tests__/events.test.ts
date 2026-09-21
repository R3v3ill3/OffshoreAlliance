import { describe, expect, it } from "vitest";

import {
  buildAssessmentScopeChangedProps,
  buildCampaignParentSetProps,
  buildCampaignTabOpenedProps,
  buildFamilyAssessmentRatedProps,
  buildWallchartFilterAppliedProps,
  buildWallchartFirstInteractionProps,
  buildWallchartGroupSelectedProps,
  tabOpenKey,
} from "../events";

describe("buildCampaignTabOpenedProps", () => {
  it("carries exactly campaign_id, tab and sub", () => {
    expect(
      buildCampaignTabOpenedProps({ campaign_id: 12, tab: "workforce", sub: "wall-chart" })
    ).toEqual({ campaign_id: 12, tab: "workforce", sub: "wall-chart" });
  });

  it("normalises a missing sub to null", () => {
    expect(buildCampaignTabOpenedProps({ campaign_id: 12, tab: "overview" })).toEqual({
      campaign_id: 12,
      tab: "overview",
      sub: null,
    });
    expect(
      buildCampaignTabOpenedProps({ campaign_id: 12, tab: "overview", sub: undefined }).sub
    ).toBeNull();
  });
});

describe("tabOpenKey", () => {
  it("distinguishes campaign, tab and sub", () => {
    expect(tabOpenKey(12, "workforce", "wall-chart")).toBe("12|workforce|wall-chart");
    expect(tabOpenKey(12, "workforce", "wall-chart")).not.toBe(
      tabOpenKey(13, "workforce", "wall-chart")
    );
    expect(tabOpenKey(12, "workforce", "wall-chart")).not.toBe(
      tabOpenKey(12, "overview", "wall-chart")
    );
    expect(tabOpenKey(12, "workforce", "wall-chart")).not.toBe(
      tabOpenKey(12, "workforce", "list")
    );
  });

  it("treats a null and an undefined sub as the same key", () => {
    // The campaign page reads ?sub= as `string | null` but the resolver can
    // hand back `undefined`; both mean "no sub", so both must de-duplicate.
    expect(tabOpenKey(12, "overview", null)).toBe(tabOpenKey(12, "overview", undefined));
    expect(tabOpenKey(12, "overview", null)).not.toBe(tabOpenKey(12, "overview", "wall-chart"));
  });
});

describe("buildWallchartGroupSelectedProps", () => {
  it("keeps both the new and previous group, and the group count", () => {
    expect(
      buildWallchartGroupSelectedProps({
        campaign_id: 3,
        ou_type: "vessel",
        previous_ou_type: "department",
        group_count: 4,
        control: "assessment_charts_ou_type",
      })
    ).toEqual({
      campaign_id: 3,
      ou_type: "vessel",
      previous_ou_type: "department",
      group_count: 4,
      control: "assessment_charts_ou_type",
    });
  });

  it("allows a null group on either side", () => {
    const props = buildWallchartGroupSelectedProps({
      campaign_id: 3,
      ou_type: null,
      previous_ou_type: null,
      group_count: 0,
      control: "assessment_charts_ou_type",
    });
    expect(props.ou_type).toBeNull();
    expect(props.previous_ou_type).toBeNull();
  });
});

describe("buildWallchartFilterAppliedProps", () => {
  it("derives filter_count from filter_keys", () => {
    const props = buildWallchartFilterAppliedProps({
      campaign_id: 9,
      scope: "unit",
      filter_keys: ["roles", "ratings"],
      sort_key: "last_name",
    });
    expect(props.filter_keys).toEqual(["roles", "ratings"]);
    expect(props.filter_count).toBe(props.filter_keys.length);
  });

  it("reports zero for a cleared filter", () => {
    const props = buildWallchartFilterAppliedProps({
      campaign_id: 9,
      scope: "all",
      filter_keys: [],
      sort_key: "cumulative_desc",
    });
    expect(props.filter_count).toBe(0);
  });

  it("copies the key list so later mutation cannot change a sent event", () => {
    const keys = ["roles"];
    const props = buildWallchartFilterAppliedProps({
      campaign_id: 9,
      scope: "unassigned",
      filter_keys: keys,
      sort_key: "last_name",
    });
    keys.push("ratings");
    expect(props.filter_keys).toEqual(["roles"]);
  });
});

describe("buildWallchartFirstInteractionProps", () => {
  it("carries the timing, interaction and login source — and no worker id", () => {
    const props = buildWallchartFirstInteractionProps({
      campaign_id: 5,
      ms_since_login: 8_000,
      interaction: "tile_click",
      login_source: "login_form",
    });
    expect(props).toEqual({
      campaign_id: 5,
      ms_since_login: 8_000,
      interaction: "tile_click",
      login_source: "login_form",
    });
    expect(Object.keys(props)).not.toContain("worker_id");
  });
});

describe("WP3.8 campaign-family builders", () => {
  it("campaign_parent_set carries the campaign, the new parent and the previous parent (null allowed)", () => {
    expect(
      buildCampaignParentSetProps({ campaign_id: 61, parent_id: 64, previous_parent_id: null })
    ).toEqual({ campaign_id: 61, parent_id: 64, previous_parent_id: null });
    expect(
      buildCampaignParentSetProps({ campaign_id: 61, parent_id: null, previous_parent_id: 64 })
    ).toEqual({ campaign_id: 61, parent_id: null, previous_parent_id: 64 });
  });

  it("assessment_scope_changed carries ids, the closed scope union and the child count", () => {
    expect(
      buildAssessmentScopeChangedProps({
        campaign_id: 64,
        activity_id: 88,
        scope: "family",
        child_count: 3,
      })
    ).toEqual({ campaign_id: 64, activity_id: 88, scope: "family", child_count: 3 });
  });

  it("family_assessment_rated carries campaign, parent and activity ids — and no worker id", () => {
    const props = buildFamilyAssessmentRatedProps({ campaign_id: 61, parent_id: 64, activity_id: 88 });
    expect(props).toEqual({ campaign_id: 61, parent_id: 64, activity_id: 88 });
    expect(Object.keys(props)).not.toContain("worker_id");
  });
});

/**
 * The privacy rule from the header of `events.ts`, as an executable assertion.
 * Every property of every event this module can emit must be an id, an enum, a
 * count or a duration — never anything that could carry a person's identity.
 */
describe("privacy rule: no personal-data property keys", () => {
  const FORBIDDEN = /name|email|phone|address|note/i;

  const payloads: Record<string, Record<string, unknown>> = {
    campaign_tab_opened: buildCampaignTabOpenedProps({
      campaign_id: 1,
      tab: "workforce",
      sub: "wall-chart",
    }),
    wallchart_group_selected: buildWallchartGroupSelectedProps({
      campaign_id: 1,
      ou_type: "vessel",
      previous_ou_type: null,
      group_count: 2,
      control: "assessment_charts_ou_type",
    }),
    wallchart_filter_applied: buildWallchartFilterAppliedProps({
      campaign_id: 1,
      scope: "unit",
      // Includes the "phone"/"email" dimension names deliberately: they are
      // filter *values*, and the rule constrains property *keys*.
      filter_keys: ["membership", "roles", "phone", "email", "occupations"],
      sort_key: "last_name",
    }),
    wallchart_first_interaction: buildWallchartFirstInteractionProps({
      campaign_id: 1,
      ms_since_login: 1_000,
      interaction: "drag",
      login_source: "login_form",
    }),
    // WP3.8: the three campaign-family events.
    campaign_parent_set: buildCampaignParentSetProps({
      campaign_id: 1,
      parent_id: 9,
      previous_parent_id: null,
    }),
    assessment_scope_changed: buildAssessmentScopeChangedProps({
      campaign_id: 9,
      activity_id: 501,
      scope: "family",
      child_count: 1,
    }),
    family_assessment_rated: buildFamilyAssessmentRatedProps({
      campaign_id: 1,
      parent_id: 9,
      activity_id: 501,
    }),
  };

  it.each(Object.entries(payloads))("%s has no personal-data keys", (_event, props) => {
    const offending = Object.keys(props).filter((key) => FORBIDDEN.test(key));
    expect(offending).toEqual([]);
  });

  // The `surface` property that track() adds is a literal in events.ts, not a
  // builder output. Asserting FORBIDDEN.test("surface") here would only test
  // the regex literal against another literal, so it is deliberately absent:
  // every assertion in this block runs over a real builder payload.
});
