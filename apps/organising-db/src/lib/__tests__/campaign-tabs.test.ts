import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_TAB_REGISTRY,
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

  // WP1.4. Workspace mode is presentation, never permission: the resolver
  // that decides which tab BAR to draw takes no part in deciding what a URL
  // means. These two assertions are the structural half of that promise —
  // the behavioural half (every pair reachable in both modes) is in
  // src/lib/campaign/__tests__/workspace-tabs.test.ts.
  it("takes the URL and nothing else — no mode parameter", () => {
    expect(resolveTabParams.length).toBe(2);
    expect(needsRedirect.length).toBe(3);
  });

  it("lands every legacy key on a pair the registry actually holds", () => {
    for (const [legacy, target] of Object.entries(REDIRECT_MAP)) {
      const resolved = resolveTabParams(legacy, null);
      expect(resolved, legacy).toEqual({ tab: target.tab, sub: target.sub });
      const def = CAMPAIGN_TAB_REGISTRY.find((t) => t.tab === resolved.tab);
      expect(def, `REDIRECT_MAP["${legacy}"] targets unregistered tab`).toBeDefined();
      expect(
        def?.subs.some((s) => s.sub === resolved.sub),
        `REDIRECT_MAP["${legacy}"] targets unregistered sub "${resolved.sub}"`
      ).toBe(true);
      // Idempotent: following the redirect does not trigger another one.
      expect(needsRedirect(resolved.tab, resolved.sub, resolveTabParams(resolved.tab, resolved.sub))).toBe(
        false
      );
    }
  });
});

describe("CAMPAIGN_TAB_REGISTRY — it is the URL contract, spelled out", () => {
  it("has the eight tabs and twenty-one sub-tabs, and only the bargaining phase gate", () => {
    expect(CAMPAIGN_TAB_REGISTRY).toHaveLength(8);
    expect(CAMPAIGN_TAB_REGISTRY.flatMap((t) => t.subs)).toHaveLength(21);
    expect(
      CAMPAIGN_TAB_REGISTRY.filter((t) => t.requiresPhase != null).map((t) => t.tab)
    ).toEqual(["bargaining"]);
  });

  it("names only tabs VALID_TABS already knows, with unique subs", () => {
    const validTabs = VALID_TABS as readonly string[];
    for (const tab of CAMPAIGN_TAB_REGISTRY) {
      expect(validTabs.includes(tab.tab), tab.tab).toBe(true);
      const subs = tab.subs.map((s) => s.sub);
      expect(new Set(subs).size, `${tab.tab} has a duplicate sub`).toBe(subs.length);
    }
    const tabs = CAMPAIGN_TAB_REGISTRY.map((t) => t.tab);
    expect(new Set(tabs).size).toBe(tabs.length);
  });

  it("gives every surface a non-empty label", () => {
    for (const tab of CAMPAIGN_TAB_REGISTRY) {
      expect(tab.label.length, tab.tab).toBeGreaterThan(0);
      for (const sub of tab.subs) {
        expect(sub.label.length, `${tab.tab}/${sub.sub}`).toBeGreaterThan(0);
      }
    }
  });
});
