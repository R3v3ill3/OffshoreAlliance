import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_TAB_REGISTRY,
  DEFAULT_CAMPAIGN_SUB,
  DEFAULT_CAMPAIGN_TAB,
  DEFAULT_SUB,
  REDIRECT_MAP,
  resolveTabParams,
  type ValidTab,
} from "@/lib/campaign-tabs";
import {
  MODULE_IDS,
  ORGANISER_DEFAULT_MODULE_IDS,
  type WorkspaceModuleId,
} from "@/lib/workspace/modules";
import { moduleStateFor, type ModuleState } from "@/lib/workspace/resolve";
import {
  ORGANISER_TAB_IDS,
  ORGANISER_TAB_LABELS,
  activeOrganiserTabId,
  findSurface,
  moduleForSurface,
  resolveVisibleTabs,
  type CampaignNavModel,
  type ResolveVisibleTabsInput,
} from "../workspace-tabs";
import {
  APPENDIX_D_COUNT,
  CAMPAIGN_SURFACES,
  surfaceOf,
} from "./campaign-surfaces.fixture";
import {
  BARGAINING_PHASE,
  FULL_MODE_SUBS,
  FULL_MODE_TABS,
  PHASE_GATED_TAB,
} from "./campaign-tabs-full-mode.fixture";
import {
  CAMPAIGN_HEADER_ACTIONS,
  ORGANISER_ACTION_DESTINATIONS,
} from "./campaign-header-actions.fixture";

// ── shared inputs ───────────────────────────────────────────────────────

const ALL_NON_ADMIN: ReadonlySet<WorkspaceModuleId> = new Set(
  MODULE_IDS.filter((id) => id !== "administration")
);

const stateFrom =
  (on: ReadonlySet<WorkspaceModuleId>) =>
  (id: WorkspaceModuleId): ModuleState =>
    moduleStateFor(on, id);

const BASE: ResolveVisibleTabsInput = {
  mode: "organiser",
  moduleState: stateFrom(ORGANISER_DEFAULT_MODULE_IDS),
  phase: BARGAINING_PHASE,
  hasPlan: true,
  active: { tab: DEFAULT_CAMPAIGN_TAB, sub: DEFAULT_CAMPAIGN_SUB },
  activeView: "wall-chart",
};

const model = (over: Partial<ResolveVisibleTabsInput> = {}): CampaignNavModel =>
  resolveVisibleTabs({ ...BASE, ...over });

/** Every fixture row, resolved to the (tab, sub) pair it is reached through. */
function unreachable(m: CampaignNavModel): string[] {
  return CAMPAIGN_SURFACES.filter((row) => findSurface(m, surfaceOf(row)) === null).map(
    (row) => `${row.id} (${row.label})`
  );
}

// ── T1/T2 — full mode is today's structure ──────────────────────────────

describe("resolveVisibleTabs — full mode is today's campaign page", () => {
  it("T1 — the eight tabs and twenty sub-tabs, in render order", () => {
    const m = model({ mode: "full" });

    expect(m.tabs.map((t) => t.id)).toEqual(FULL_MODE_TABS.map((t) => t.tab));
    expect(m.tabs.map((t) => t.label)).toEqual(FULL_MODE_TABS.map((t) => t.label));
    expect(m.tabs.flatMap((t) => t.subs.map((s) => s.id))).toEqual(
      FULL_MODE_SUBS.map((s) => s.sub)
    );
    expect(m.tabs.flatMap((t) => t.subs.map((s) => s.label))).toEqual(
      FULL_MODE_SUBS.map((s) => s.label)
    );

    // The fixture and the appendix inventory agree about levels 1 and 2.
    expect(m.tabs.map((t) => t.id)).toEqual(
      CAMPAIGN_SURFACES.filter((r) => r.level === 1).map((r) => r.tab)
    );
    expect(m.tabs.flatMap((t) => t.subs.map((s) => s.id))).toEqual(
      CAMPAIGN_SURFACES.filter((r) => r.level === 2).map((r) => r.sub)
    );

    // Full mode consults no module state and offers no overflow.
    expect(m.tabs.every((t) => t.state === "on")).toBe(true);
    expect(m.tabs.flatMap((t) => t.subs).every((s) => s.state === "on")).toBe(true);
    expect(m.more).toEqual([]);

    expect(m).toMatchSnapshot();
  });

  it("T2 — without the bargaining phase there are seven tabs and still no More", () => {
    const m = model({ mode: "full", phase: "preparing_to_bargain" });
    expect(m.tabs.map((t) => t.id)).toEqual(
      FULL_MODE_TABS.filter((t) => t.tab !== PHASE_GATED_TAB).map((t) => t.tab)
    );
    expect(m.more).toEqual([]);
    expect(m).toMatchSnapshot();
  });

  it("T2b — the phase gate is mode-independent", () => {
    const organiser = model({ phase: null });
    expect(organiser.more.map((t) => t.id)).not.toContain(PHASE_GATED_TAB);
    expect(model({ phase: BARGAINING_PHASE }).more.map((t) => t.id)).toContain(
      PHASE_GATED_TAB
    );
  });

  it("full mode reports the active pair straight through", () => {
    const m = model({ mode: "full", active: { tab: "outreach", sub: "sms" } });
    expect(m.activeTabId).toBe("outreach");
    expect(m.activeSubId).toBe("sms");
    expect(m.activeMoreLabel).toBeNull();
  });
});

// ── T3/T4 — organiser mode, default modules ─────────────────────────────

describe("resolveVisibleTabs — organiser mode", () => {
  it("T3 — every one of the 45 surfaces is reachable with the default modules", () => {
    expect(unreachable(model())).toEqual([]);
  });

  it("T4 — the coverage census: which surfaces are primary, sub-items or behind More", () => {
    const m = model();
    const census: Record<string, string[]> = {};
    for (const row of CAMPAIGN_SURFACES) {
      const route = findSurface(m, surfaceOf(row));
      const via = route ? route.via : "unreachable";
      (census[via] ??= []).push(row.id);
    }
    expect(census).toMatchSnapshot();
  });

  it("V3 — the four tabs, in plan 5.4's order, labelled from one constant", () => {
    const m = model();
    expect(m.tabs.map((t) => t.id)).toEqual([...ORGANISER_TAB_IDS]);
    expect(m.tabs[0].label).toBe(ORGANISER_TAB_LABELS.wall_chart);
    expect(m.tabs[1].label).toBe(ORGANISER_TAB_LABELS.people);
    expect(m.tabs[2].label).toBe(ORGANISER_TAB_LABELS.activity);
    expect(m.tabs[3].label).toBe(ORGANISER_TAB_LABELS.setup);
  });

  it("T9 — the label constant has exactly five keys", () => {
    expect(Object.keys(ORGANISER_TAB_LABELS).sort()).toEqual([
      "activity",
      "more",
      "people",
      "setup",
      "wall_chart",
    ]);
  });

  it("V5 — the four tabs' modules are all plan-5.2 organiser defaults, so all are on", () => {
    const m = model();
    for (const tab of m.tabs) {
      expect(ORGANISER_DEFAULT_MODULE_IDS.has(tab.module), tab.id).toBe(true);
      expect(tab.state).toBe("on");
    }
  });

  it("V6 — More holds the fourteen registry pairs the four tabs do not reach", () => {
    const m = model();
    const pairs = m.more.flatMap((t) =>
      t.subs.length === 0
        ? [`${t.href.tab}/${t.href.sub ?? ""}`]
        : t.subs.map((s) => `${s.href.tab}/${s.href.sub ?? ""}`)
    );
    expect(pairs).toEqual([
      "overview/",
      "plan/strategy",
      "plan/workplan",
      "plan/pending-review",
      "plan/role-check",
      "section-plans/",
      "workforce/data-fields",
      "workforce/activists",
      "workforce/foundational-readiness",
      "outcomes/reports",
      "outcomes/results",
      "outcomes/insights",
      "library/",
      "bargaining/",
    ]);
  });

  it("V4 — a tab's state is its module's state, never re-derived", () => {
    const off = new Set(ORGANISER_DEFAULT_MODULE_IDS);
    off.delete("setup");
    const m = model({ moduleState: stateFrom(off) });
    const setup = m.tabs.find((t) => t.id === "setup");
    // `setup.offState` is "muted", so the tab stays, muted, and navigable.
    expect(setup?.state).toBe("muted");
    expect(m.tabs).toHaveLength(4);
    expect(findSurface(m, { tab: "workforce", sub: "universe" })).not.toBeNull();
  });

  it("V8 — an unknown pair is not an error", () => {
    const m = model({ active: { tab: "nope", sub: "also-nope" } });
    expect(m.activeTabId).toBeNull();
    expect(m.activeSubId).toBeNull();
    expect(m.activeMoreLabel).toBeNull();
    expect(m.tabs).toHaveLength(4);
  });

  it("V7 — a surface behind More names itself on the More trigger", () => {
    const m = model({ active: { tab: "plan", sub: "pending-review" } });
    expect(m.activeTabId).toBeNull();
    expect(m.activeMoreLabel).toBe("Pending review");
    // …and it is still listed, so the user can get back to it.
    expect(findSurface(m, { tab: "plan", sub: "pending-review" })).toEqual({
      via: "more",
      tabId: "plan",
      subId: "pending-review",
    });
  });

  it("V7 — an Activity sub-item reports both ids", () => {
    const m = model({ active: { tab: "workforce", sub: "assessments" } });
    expect(m.activeTabId).toBe("activity");
    expect(m.activeSubId).toBe("assessments");
    expect(m.activeMoreLabel).toBeNull();
  });

  it("V9 — hasPlan changes no tab's state", () => {
    const withPlan = model({ hasPlan: true });
    const without = model({ hasPlan: false });
    expect(without.tabs).toEqual(withPlan.tabs);
    expect(without.more).toEqual(withPlan.more);
  });
});

// ── T5/T6 — modules off, and the way out ────────────────────────────────

describe("resolveVisibleTabs — Show everything is the answer to every off module", () => {
  it("T5 — with only the four defaults, every off surface is muted and still reachable expanded", () => {
    const m = model({ moduleState: stateFrom(ORGANISER_DEFAULT_MODULE_IDS) });
    const offSurfaces = m.more
      .flatMap((t) => (t.subs.length === 0 ? [t] : t.subs))
      .filter((entry) => !ORGANISER_DEFAULT_MODULE_IDS.has(entry.module));
    expect(offSurfaces.length).toBeGreaterThan(0);
    expect(offSurfaces.every((entry) => entry.state !== "on")).toBe(true);

    // "Show everything" is resolveWorkspace returning mode: "full".
    const expanded = model({ mode: "full" });
    expect(unreachable(expanded)).toEqual([]);
  });

  it("T6 — every module off is still four tabs and full reachability after expanding", () => {
    const nothing = stateFrom(new Set<WorkspaceModuleId>());
    const m = model({ moduleState: nothing });
    expect(m.tabs).toHaveLength(4);
    expect(unreachable(model({ mode: "full", moduleState: nothing }))).toEqual([]);
  });

  it("every non-admin module on is still the four-tab bar, with everything on in More", () => {
    const m = model({ moduleState: stateFrom(ALL_NON_ADMIN) });
    expect(m.tabs).toHaveLength(4);
    expect(m.more.flatMap((t) => (t.subs.length === 0 ? [t.state] : t.subs.map((s) => s.state)))
      .every((s) => s === "on")).toBe(true);
    expect(unreachable(m)).toEqual([]);
  });

  it("T6b — a hidden module is dropped from More rather than shown disabled", () => {
    const m = model({ moduleState: () => "hidden" });
    expect(m.more).toEqual([]);
    expect(m.tabs).toHaveLength(4);
    // …and the surface still renders on a deep link (§2.2): the model says so
    // by naming it on the More trigger.
    const deep = model({
      moduleState: () => "hidden",
      active: { tab: "outcomes", sub: "results" },
    });
    expect(deep.activeMoreLabel).toBe("Results");
  });
});

// ── T7 — URL compatibility, both modes ──────────────────────────────────

describe("URL compatibility — mode is presentation, never permission", () => {
  it("T7 — resolveTabParams takes the URL and nothing else", () => {
    expect(resolveTabParams.length).toBe(2);
  });

  it("T7 — every REDIRECT_MAP target is a registry pair, reachable in both modes", () => {
    for (const [legacy, target] of Object.entries(REDIRECT_MAP)) {
      const resolved = resolveTabParams(legacy, null);
      expect(resolved, legacy).toEqual({ tab: target.tab, sub: target.sub });
      expect(moduleForSurface(resolved.tab, resolved.sub), legacy).not.toBeNull();
      for (const mode of ["full", "organiser"] as const) {
        const m = model({ mode, active: resolved });
        expect(findSurface(m, resolved), `${legacy} in ${mode} mode`).not.toBeNull();
      }
    }
  });

  it("T7 — every registry pair is reachable in both modes", () => {
    for (const tab of CAMPAIGN_TAB_REGISTRY) {
      const pairs =
        tab.subs.length === 0
          ? [{ tab: tab.tab, sub: null as string | null }]
          : tab.subs.map((s) => ({ tab: tab.tab, sub: s.sub as string | null }));
      for (const pair of pairs) {
        for (const mode of ["full", "organiser"] as const) {
          const m = model({ mode, active: pair });
          expect(
            findSurface(m, pair),
            `${pair.tab}/${pair.sub ?? ""} in ${mode} mode`
          ).not.toBeNull();
        }
      }
    }
  });
});

// ── T8 — registry integrity ─────────────────────────────────────────────

describe("CAMPAIGN_TAB_REGISTRY — integrity", () => {
  it("carries the appendix D 3.2 inventory plus the one surface it undercounts", () => {
    expect(CAMPAIGN_SURFACES).toHaveLength(APPENDIX_D_COUNT + 1);
    expect(
      CAMPAIGN_SURFACES.filter((r) => r.appendix.startsWith("not counted")).map((r) => r.id)
    ).toEqual(["outreach/sms#relays"]);
  });

  it("T8 — every module id is a real workspace module", () => {
    const ids = new Set<string>(MODULE_IDS);
    for (const tab of CAMPAIGN_TAB_REGISTRY) {
      expect(ids.has(tab.module), tab.tab).toBe(true);
      for (const sub of tab.subs) {
        expect(ids.has(sub.module), `${tab.tab}/${sub.sub}`).toBe(true);
      }
    }
  });

  it("T8 — registry and fixture agree in both directions", () => {
    // Levels 1 and 2 name the same things from opposite ends: the registry
    // as code, the fixture as a hand transcription of appendix D 3.2.
    expect(CAMPAIGN_SURFACES.filter((r) => r.level === 1).map((r) => r.tab).sort()).toEqual(
      CAMPAIGN_TAB_REGISTRY.map((t) => t.tab).sort()
    );
    expect(
      CAMPAIGN_SURFACES.filter((r) => r.level === 2)
        .map((r) => `${r.tab}/${r.sub}`)
        .sort()
    ).toEqual(
      CAMPAIGN_TAB_REGISTRY.flatMap((t) => t.subs.map((s) => `${t.tab}/${s.sub}`)).sort()
    );
    // …and the labels agree too, so a rename has to be made twice.
    for (const row of CAMPAIGN_SURFACES.filter((r) => r.level <= 2)) {
      const def = CAMPAIGN_TAB_REGISTRY.find((t) => t.tab === row.tab);
      const label =
        row.sub === null ? def?.label : def?.subs.find((s) => s.sub === row.sub)?.label;
      expect(label, row.id).toBe(row.label);
    }
  });

  it("T8 — DEFAULT_SUB and the campaign default agree with the registry", () => {
    for (const tab of CAMPAIGN_TAB_REGISTRY) {
      const first = tab.subs[0]?.sub;
      expect(DEFAULT_SUB[tab.tab as ValidTab], tab.tab).toBe(first);
    }
    const def = CAMPAIGN_TAB_REGISTRY.find((t) => t.tab === DEFAULT_CAMPAIGN_TAB);
    expect(def).toBeDefined();
    expect(def?.subs.some((s) => s.sub === DEFAULT_CAMPAIGN_SUB)).toBe(true);
  });

  it("T8 — moduleForSurface is total over the fixture", () => {
    for (const row of CAMPAIGN_SURFACES) {
      expect(moduleForSurface(row.tab, row.sub), row.id).not.toBeNull();
    }
    expect(moduleForSurface("nope", null)).toBeNull();
  });
});

// ── T10 — People vs Wall chart ──────────────────────────────────────────

describe("activeOrganiserTabId — the People / Wall chart split", () => {
  const cases: {
    name: string;
    active: { tab: string; sub: string | null };
    view: "wall-chart" | "list";
    expected: string | null;
  }[] = [
    {
      name: "wall chart layout lights Wall chart",
      active: { tab: "workforce", sub: "wall-chart" },
      view: "wall-chart",
      expected: "wall-chart",
    },
    {
      name: "list layout lights People",
      active: { tab: "workforce", sub: "wall-chart" },
      view: "list",
      expected: "people",
    },
    {
      name: "a touch device with no ?view= resolves to list, so People",
      // resolveWorkforceView(null, true) === "list"; the caller passes that.
      active: { tab: "workforce", sub: null },
      view: "list",
      expected: "people",
    },
    {
      name: "Outreach lights Activity",
      active: { tab: "outreach", sub: "comms" },
      view: "wall-chart",
      expected: "activity",
    },
    {
      name: "Who's in lights Setup",
      active: { tab: "workforce", sub: "universe" },
      view: "wall-chart",
      expected: "setup",
    },
    {
      name: "a More surface lights nothing",
      active: { tab: "outcomes", sub: "reports" },
      view: "wall-chart",
      expected: null,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(activeOrganiserTabId(c.active, c.view)).toBe(c.expected);
    });
  }
});

// ── the header: nothing removed ─────────────────────────────────────────

describe("campaign header actions — every one keeps a home", () => {
  it("has the appendix's twelve rows, eleven of them write-gated", () => {
    expect(CAMPAIGN_HEADER_ACTIONS).toHaveLength(12);
    expect(CAMPAIGN_HEADER_ACTIONS.filter((a) => a.gate === "canWrite")).toHaveLength(11);
  });

  it("gives every action a non-empty organiser-mode destination, and invents none", () => {
    const ids = CAMPAIGN_HEADER_ACTIONS.map((a) => a.id).sort();
    expect(Object.keys(ORGANISER_ACTION_DESTINATIONS).sort()).toEqual(ids);
    for (const action of CAMPAIGN_HEADER_ACTIONS) {
      expect(ORGANISER_ACTION_DESTINATIONS[action.id]?.length, action.id).toBeGreaterThan(0);
    }
  });

  it("records the destination map for review", () => {
    expect(ORGANISER_ACTION_DESTINATIONS).toMatchSnapshot();
  });
});
