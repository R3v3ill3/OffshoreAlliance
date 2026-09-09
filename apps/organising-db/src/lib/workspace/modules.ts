// WP1.1 — the workspace module registry.
//
// Pure data, no React. The 13 rows below are the plan-5.2 module table
// (docs/ORGANISER_UX_REVIEW_AND_PLAN.md, "Modules an admin can enable per
// role or per user"), in that order. Ids are stable snake_case and are the
// contract that navigation (WP1.2) and campaign tabs (WP1.4) key off; they
// are never derived from labels. Labels follow plan 3.6 terminology.
//
// `offState` is the plan's "hidden vs muted" rule as data: a module is
// `hidden` when the user could never use it (permission-shaped) and `muted`
// with "Ask an admin to enable" when it is merely off (capability-shaped).
// Nothing in WP1.1 renders it.
//
// Workspace mode is presentation, never permission: nothing here grants or
// removes any data access.

import type { WorkRole } from "@/types/organising-row-types";

export type WorkspaceModuleId =
  | "wall_chart_people"
  | "actions"
  | "setup"
  | "inbox"
  | "strategic_plan"
  | "bargaining"
  | "insights"
  | "data_fields"
  | "activists_wocs"
  | "library"
  | "imports"
  | "organisation_databases"
  | "administration";

export type ModuleOffState = "hidden" | "muted";

export interface WorkspaceModule {
  id: WorkspaceModuleId;
  /** Plan 3.6 wording; user-facing. */
  label: string;
  /** The "Contains" column of the plan-5.2 table; helper text in admin UIs. */
  description: string;
  defaultForOrganiser: boolean;
  adminOnly: boolean;
  offState: ModuleOffState;
}

export const MODULES: readonly WorkspaceModule[] = [
  {
    id: "wall_chart_people",
    label: "Wall chart & people",
    description: "chart, list, assessments/ratings, leaders, build list",
    defaultForOrganiser: true,
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "actions",
    label: "Actions",
    description:
      "SMS blasts, chat boards, surveys and relays; email sends; call lists and sessions; task lists and the leader webform; standalone or campaign-linked",
    defaultForOrganiser: true,
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "setup",
    label: "Setup",
    description: "who's in, groups and units, organisers, basics",
    defaultForOrganiser: true,
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "inbox",
    label: "Inbox",
    description: "SMS and email conversations",
    defaultForOrganiser: true,
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "strategic_plan",
    label: "Strategic plan",
    description:
      "Playing to Win stages, gates, section plans, situation analysis, ambitions",
    defaultForOrganiser: false,
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "bargaining",
    label: "Bargaining",
    description: "Bargaining hub, PABO, PIA, votes",
    defaultForOrganiser: false,
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "insights",
    label: "Insights",
    description: "reports, results, campaign progress, facts report",
    defaultForOrganiser: false,
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "data_fields",
    label: "Data fields",
    description: "custom facts",
    defaultForOrganiser: false,
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "activists_wocs",
    label: "Activists & WOCs",
    description: "activist register, 4A tasking, WOCs, structure tests",
    defaultForOrganiser: false,
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "library",
    label: "Library",
    description: "documents, agreements, offers",
    defaultForOrganiser: false,
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "imports",
    label: "Imports",
    description: "worker list import, participation import, email audience import",
    defaultForOrganiser: false,
    adminOnly: false,
    offState: "hidden",
  },
  {
    id: "organisation_databases",
    label: "Organisation databases",
    description:
      "worksites, employers, agreements, programs, work scopes, upcoming projects",
    defaultForOrganiser: false,
    // Capability-shaped, not permission-shaped: any organiser may look these
    // up, so when it is off it is muted ("Ask an admin to enable"), not
    // hidden. (Orchestrator ruling, WP1.2 approval.)
    adminOnly: false,
    offState: "muted",
  },
  {
    id: "administration",
    label: "Administration",
    description: "users, settings, wrappers, email imports",
    defaultForOrganiser: false,
    adminOnly: true,
    offState: "hidden",
  },
];

export const MODULE_IDS: readonly WorkspaceModuleId[] = MODULES.map((m) => m.id);

export const ALL_MODULE_IDS: ReadonlySet<WorkspaceModuleId> = new Set(MODULE_IDS);

export const ADMIN_ONLY_MODULE_IDS: ReadonlySet<WorkspaceModuleId> = new Set(
  MODULES.filter((m) => m.adminOnly).map((m) => m.id)
);

export const ORGANISER_DEFAULT_MODULE_IDS: ReadonlySet<WorkspaceModuleId> = new Set(
  MODULES.filter((m) => m.defaultForOrganiser).map((m) => m.id)
);

/**
 * The six legal `user_profiles.work_role` values
 * (`user_profiles_work_role_check` in the baseline schema). Mirrors the
 * `WorkRole` union; the `satisfies` keeps the two from drifting.
 */
export const WORK_ROLE_VALUES = [
  "coordinator",
  "lead_organiser",
  "organiser",
  "industrial_officer",
  "industrial_coordinator",
  "specialist",
] as const satisfies readonly WorkRole[];

export function isWorkspaceModuleId(v: unknown): v is WorkspaceModuleId {
  return typeof v === "string" && ALL_MODULE_IDS.has(v as WorkspaceModuleId);
}

export function isWorkRole(v: unknown): v is WorkRole {
  return typeof v === "string" && (WORK_ROLE_VALUES as readonly string[]).includes(v);
}

const MODULE_BY_ID: ReadonlyMap<WorkspaceModuleId, WorkspaceModule> = new Map(
  MODULES.map((m) => [m.id, m])
);

export function getModule(id: WorkspaceModuleId): WorkspaceModule {
  const m = MODULE_BY_ID.get(id);
  if (!m) throw new Error(`Unknown workspace module: ${id}`);
  return m;
}
