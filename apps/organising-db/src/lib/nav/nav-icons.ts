// WP1.2 — the only file in the nav layer that imports lucide.
//
// `nav-model.ts` must stay importable by a vitest `environment: node` test
// and its output must serialise into a readable snapshot, so a NavItem
// carries a string icon *key*, not a component reference (a component
// serialises as `[Function]` and pins nothing). The renderers do
// `const Icon = NAV_ICONS[item.icon]`.
//
// The keys below are the exact icons the sidebar imports today, plus three
// introduced by this package: `layout-list` (Actions, matching the hub's own
// nav at SmsHubNav.tsx), `building-2` (the Organisation section heading) and
// `eye` (the Show everything control).

import {
  BarChart3,
  Building2,
  Compass,
  Eye,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LayoutList,
  LayoutTemplate,
  MailOpen,
  MapPin,
  Megaphone,
  MessageSquare,
  MessageSquareMore,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavIconKey =
  | "bar-chart-3"
  | "building-2"
  | "compass"
  | "eye"
  | "graduation-cap"
  | "inbox"
  | "layout-dashboard"
  | "layout-grid"
  | "layout-list"
  | "layout-template"
  | "mail-open"
  | "map-pin"
  | "megaphone"
  | "message-square"
  | "message-square-more"
  | "settings";

export const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  "bar-chart-3": BarChart3,
  "building-2": Building2,
  compass: Compass,
  eye: Eye,
  "graduation-cap": GraduationCap,
  inbox: Inbox,
  "layout-dashboard": LayoutDashboard,
  "layout-grid": LayoutGrid,
  "layout-list": LayoutList,
  "layout-template": LayoutTemplate,
  "mail-open": MailOpen,
  "map-pin": MapPin,
  megaphone: Megaphone,
  "message-square": MessageSquare,
  "message-square-more": MessageSquareMore,
  settings: Settings,
};
