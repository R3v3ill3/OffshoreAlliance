// WP1.1 — zod schemas for the two stored JSON documents:
//   * `user_profiles.workspace_prefs`         (per-user override)
//   * `app_settings.workspace_defaults` value (org-wide defaults per work role)
//
// The `.strict()` schemas are for the admin API write paths — an admin's
// typo is rejected with a 400. The lenient readers (`parseWorkspacePrefs`,
// `parseWorkspaceDefaults`) are for untrusted DB JSON: they never throw,
// silently drop unknown module ids and unknown work-role keys (so a
// document that predates a registry change still parses), ignore unknown
// top-level keys, and return `null` for anything that is not a usable
// document.

import { z } from "zod";
import {
  MODULE_IDS,
  WORK_ROLE_VALUES,
  isWorkspaceModuleId,
  isWorkRole,
  type WorkspaceModuleId,
} from "./modules";

export const workspaceModeSchema = z.enum(["full", "organiser"]);

export const workspaceModuleIdSchema = z.enum(
  MODULE_IDS as [WorkspaceModuleId, ...WorkspaceModuleId[]]
);

const prefsShape = {
  mode: workspaceModeSchema.optional(),
  modules: z.array(workspaceModuleIdSchema).optional(),
  allowShowEverything: z.boolean().optional(),
};

/** Strict: the admin API write path (`/api/admin/update-user`). */
export const workspacePrefsSchema = z.object(prefsShape).strict();

/** Strict: one work-role entry of the org-wide defaults document. */
export const workspaceRoleDefaultSchema = z.object(prefsShape).strict();

/** Strict: the admin API write path (`/api/admin/workspace-defaults`). */
export const workspaceDefaultsSchema = z
  .object({
    byWorkRole: z
      .partialRecord(z.enum(WORK_ROLE_VALUES), workspaceRoleDefaultSchema)
      .optional(),
  })
  .strict();

export type WorkspacePrefs = z.infer<typeof workspacePrefsSchema>;
export type WorkspaceRoleDefault = z.infer<typeof workspaceRoleDefaultSchema>;
export type WorkspaceDefaults = z.infer<typeof workspaceDefaultsSchema>;

// Lenient (non-strict) variants used only after the readers below have
// stripped unknown ids/keys. Unknown top-level keys are ignored, not fatal.
const lenientPrefsSchema = z.object(prefsShape);
const lenientDefaultsSchema = z.object({
  byWorkRole: z.partialRecord(z.enum(WORK_ROLE_VALUES), lenientPrefsSchema).optional(),
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Drop unknown module ids from a candidate `modules` value; leave non-arrays alone so the schema rejects them. */
function stripUnknownModules(entry: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(entry.modules)) return entry;
  return { ...entry, modules: entry.modules.filter(isWorkspaceModuleId) };
}

/**
 * Never throws. Returns the parsed per-user prefs, or `null` when the value
 * is not a usable document (`null`, a string, an array, a non-enum `mode`,
 * a non-array `modules`, ...). Unknown module ids are dropped silently.
 */
export function parseWorkspacePrefs(v: unknown): WorkspacePrefs | null {
  if (!isPlainObject(v)) return null;
  const result = lenientPrefsSchema.safeParse(stripUnknownModules(v));
  return result.success ? result.data : null;
}

/**
 * Never throws. Returns the parsed org-wide defaults, or `null` when the
 * value is not a usable document (`byWorkRole` missing-or-object is fine;
 * `byWorkRole` that is not an object is not). Unknown work-role keys and
 * unknown module ids are dropped silently, and **one unusable role entry is
 * dropped on its own** — it never invalidates the entries beside it, which
 * would drag every other work role back to `full`.
 */
export function parseWorkspaceDefaults(v: unknown): WorkspaceDefaults | null {
  if (!isPlainObject(v)) return null;
  const candidate: Record<string, unknown> = { ...v };
  if ("byWorkRole" in candidate && candidate.byWorkRole !== undefined) {
    const byWorkRole = candidate.byWorkRole;
    if (!isPlainObject(byWorkRole)) return null;
    const cleaned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(byWorkRole)) {
      if (!isWorkRole(key)) continue;
      if (!isPlainObject(entry)) continue;
      const parsedEntry = lenientPrefsSchema.safeParse(stripUnknownModules(entry));
      if (!parsedEntry.success) continue;
      cleaned[key] = parsedEntry.data;
    }
    candidate.byWorkRole = cleaned;
  }
  const result = lenientDefaultsSchema.safeParse(candidate);
  return result.success ? result.data : null;
}
