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
  it("an admin sees today's 11 + 3 rows, in today's order, with today's labels", () => {
    expect([...fullAdmin.primary, ...fullAdmin.admin].map(toFixtureRow)).toEqual(
      FULL_MODE_FIXTURE
    );
  });

  it("a non-admin sees the same 11 and no admin block", () => {
    expect(fullUser.primary.map(toFixtureRow)).toEqual(
      FULL_MODE_FIXTURE.slice(0, FULL_MODE_PRIMARY_COUNT)
    );
    expect(fullUser.admin).toEqual([]);
  });

  it("the only differences from the pre-WP1.5 sidebar are row 7's three fields and the added Surveys & Forms row", () => {
    // The Surveys & Forms row is an addition, not a change: take it out and
    // the remaining rows must line up with the pre-WP1.2 sidebar one-to-one.
    const added = FULL_MODE_FIXTURE.filter((row) => !TODAY_SIDEBAR_ROWS.some((t) => t.id === row.id));
    expect(added.map((row) => row.id)).toEqual(["surveys_forms"]);
    expect(FULL_MODE_FIXTURE.indexOf(added[0])).toBe(
      FULL_MODE_FIXTURE.findIndex((row) => row.id === "reports") + 1
    );
    const withoutAdded = FULL_MODE_FIXTURE.filter((row) => row.id !== "surveys_forms");
    expect(withoutAdded).toHaveLength(TODAY_SIDEBAR_ROWS.length);

    const diffs = TODAY_SIDEBAR_ROWS.map((before, i) => ({ before, after: withoutAdded[i] }))
      .filter(({ before, after }) => JSON.stringify(before) !== JSON.stringify(after))
      .map(({ before, after }) => ({ id: before.id, before, after }));

    expect(diffs).toEqual([
      {
        id: "actions",
        before: TODAY_SIDEBAR_ROWS[6],
        after: withoutAdded[6],
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
      { label: "Upcoming Projects", href: "/upcoming-projects", state: "muted" },
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

  it("only /campaigns and /sms/inbox need Show everything or an in-page link", () => {
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

    // The two documented exceptions.
    //  * `/campaigns` (WP1.3): the My campaigns row pointed here until the
    //    `/my-campaigns` route existed. The portfolio list is now one click
    //    from that row — the page's "See all campaigns" link renders in its
    //    header row on every render — and one "Show everything" click.
    //  * `/sms/inbox`: not a nav row in organiser mode because the one Inbox
    //    entry carries the email unread badge (there is no SMS count
    //    endpoint). Reachable by "Show everything" and the Actions hub's own
    //    Inbox pill.
    // Both are asserted below, so neither can become "and nothing gets you
    // there".
    expect(unreachable).toEqual(["/campaigns", "/sms/inbox"]);

    const afterShowEverything = new Set(
      [...expanded.primary, ...expanded.admin].map((i) => i.href)
    );
    expect(afterShowEverything.has("/campaigns")).toBe(true);
    expect(afterShowEverything.has("/sms/inbox")).toBe(true);
    // The in-page links: My campaigns (`app/(dashboard)/my-campaigns/page.tsx`)
    // links "See all campaigns" → /campaigns; `SmsHubNav.tsx` renders
    // Actions / Inbox (/sms/inbox) / Numbers on every hub page. Both parent
    // rows are primary in organiser mode.
    expect(reachableInOrganiserMode.has(MY_CAMPAIGNS_HREF)).toBe(true);
    expect(reachableInOrganiserMode.has(ACTIONS_HUB_PATH)).toBe(true);
  });

  it("with allowShowEverything: false the same two routes have only their in-page links", () => {
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

    expect(onlyByUrlOrInPageLink).toEqual(["/campaigns", "/sms/inbox"]);
    // …and the pages carrying those links (My campaigns, `SmsHubNav.tsx`)
    // are still primary rows, so each exception keeps a two-click path even
    // with no "Show everything" button at all.
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
        "/email-imports",
        "/email/inbox",
        "/email/wrappers",
        "/help",
        "/my-campaigns",
        "/overview",
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
