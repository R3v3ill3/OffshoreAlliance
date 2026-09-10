// WP1.2 — the regression pin.
//
// Hand-written literals, deliberately NOT derived from `nav-model.ts` or
// `sidebar.tsx`. Deriving them would compare the code to itself; typing them
// out is what makes "full mode is byte-for-byte today's sidebar" a claim a
// test can falsify. Compared with `toEqual`, never `toMatchSnapshot`, so
// `vitest -u` cannot silently rewrite them.

export interface FixtureRow {
  id: string;
  label: string;
  href: string;
  icon: string;
  module?: string;
  state: string;
}

/**
 * The sidebar exactly as it shipped before this package — the 10 `navItems`
 * followed by the 3 `adminItems` of `sidebar.tsx`, in order, with the icon
 * names as they were imported from lucide.
 */
export const TODAY_SIDEBAR_ROWS: readonly FixtureRow[] = [
  { id: "campaigns", label: "Campaigns", href: "/campaigns", icon: "megaphone", module: "wall_chart_people", state: "on" },
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", module: "insights", state: "on" },
  { id: "overview", label: "Overview", href: "/overview", icon: "layout-grid", module: "organisation_databases", state: "on" },
  { id: "worksites", label: "Worksites", href: "/worksites", icon: "map-pin", module: "organisation_databases", state: "on" },
  { id: "upcoming_projects", label: "Upcoming Projects", href: "/upcoming-projects", icon: "compass", module: "organisation_databases", state: "on" },
  { id: "email_inbox", label: "Email Inbox", href: "/email/inbox", icon: "inbox", module: "inbox", state: "on" },
  // Row 7, pre-WP1.5.
  { id: "actions", label: "SMS Tools", href: "/sms", icon: "message-square-more", module: "actions", state: "on" },
  { id: "sms_inbox", label: "SMS Inbox", href: "/sms/inbox", icon: "message-square", module: "inbox", state: "on" },
  { id: "reports", label: "Reports", href: "/reports", icon: "bar-chart-3", module: "insights", state: "on" },
  { id: "guides", label: "Guides", href: "/help", icon: "graduation-cap", state: "on" },
  { id: "email_imports", label: "Email Imports", href: "/email-imports", icon: "mail-open", module: "administration", state: "on" },
  { id: "email_wrappers", label: "Email Wrappers", href: "/email/wrappers", icon: "layout-template", module: "administration", state: "on" },
  { id: "administration", label: "Administration", href: "/administration", icon: "settings", module: "administration", state: "on" },
];

/**
 * What full mode must be after this package: identical to
 * `TODAY_SIDEBAR_ROWS` except row 7, which WP1.5 renamed to Actions and
 * moved to `/actions` (it explicitly handed this one sidebar line to WP1.2).
 * `/sms` keeps working as a redirect, so no URL is lost — decision 7.
 */
export const FULL_MODE_FIXTURE: readonly FixtureRow[] = [
  { id: "campaigns", label: "Campaigns", href: "/campaigns", icon: "megaphone", module: "wall_chart_people", state: "on" },
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", module: "insights", state: "on" },
  { id: "overview", label: "Overview", href: "/overview", icon: "layout-grid", module: "organisation_databases", state: "on" },
  { id: "worksites", label: "Worksites", href: "/worksites", icon: "map-pin", module: "organisation_databases", state: "on" },
  { id: "upcoming_projects", label: "Upcoming Projects", href: "/upcoming-projects", icon: "compass", module: "organisation_databases", state: "on" },
  { id: "email_inbox", label: "Email Inbox", href: "/email/inbox", icon: "inbox", module: "inbox", state: "on" },
  // WP1.5 rename — the one deliberate deviation from today's sidebar.
  { id: "actions", label: "Actions", href: "/actions", icon: "layout-list", module: "actions", state: "on" },
  { id: "sms_inbox", label: "SMS Inbox", href: "/sms/inbox", icon: "message-square", module: "inbox", state: "on" },
  { id: "reports", label: "Reports", href: "/reports", icon: "bar-chart-3", module: "insights", state: "on" },
  { id: "guides", label: "Guides", href: "/help", icon: "graduation-cap", state: "on" },
  { id: "email_imports", label: "Email Imports", href: "/email-imports", icon: "mail-open", module: "administration", state: "on" },
  { id: "email_wrappers", label: "Email Wrappers", href: "/email/wrappers", icon: "layout-template", module: "administration", state: "on" },
  { id: "administration", label: "Administration", href: "/administration", icon: "settings", module: "administration", state: "on" },
];

/** The 10 labels a full-mode sidebar renders, in order (mirrored by the e2e spec). */
export const FULL_MODE_LABELS: readonly string[] = [
  "Campaigns",
  "Dashboard",
  "Overview",
  "Worksites",
  "Upcoming Projects",
  "Email Inbox",
  "Actions",
  "SMS Inbox",
  "Reports",
  "Guides",
];

/** Reduces a built NavItem to the fields the fixture pins. */
export function toFixtureRow(item: {
  id: string;
  label: string;
  href: string;
  icon: string;
  module?: string;
  state: string;
}): FixtureRow {
  const row: FixtureRow = {
    id: item.id,
    label: item.label,
    href: item.href,
    icon: item.icon,
    state: item.state,
  };
  if (item.module) row.module = item.module;
  return row;
}
