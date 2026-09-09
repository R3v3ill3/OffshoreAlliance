// WP1.2 — navigation as pure data.
//
// `buildNavModel()` is the whole navigation decision: which rows exist, in
// which order, with which state. No React, no `next/*`, no lucide, so the
// vitest `environment: node` suite exercises it directly and the snapshots
// are readable text.
//
// Two rules the file never re-derives:
//
//  * hidden vs muted is `moduleState()` from WP1.1 and nothing else. The
//    registry (`workspace/modules.ts`) owns `offState`; re-deriving
//    `adminOnly` here would create a second definition that can drift from
//    `resolveWorkspace()`.
//  * full mode is not module-filtered at all. `resolveWorkspace()` already
//    returns every module the role may see in full mode, so filtering would
//    be a no-op — making it an explicit early return removes any chance of a
//    stray registry edit changing what today's users see.
//
// Workspace mode is presentation, never permission: nothing here grants or
// removes any data access, and no route is deleted (decision 7). Everything
// full mode shows is either shown, muted, or one "Show everything" click
// away in organiser mode — proved by `__tests__/nav-reachability.test.ts`.

import { ACTIONS_HUB_PATH } from "@/lib/actions/hub-path";
import { MY_CAMPAIGNS_PATH } from "@/lib/workspace/landing";
import type { WorkspaceModuleId } from "@/lib/workspace/modules";
import type { ModuleState, WorkspaceMode } from "@/lib/workspace/resolve";
import { isNavItemActive } from "./active-nav";
import type { NavIconKey } from "./nav-icons";

export type NavItemState = "on" | "muted" | "hidden";

export interface NavItem {
  /** Stable, snake_case, never derived from the label. */
  id: string;
  label: string;
  href: string;
  icon: NavIconKey;
  module?: WorkspaceModuleId;
  state: NavItemState;
  /** Set if and only if `state === "muted"`. */
  mutedReason?: string;
  /** Set only when the count is > 0. */
  badge?: number;
  /** Extra prefixes that also light this row (see `isNavRowActive`). */
  activeHrefs?: string[];
}

export interface NavAction {
  id: string;
  label: string;
}

export interface NavModel {
  primary: NavItem[];
  organisation: { collapsed: boolean; items: NavItem[] };
  admin: NavItem[];
  footer: { hardRefresh: NavAction; signOut: NavAction };
  showEverythingControl: "hidden" | "offer" | "active";
}

export interface BuildNavModelInput {
  mode: WorkspaceMode;
  /**
   * WP1.1's `moduleStateFor()` bound to the resolved set — the hidden/muted
   * decision, whole. The resolved module *set* is deliberately not an input:
   * this file must never re-derive a state from it, and an unused input is a
   * standing invitation to start.
   */
  moduleState: (id: WorkspaceModuleId) => ModuleState;
  isAdmin: boolean;
  canShowEverything: boolean;
  showEverything: boolean;
  unreadEmail: number;
}

/** Plan 5.2, verbatim. One copy, on every muted row. */
export const MUTED_REASON = "Ask an admin to enable";

/**
 * WP1.3's My campaigns page — `landing.ts` owns the path (it is pure: a type
 * import only), re-exported under the name the nav suites use so the row and
 * the landing rule cannot drift.
 */
export const MY_CAMPAIGNS_HREF = MY_CAMPAIGNS_PATH;

/**
 * The full campaign list — every campaign the account may see, not just
 * mine. The `campaigns` row and WP1.4's campaign switcher share the one
 * constant so "All campaigns" cannot come to mean two different pages.
 */
export const ALL_CAMPAIGNS_HREF = "/campaigns";

/** A row before its state is known. `badged` is internal; it never reaches a NavItem. */
type NavItemDef = Omit<NavItem, "state" | "mutedReason" | "badge"> & {
  /** Carries the email unread count. Only `/email/inbox` has a count to carry. */
  badged?: true;
};

/**
 * Every row this package can render, by id. Both the full-mode list and the
 * organiser Organisation section read from here, so a label exists once and
 * the two modes cannot drift.
 */
const DEFS = {
  campaigns: {
    id: "campaigns",
    label: "Campaigns",
    href: ALL_CAMPAIGNS_HREF,
    icon: "megaphone",
    module: "wall_chart_people",
  },
  my_campaigns: {
    id: "my_campaigns",
    label: "My campaigns",
    href: MY_CAMPAIGNS_HREF,
    icon: "megaphone",
    module: "wall_chart_people",
  },
  dashboard: {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: "layout-dashboard",
    module: "insights",
  },
  overview: {
    id: "overview",
    label: "Overview",
    href: "/overview",
    icon: "layout-grid",
    module: "organisation_databases",
  },
  worksites: {
    id: "worksites",
    label: "Worksites",
    href: "/worksites",
    icon: "map-pin",
    module: "organisation_databases",
  },
  upcoming_projects: {
    id: "upcoming_projects",
    label: "Upcoming Projects",
    href: "/upcoming-projects",
    icon: "compass",
    module: "organisation_databases",
  },
  email_inbox: {
    id: "email_inbox",
    label: "Email Inbox",
    href: "/email/inbox",
    icon: "inbox",
    module: "inbox",
    badged: true,
  },
  inbox: {
    id: "inbox",
    label: "Inbox",
    href: "/email/inbox",
    icon: "inbox",
    module: "inbox",
    badged: true,
  },
  // WP1.5 renamed the hub to "Actions" and turned `/sms` into a redirect, then
  // handed this one row to WP1.2. `activeHrefs` keeps `/sms/new` and
  // `/sms/numbers` — separate route segments WP1.5 left alone — highlighting
  // this row through the longest-prefix rule.
  actions: {
    id: "actions",
    label: "Actions",
    href: ACTIONS_HUB_PATH,
    icon: "layout-list",
    module: "actions",
    activeHrefs: ["/sms"],
  },
  sms_inbox: {
    id: "sms_inbox",
    label: "SMS Inbox",
    href: "/sms/inbox",
    icon: "message-square",
    module: "inbox",
  },
  reports: {
    id: "reports",
    label: "Reports",
    href: "/reports",
    icon: "bar-chart-3",
    module: "insights",
  },
  // No module id on purpose: the registry's `library` is documents,
  // agreements and offers, not help content, and plan 5.2 lists Guides in the
  // organiser sidebar unconditionally. An item with no module is always `on`.
  guides: {
    id: "guides",
    label: "Guides",
    href: "/help",
    icon: "graduation-cap",
  },
  email_imports: {
    id: "email_imports",
    label: "Email Imports",
    href: "/email-imports",
    icon: "mail-open",
    module: "administration",
  },
  email_wrappers: {
    id: "email_wrappers",
    label: "Email Wrappers",
    href: "/email/wrappers",
    icon: "layout-template",
    module: "administration",
  },
  administration: {
    id: "administration",
    label: "Administration",
    href: "/administration",
    icon: "settings",
    module: "administration",
  },
} satisfies Record<string, NavItemDef>;

/** Today's sidebar, in today's order. Row 7 carries the WP1.5 rename. */
export const FULL_NAV_ITEMS: readonly NavItemDef[] = [
  DEFS.campaigns,
  DEFS.dashboard,
  DEFS.overview,
  DEFS.worksites,
  DEFS.upcoming_projects,
  DEFS.email_inbox,
  DEFS.actions,
  DEFS.sms_inbox,
  DEFS.reports,
  DEFS.guides,
];

/** Today's admin block, in today's order. */
export const FULL_ADMIN_ITEMS: readonly NavItemDef[] = [
  DEFS.email_imports,
  DEFS.email_wrappers,
  DEFS.administration,
];

/**
 * Organiser mode, primary. Never module-gated: these *are* organiser mode,
 * and gating them would produce the empty shell WP1.1 warns about.
 */
const ORGANISER_PRIMARY: readonly NavItemDef[] = [
  DEFS.my_campaigns,
  DEFS.actions,
  DEFS.inbox,
  DEFS.guides,
];

/** Organiser mode, the collapsed Organisation section. */
const ORGANISATION_ITEMS: readonly NavItemDef[] = [
  DEFS.worksites,
  DEFS.upcoming_projects,
  DEFS.overview,
  DEFS.dashboard,
  DEFS.reports,
];

/**
 * Every href the active-state rule needs in scope — the full-mode set, in
 * BOTH modes. `isNavItemActive` resolves ties by longest prefix, so feeding
 * it only the visible subset would make `/sms/inbox` light up the
 * `/sms`-rooted Actions row. `activeHrefs` keeps `/sms` in the list after
 * row 7 moved to `/actions`.
 */
const HREF_SOURCES: readonly NavItemDef[] = [
  ...FULL_NAV_ITEMS,
  ...FULL_ADMIN_ITEMS,
  // Added now so it disambiguates against /campaigns the moment WP1.3 lands.
  DEFS.my_campaigns,
];

export const ALL_NAV_HREFS: readonly string[] = [
  ...new Set(HREF_SOURCES.flatMap((i) => [i.href, ...(i.activeHrefs ?? [])])),
];

/**
 * `isNavItemActive` for a row that may carry aliases. The underlying
 * longest-prefix rule is unchanged; this only widens which hrefs count.
 */
export function isNavRowActive(
  pathname: string | null,
  item: Pick<NavItem, "href" | "activeHrefs">,
  allHrefs: readonly string[] = ALL_NAV_HREFS
): boolean {
  if (isNavItemActive(pathname, item.href, allHrefs)) return true;
  return (item.activeHrefs ?? []).some((h) => isNavItemActive(pathname, h, allHrefs));
}

function toItem(def: NavItemDef, state: NavItemState, unreadEmail: number): NavItem {
  const item: NavItem = {
    id: def.id,
    label: def.label,
    href: def.href,
    icon: def.icon,
    state,
  };
  if (def.module) item.module = def.module;
  if (def.activeHrefs) item.activeHrefs = [...def.activeHrefs];
  if (state === "muted") item.mutedReason = MUTED_REASON;
  // The clamp (`>99 → "99+"`) and the aria-label stay in the renderers.
  if (def.badged && state !== "hidden" && unreadEmail > 0) item.badge = unreadEmail;
  return item;
}

const FOOTER: NavModel["footer"] = {
  hardRefresh: { id: "hard_refresh", label: "Hard Refresh Connection" },
  signOut: { id: "sign_out", label: "Sign out" },
};

export function buildNavModel(input: BuildNavModelInput): NavModel {
  const { mode, moduleState, isAdmin, canShowEverything, showEverything, unreadEmail } =
    input;

  // "active" is reachable only from an expanded organiser: `resolveWorkspace`
  // returns `mode: "full"` WITH `canShowEverything: true` for a session
  // expansion, and `canShowEverything: false` whenever the mode is genuinely
  // full. So one expression covers both branches and the user can always
  // toggle back.
  const showEverythingControl: NavModel["showEverythingControl"] = !canShowEverything
    ? "hidden"
    : showEverything
      ? "active"
      : "offer";

  const admin = isAdmin ? FULL_ADMIN_ITEMS.map((d) => toItem(d, "on", unreadEmail)) : [];

  if (mode === "full") {
    return {
      primary: FULL_NAV_ITEMS.map((d) => toItem(d, "on", unreadEmail)),
      organisation: { collapsed: false, items: [] },
      admin,
      footer: FOOTER,
      showEverythingControl,
    };
  }

  return {
    primary: ORGANISER_PRIMARY.map((d) => toItem(d, "on", unreadEmail)),
    organisation: {
      // Plan 5.2: collapsed by default, every render.
      collapsed: true,
      items: ORGANISATION_ITEMS.map((d) =>
        toItem(d, d.module ? moduleState(d.module) : "on", unreadEmail)
      ),
    },
    // Always `[]` in practice — `resolveWorkspace` returns `full` for every
    // admin, so organiser + isAdmin is unreachable. Computed defensively so a
    // future decision to let an admin preview organiser mode does not
    // silently drop the three admin links.
    admin,
    footer: FOOTER,
    showEverythingControl,
  };
}
