// WP1.1 — workspace mode resolution.
//
// Pure: no React, no I/O, never throws. `resolveWorkspace()` turns the three
// stored/session inputs into what the UI should show. It carries the whole
// acceptance criterion for the work package (see the table-driven tests in
// ./__tests__/resolve.test.ts), so every rule below is numbered and kept
// separate on purpose.
//
// Workspace mode is presentation, never permission: nothing here is read by
// any RLS policy or API check.

import type { UserRole, WorkRole } from "@/types/organising-row-types";
import {
  ADMIN_ONLY_MODULE_IDS,
  MODULE_IDS,
  ORGANISER_DEFAULT_MODULE_IDS,
  getModule,
  isWorkRole,
  type ModuleOffState,
  type WorkspaceModuleId,
} from "./modules";
import { parseWorkspaceDefaults, parseWorkspacePrefs } from "./prefs-schema";

export type WorkspaceMode = "full" | "organiser";

/** Where the resolved `mode` came from. */
export type WorkspaceSource = "default" | "role" | "user" | "session";

export interface ResolveWorkspaceInput {
  role: UserRole;
  workRole: WorkRole | null;
  /** Raw jsonb from `get_workspace_defaults()`; may be anything. */
  orgDefaults: unknown;
  /** Raw jsonb from `user_profiles.workspace_prefs`; may be anything. */
  userPrefs: unknown;
  /** The session "Show everything" toggle. */
  sessionShowEverything: boolean;
}

export interface ResolvedWorkspace {
  mode: WorkspaceMode;
  enabledModules: Set<WorkspaceModuleId>;
  canShowEverything: boolean;
  source: WorkspaceSource;
}

/** Every module the role may see: all ids, minus `adminOnly` for non-admins (R3). */
export function modulesForRole(role: UserRole): Set<WorkspaceModuleId> {
  if (role === "admin") return new Set(MODULE_IDS);
  return new Set(MODULE_IDS.filter((id) => !ADMIN_ONLY_MODULE_IDS.has(id)));
}

/** `"on"` when the module is enabled; otherwise the registry's `offState`. */
export type ModuleState = "on" | ModuleOffState;

/**
 * The whole hidden-vs-muted decision, in one pure function.
 *
 * `useWorkspace().moduleState` is this bound to the resolved set, and
 * `buildNavModel()` receives it as an input. It lives here, next to
 * `resolveWorkspace()`, so consumers and tests import the real rule instead
 * of re-typing `enabled.has(id) ? "on" : getModule(id).offState` — a second
 * copy that can drift is exactly what WP1.1 set out to avoid.
 */
export function moduleStateFor(
  enabledModules: ReadonlySet<WorkspaceModuleId>,
  id: WorkspaceModuleId
): ModuleState {
  return enabledModules.has(id) ? "on" : getModule(id).offState;
}

export function resolveWorkspace(input: ResolveWorkspaceInput): ResolvedWorkspace {
  const { role, workRole, sessionShowEverything } = input;
  const allForRole = modulesForRole(role);

  // R2 — admins are always full; org defaults and user prefs are ignored.
  if (role === "admin") {
    return { mode: "full", enabledModules: allForRole, canShowEverything: false, source: "role" };
  }

  // R10 — malformed documents parse to "absent"; a bad user document must
  // not drag the user back to `full` if the role default says otherwise.
  const defaults = parseWorkspaceDefaults(input.orgDefaults);
  const prefs = parseWorkspacePrefs(input.userPrefs);

  // R4 — role default lookup key.
  const lookupKey: WorkRole | null = isWorkRole(workRole)
    ? workRole
    : role === "viewer"
      ? "organiser"
      : null;
  const roleEntry = lookupKey ? defaults?.byWorkRole?.[lookupKey] : undefined;

  // R1 — default is `full`; R5 — a valid user `mode` beats the role default.
  let mode: WorkspaceMode = "full";
  let source: WorkspaceSource = "default";
  if (roleEntry?.mode) {
    mode = roleEntry.mode;
    source = "role";
  }
  if (prefs?.mode) {
    mode = prefs.mode;
    source = "user";
  }

  // R8 — user pref, then role entry, defaulting to true (decision 1).
  const allowShowEverything =
    prefs?.allowShowEverything ?? roleEntry?.allowShowEverything ?? true;
  const canShowEverything = mode === "organiser" && allowShowEverything !== false;

  // R9 — session expansion; only meaningful when the resolved mode is organiser.
  if (mode === "organiser" && sessionShowEverything && canShowEverything) {
    return { mode: "full", enabledModules: allForRole, canShowEverything: true, source: "session" };
  }

  // Full mode always means every module the role may see (R6, second sentence).
  if (mode === "full") {
    return { mode, enabledModules: allForRole, canShowEverything, source };
  }

  // R6 — organiser mode module list: user prefs → role entry → registry default.
  // R5 — a user list replaces the role list wholesale.
  // An empty array is treated as "not provided" and falls through: organiser
  // mode with zero modules would render an empty shell, which is never what a
  // stored `"modules": []` is meant to express.
  const userList = prefs?.modules?.length ? prefs.modules : undefined;
  const roleList = roleEntry?.modules?.length ? roleEntry.modules : undefined;
  const list: readonly WorkspaceModuleId[] =
    userList ?? roleList ?? [...ORGANISER_DEFAULT_MODULE_IDS];

  // R3 — admin-only ids never survive for a non-admin; R7 — unknown ids were
  // already dropped by the lenient parsers and duplicates collapse in the Set.
  const enabledModules = new Set(list.filter((id) => allForRole.has(id)));

  return { mode: "organiser", enabledModules, canShowEverything, source };
}
