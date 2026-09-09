// WP1.2 — decision 7's machine-checked proof: "no creation path is retired".
//
// Every href full mode shows must, in organiser mode, be either shown, shown
// muted with an explanation, or reachable after one "Show everything" click.
// The test computes that set rather than listing it, so adding a row to
// `nav-model.ts` without giving it a home in organiser mode fails here.
//
// Two facts recorded so nobody mistakes their absence for a gap:
//
//  * The appendix D §1.6 pages (/workers, /templates, /workload, /sms/new,
//    /reports/campaign-progress …) are not in the model and never were. They
//    are reached from /overview's tabs, the Campaigns tab bar,
//    Administration → System, the SMS hub pills and the Reports cards. None
//    of those in-page navigations change here, and every one of their parent
//    routes is in the reachability set below.
//  * The campaign page's tabs and its More menu are WP1.4's, not nav-model
//    items, and are not asserted here.

import { describe, expect, it } from "vitest";

import { getModule } from "@/lib/workspace/modules";
import { resolveWorkspace, type ResolveWorkspaceInput } from "@/lib/workspace/resolve";
import {
  ALL_NAV_HREFS,
  MUTED_REASON,
  MY_CAMPAIGNS_HREF,
  buildNavModel,
  type NavItem,
  type NavModel,
} from "../nav-model";
import { FULL_MODE_FIXTURE, TODAY_SIDEBAR_ROWS, toFixtureRow } from "./nav-model-fixture";

const BASE: ResolveWorkspaceInput = {
  role: "user",
  workRole: null,
  orgDefaults: undefined,
  userPrefs: undefined,
  sessionShowEverything: false,
};

function modelFor(input: Partial<ResolveWorkspaceInput>, isAdmin: boolean): NavModel {
  const resolveInput = { ...BASE, ...input };
  const resolved = resolveWorkspace(resolveInput);
  return buildNavModel({
    mode: resolved.mode,
    enabledModules: resolved.enabledModules,
    moduleState: (id) =>
      resolved.enabledModules.has(id) ? "on" : getModule(id).offState,
    isAdmin,
    canShowEverything: resolved.canShowEverything,
    showEverything: resolveInput.sessionShowEverything,
    unreadEmail: 0,
  });
}

const fullAdmin = modelFor({ role: "admin" }, true);
const fullUser = modelFor({ role: "user" }, false);
const organiser = modelFor({ role: "user", userPrefs: { mode: "organiser" } }, false);
const expanded = modelFor(
  { role: "user", userPrefs: { mode: "organiser" }, sessionShowEverything: true },
  false
);

function everyItem(model: NavModel): NavItem[] {
  return [...model.primary, ...model.organisation.items, ...model.admin];
}

describe("full mode is byte-identical to the pinned fixture", () => {
  it("an admin sees today's 10 + 3 rows, in today's order, with today's labels", () => {
    expect([...fullAdmin.primary, ...fullAdmin.admin].map(toFixtureRow)).toEqual(
      FULL_MODE_FIXTURE
    );
  });

  it("a non-admin sees the same 10 and no admin block", () => {
    expect(fullUser.primary.map(toFixtureRow)).toEqual(FULL_MODE_FIXTURE.slice(0, 10));
    expect(fullUser.admin).toEqual([]);
  });

  it("the only difference from the pre-WP1.5 sidebar is row 7's three fields", () => {
    const diffs = TODAY_SIDEBAR_ROWS.map((before, i) => ({ before, after: FULL_MODE_FIXTURE[i] }))
      .filter(({ before, after }) => JSON.stringify(before) !== JSON.stringify(after))
      .map(({ before, after }) => ({ id: before.id, before, after }));

    expect(diffs).toEqual([
      {
        id: "actions",
        before: TODAY_SIDEBAR_ROWS[6],
        after: FULL_MODE_FIXTURE[6],
      },
    ]);
    // …and within that row, only label / href / icon moved.
    expect(TODAY_SIDEBAR_ROWS[6].module).toBe(FULL_MODE_FIXTURE[6].module);
    expect(TODAY_SIDEBAR_ROWS[6].state).toBe(FULL_MODE_FIXTURE[6].state);
    expect([
      TODAY_SIDEBAR_ROWS[6].label,
      TODAY_SIDEBAR_ROWS[6].href,
      TODAY_SIDEBAR_ROWS[6].icon,
    ]).toEqual(["SMS Tools", "/sms", "message-square-more"]);
    expect([
      FULL_MODE_FIXTURE[6].label,
      FULL_MODE_FIXTURE[6].href,
      FULL_MODE_FIXTURE[6].icon,
    ]).toEqual(["Actions", "/actions", "layout-list"]);
  });
});

describe("reachability — decision 7", () => {
  it("every full-mode href a non-admin can see is reachable in organiser mode", () => {
    const fullHrefs = new Set(fullUser.primary.map((i) => i.href));

    const present = new Set(
      everyItem(organiser)
        .filter((i) => i.state !== "hidden")
        .map((i) => i.href)
    );
    const afterShowEverything = new Set(
      [...expanded.primary, ...expanded.admin].map((i) => i.href)
    );

    const unreachable = [...fullHrefs].filter(
      (h) => !present.has(h) && !afterShowEverything.has(h)
    );
    expect(unreachable).toEqual([]);
  });

  it("an admin's own model is the full fixture — admins are never in organiser mode", () => {
    const adminOrganiser = modelFor({ role: "admin", userPrefs: { mode: "organiser" } }, true);
    expect([...adminOrganiser.primary, ...adminOrganiser.admin].map(toFixtureRow)).toEqual(
      FULL_MODE_FIXTURE
    );
  });

  it("Show everything restores every full-mode row for an organiser", () => {
    expect(expanded.primary.map(toFixtureRow)).toEqual(FULL_MODE_FIXTURE.slice(0, 10));
  });
});

describe("muted items", () => {
  it("the organiser default surfaces muted rows carrying the plan's reason", () => {
    const muted = organiser.organisation.items.filter((i) => i.state === "muted");
    expect(muted.length).toBeGreaterThan(0);
    for (const item of muted) expect(item.mutedReason).toBe(MUTED_REASON);
  });

  it("mutedReason is set if and only if the state is muted", () => {
    for (const model of [fullAdmin, fullUser, organiser, expanded]) {
      for (const item of everyItem(model)) {
        expect(item.mutedReason != null).toBe(item.state === "muted");
      }
    }
  });

  it("an off row's state is the registry's offState and nothing else", () => {
    const enabled = resolveWorkspace({
      ...BASE,
      userPrefs: { mode: "organiser" },
    }).enabledModules;
    for (const item of organiser.organisation.items) {
      if (!item.module) continue;
      expect(item.state).toBe(
        enabled.has(item.module) ? "on" : getModule(item.module).offState
      );
    }
  });
});

describe("allNavHrefs", () => {
  it("is the full-mode set plus the /sms alias and MY_CAMPAIGNS_HREF, deduplicated", () => {
    expect([...ALL_NAV_HREFS].sort()).toEqual(
      [
        "/actions",
        "/administration",
        "/campaigns",
        "/dashboard",
        "/email-imports",
        "/email/inbox",
        "/email/wrappers",
        "/help",
        "/overview",
        "/reports",
        "/sms",
        "/sms/inbox",
        "/upcoming-projects",
        "/worksites",
      ].sort()
    );
    expect(ALL_NAV_HREFS).toContain(MY_CAMPAIGNS_HREF);
    expect(new Set(ALL_NAV_HREFS).size).toBe(ALL_NAV_HREFS.length);
  });

  it("every href any model can render is in it", () => {
    for (const model of [fullAdmin, fullUser, organiser, expanded]) {
      for (const item of everyItem(model)) {
        expect(ALL_NAV_HREFS).toContain(item.href);
      }
    }
  });
});
