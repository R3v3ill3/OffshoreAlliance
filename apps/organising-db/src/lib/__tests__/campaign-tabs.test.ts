import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMPAIGN_SUB,
  DEFAULT_CAMPAIGN_TAB,
  DEFAULT_SUB,
  REDIRECT_MAP,
  VALID_TABS,
  needsRedirect,
  resolveTabParams,
  type ValidTab,
} from "../campaign-tabs";

describe("campaign-tabs — the campaign default landing tab", () => {
  it("resolves a bare URL to the wall chart", () => {
    expect(resolveTabParams(null, null)).toEqual({
      tab: "workforce",
      sub: "wall-chart",
    });
  });

  it("states the default as constants", () => {
    expect(DEFAULT_CAMPAIGN_TAB).toBe("workforce");
    expect(DEFAULT_CAMPAIGN_SUB).toBe("wall-chart");
  });

  it("keeps the two default sources from drifting apart", () => {
    expect(DEFAULT_SUB[DEFAULT_CAMPAIGN_TAB as ValidTab]).toBe(
      DEFAULT_CAMPAIGN_SUB
    );
  });

  it("honours an explicit ?sub= even when ?tab= is absent", () => {
    expect(resolveTabParams(null, "assessments")).toEqual({
      tab: "workforce",
      sub: "assessments",
    });
  });
});

describe("campaign-tabs — Overview stays reachable", () => {
  it("opens Overview when it is asked for explicitly", () => {
    expect(resolveTabParams("overview", null)).toEqual({
      tab: "overview",
      sub: null,
    });
  });

  it("does not bounce an explicit Overview URL", () => {
    expect(
      needsRedirect("overview", null, resolveTabParams("overview", null))
    ).toBe(false);
  });
});

describe("campaign-tabs — the bare-URL bounce", () => {
  it("bounces a bare URL once", () => {
    expect(needsRedirect(null, null, resolveTabParams(null, null))).toBe(true);
  });

  it("is idempotent, so it cannot loop", () => {
    const first = resolveTabParams(null, null);
    const second = resolveTabParams(first.tab, first.sub);
    expect(second).toEqual(first);
    expect(needsRedirect(first.tab, first.sub, second)).toBe(false);
  });

  it("treats the list-row URL as a no-op", () => {
    const resolved = resolveTabParams("workforce", "wall-chart");
    expect(resolved).toEqual({ tab: "workforce", sub: "wall-chart" });
    expect(needsRedirect("workforce", "wall-chart", resolved)).toBe(false);
  });
});

describe("campaign-tabs — the legacy registry is unchanged", () => {
  it("still redirects legacy tab values", () => {
    expect(resolveTabParams("wall", null)).toEqual({
      tab: "workforce",
      sub: "wall-chart",
    });
    expect(resolveTabParams("universe", null)).toEqual({
      tab: "workforce",
      sub: "universe",
    });
    expect(resolveTabParams("workplan", null)).toEqual({
      tab: "plan",
      sub: "workplan",
    });
  });

  it("honours an explicit sub after a legacy tab redirect", () => {
    expect(resolveTabParams("universe", "assessments")).toEqual({
      tab: "workforce",
      sub: "assessments",
    });
  });

  it("gives non-cluster tabs no sub", () => {
    expect(resolveTabParams("bargaining", null)).toEqual({
      tab: "bargaining",
      sub: null,
    });
  });

  it("points every redirect target at a valid tab", () => {
    const validTabs = VALID_TABS as readonly string[];
    for (const [legacy, target] of Object.entries(REDIRECT_MAP)) {
      expect(
        validTabs.includes(target.tab),
        `REDIRECT_MAP["${legacy}"] targets unknown tab "${target.tab}"`
      ).toBe(true);
    }
  });
});
