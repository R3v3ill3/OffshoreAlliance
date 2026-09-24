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

import { ACTIONS_HUB_PATH } from "@/lib/actions/hub-path";
import { getModule } from "@/lib/workspace/modules";
import {
  moduleStateFor,
  resolveWorkspace,
  type ResolveWorkspaceInput,
} from "@/lib/workspace/resolve";
import {
  ALL_NAV_HREFS,
  MUTED_REASON,
  MY_CAMPAIGNS_HREF,
  buildNavModel,
  type NavItem,
  type NavModel,
} from "../nav-model";
import {
  FULL_MODE_FIXTURE,
  FULL_MODE_PRIMARY_COUNT,
  TODAY_SIDEBAR_ROWS,
  toFixtureRow,
} from "./nav-model-fixture";

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
    // WP1.1's own helper, not a second copy of the expression.
    moduleState: (id) => moduleStateFor(resolved.enabledModules, id),
    mode: resolved.mode,
    isAdmin,
    canShowEverything: resolved.canShowEverything,
    showEverything: resolveInput.sessionShowEverything,
    unreadEmail: 0,
    projectsAttention: 0,
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
  it("an admin sees the 10 primary rows plus Name Reviews and Administration, in order", () => {
    expect([...fullAdmin.primary, ...fullAdmin.admin].map(toFixtureRow)).toEqual(
      FULL_MODE_FIXTURE
    );
  });

  it("a non-admin sees the same 10 and no admin block", () => {
    expect(fullUser.primary.map(toFixtureRow)).toEqual(
      FULL_MODE_FIXTURE.slice(0, FULL_MODE_PRIMARY_COUNT)
    );
    expect(fullUser.admin).toEqual([]);
  });

  it("the differences from the pre-WP1.5 sidebar are the known consolidations and the DA0.3 Name Reviews row", () => {
    const todayIds = TODAY_SIDEBAR_ROWS.map((row) => row.id);
    const fullIds = FULL_MODE_FIXTURE.map((row) => row.id);
    expect(fullIds.filter((id) => !todayIds.includes(id)).sort()).toEqual(["inbox", "name_reviews", "surveys_forms"]);
    // DA0.3: Name Reviews opens the admin block, ahead of Administration.
    expect(FULL_MODE_FIXTURE.findIndex((row) => row.id === "name_reviews")).toBe(FULL_MODE_PRIMARY_COUNT);
    expect(FULL_MODE_FIXTURE.findIndex((row) => row.id === "administration")).toBe(FULL_MODE_PRIMARY_COUNT + 1);
    expect(todayIds.filter((id) => !fullIds.includes(id)).sort()).toEqual([
      "email_imports",
      "email_inbox",
      "email_wrappers",
      "sms_inbox",
    ]);

    const projects = FULL_MODE_FIXTURE.find((row) => row.id === "upcoming_projects");
    expect([projects?.label, projects?.href, projects?.icon]).toEqual(["Projects", "/projects", "radar"]);

    const inbox = FULL_MODE_FIXTURE.find((row) => row.id === "inbox");
    expect([inbox?.label, inbox?.href]).toEqual(["Inbox", "/email/inbox"]);

    const fullActions = FULL_MODE_FIXTURE.find((row) => row.id === "actions");
    expect([fullActions?.label, fullActions?.href, fullActions?.icon]).toEqual([
      "Actions",
      "/actions",
      "layout-list",
    ]);
    expect(FULL_MODE_FIXTURE.filter((row) => row.module === "administration").map((row) => row.id)).toEqual([
      "name_reviews",
      "administration",
    ]);
  });
});

describe("reachability — decision 7", () => {
  // The organiser default, pinned as a literal. Not a snapshot: `vitest -u`
  // must not be able to rewrite what an organiser sees. If a row changes
  // label, href, order or state this fails and someone has to say why.
  const ORGANISER_DEFAULT_ROWS = {
    primary: [
      // WP1.3: the route exists, so the row points at it.
      { label: "My campaigns", href: "/my-campaigns", state: "on" },
      { label: "Actions", href: "/actions", state: "on" },
      { label: "Inbox", href: "/email/inbox", state: "on" },
      { label: "Guides", href: "/help", state: "on" },
    ],
    organisation: [
      { label: "Worksites", href: "/worksites", state: "muted" },
      { label: "Projects", href: "/projects", state: "muted" },
      { label: "Overview", href: "/overview", state: "muted" },
      { label: "Dashboard", href: "/dashboard", state: "muted" },
      { label: "Reports", href: "/reports", state: "muted" },
      // `surveys_forms` is an organiser default, so its row is live, not muted.
      { label: "Surveys & Forms", href: "/surveys-forms", state: "on" },
    ],
    admin: [] as { label: string; href: string; state: string }[],
  };

  const row = (i: NavItem) => ({ label: i.label, href: i.href, state: i.state });

  it("the default organiser sees exactly these rows, in this order", () => {
    expect({
      primary: organiser.primary.map(row),
      organisation: organiser.organisation.items.map(row),
      admin: organiser.admin.map(row),
    }).toEqual(ORGANISER_DEFAULT_ROWS);
  });

  it("nothing in the Organisation section is hidden from a default organiser", () => {
    // The orchestrator's WP1.2 ruling: only permission-shaped modules
    // (`imports`, `administration`) are `hidden`; every capability-shaped one
    // is `muted` with an explanation. So an organiser is never silently
    // denied a row in this section — they are told it exists and why it is
    // off. Flipping `organisation_databases.offState` back to "hidden" in
    // `modules.ts` fails this line, which is the point of asserting it.
    const hidden = organiser.organisation.items.filter((i) => i.state === "hidden");
    expect(hidden).toEqual([]);
  });

  it("only /campaigns needs Show everything or an in-page link", () => {
    // Reachable *without leaving organiser mode*: the rows the sidebar
    // actually renders — `on` (a live link) or `muted` (visible, explained,
    // and one admin flag from being live). "Show everything" is deliberately
    // NOT counted here: an expanded organiser is resolved as full mode, so
    // counting it would make this assertion a tautology that passes however
    // organiser mode is shaped.
    const fullHrefs = new Set(fullUser.primary.map((i) => i.href));
    const reachableInOrganiserMode = new Set(
      everyItem(organiser)
        .filter((i) => i.state !== "hidden")
        .map((i) => i.href)
    );

    const unreachable = [...fullHrefs].filter((h) => !reachableInOrganiserMode.has(h));

    // `/campaigns` (WP1.3): the My campaigns row points at `/my-campaigns`.
    // The portfolio list is one click from that row — "See all campaigns" —
    // and one "Show everything" click. `/sms/inbox` is not a separate row:
    // the Inbox page and the Actions hub both link to it.
    expect(unreachable).toEqual(["/campaigns"]);

    const afterShowEverything = new Set(
      [...expanded.primary, ...expanded.admin].map((i) => i.href)
    );
    expect(afterShowEverything.has("/campaigns")).toBe(true);
    expect(reachableInOrganiserMode.has("/email/inbox")).toBe(true);
    expect(reachableInOrganiserMode.has(MY_CAMPAIGNS_HREF)).toBe(true);
    expect(reachableInOrganiserMode.has(ACTIONS_HUB_PATH)).toBe(true);
  });

  it("with allowShowEverything: false the same route has only its in-page link", () => {
    // The "no out" configuration. Show everything renders no button at all,
    // so the escape hatches are the My campaigns "See all campaigns" link,
    // the Actions hub's Inbox pill and the URL — named here rather than left
    // to be discovered in the field.
    const noOut = modelFor(
      {
        role: "user",
        userPrefs: { mode: "organiser", allowShowEverything: false },
      },
      false
    );
    expect(noOut.showEverythingControl).toBe("hidden");

    const fullHrefs = new Set(fullUser.primary.map((i) => i.href));
    const reachable = new Set(
      everyItem(noOut)
        .filter((i) => i.state !== "hidden")
        .map((i) => i.href)
    );
    const onlyByUrlOrInPageLink = [...fullHrefs].filter((h) => !reachable.has(h));

    expect(onlyByUrlOrInPageLink).toEqual(["/campaigns"]);
    // My campaigns still links "See all campaigns", so the exception keeps
    // a two-click path even with no "Show everything" button at all.
    expect(reachable.has(MY_CAMPAIGNS_HREF)).toBe(true);
    expect(reachable.has(ACTIONS_HUB_PATH)).toBe(true);
    // The four primary items survive the no-out configuration: the worst case
    // is still a usable workspace, never an empty shell (risk R5).
    expect(noOut.primary.map(row)).toEqual(ORGANISER_DEFAULT_ROWS.primary);
  });

  it("an admin's own model is the full fixture — admins are never in organiser mode", () => {
    const adminOrganiser = modelFor({ role: "admin", userPrefs: { mode: "organiser" } }, true);
    expect([...adminOrganiser.primary, ...adminOrganiser.admin].map(toFixtureRow)).toEqual(
      FULL_MODE_FIXTURE
    );
  });

  it("Show everything restores every full-mode row for an organiser", () => {
    expect(expanded.primary.map(toFixtureRow)).toEqual(
      FULL_MODE_FIXTURE.slice(0, FULL_MODE_PRIMARY_COUNT)
    );
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
        "/email/inbox",
        "/help",
        "/mobilisation",
        "/my-campaigns",
        "/name-reviews",
        "/overview",
        "/projects",
        "/reports",
        "/sms",
        "/sms/inbox",
        "/surveys-forms",
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
