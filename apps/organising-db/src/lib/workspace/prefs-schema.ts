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

/**
 * WP2.4 (FL-b, wp2.4.md §3.2) — per-user feature flags ride on the same
 * per-user document as `{ "flags": { "groups_v2": true } }`. Strict on the
 * admin write path (an unknown flag name is a 400), lenient on read (an
 * unknown flag name is dropped, the rest of the document survives). Per
 * user only: the org-wide role defaults do not accept `flags`. WP2.8
 * removes the key with the legacy chart.
 */
export const workspaceFlagsSchema = z
  .object({
    groups_v2: z.boolean().optional(),
  })
  .strict();

const userPrefsShape = {
  ...prefsShape,
  flags: workspaceFlagsSchema.optional(),
};

/** Strict: the admin API write path (`/api/admin/update-user`). */
export const workspacePrefsSchema = z.object(userPrefsShape).strict();

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
export type WorkspaceFlagsPrefs = z.infer<typeof workspaceFlagsSchema>;
export type WorkspaceRoleDefault = z.infer<typeof workspaceRoleDefaultSchema>;
export type WorkspaceDefaults = z.infer<typeof workspaceDefaultsSchema>;

// Lenient (non-strict) variants used only after the readers below have
// stripped unknown ids/keys. Unknown top-level keys are ignored, not fatal.
const lenientPrefsSchema = z.object(prefsShape);
// The per-user reader: `flags` parsed leniently too (unknown flag names dropped).
const lenientUserPrefsSchema = z.object({
  ...prefsShape,
  flags: z.object({ groups_v2: z.boolean().optional() }).optional(),
});
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
 * WP2.4: a `flags` value that is not an object reads as absent (the user
 * document must not become unusable because of it); unknown flag names are
 * dropped so a flag a later package adds, or one WP2.8 removes, never
 * invalidates the rest.
 */
function stripUnknownFlags(entry: Record<string, unknown>): Record<string, unknown> {
  if (!("flags" in entry)) return entry;
  const flags = entry.flags;
  if (!isPlainObject(flags)) {
    const { flags: _dropped, ...rest } = entry;
    void _dropped;
    return rest;
  }
  const kept: Record<string, unknown> = {};
  if (typeof flags.groups_v2 === "boolean") kept.groups_v2 = flags.groups_v2;
  return { ...entry, flags: kept };
}

/**
 * Never throws. Returns the parsed per-user prefs, or `null` when the value
 * is not a usable document (`null`, a string, an array, a non-enum `mode`,
 * a non-array `modules`, ...). Unknown module ids are dropped silently.
 */
export function parseWorkspacePrefs(v: unknown): WorkspacePrefs | null {
  if (!isPlainObject(v)) return null;
  const result = lenientUserPrefsSchema.safeParse(stripUnknownFlags(stripUnknownModules(v)));
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

/**
 * The `byWorkRole` keys of a raw stored document that `parseWorkspaceDefaults`
 * discards — an unknown work role, or a work-role entry that does not parse.
 * The editor uses it to name what a save would silently overwrite; it returns
 * `[]` for a document the parser rejects outright (that case is reported as
 * "malformed", not as a list of dropped roles).
 */
export function droppedRoleKeys(raw: unknown): string[] {
  if (!isPlainObject(raw)) return [];
  const byWorkRole = raw.byWorkRole;
  if (!isPlainObject(byWorkRole)) return [];
  const parsed = parseWorkspaceDefaults(raw);
  if (parsed === null) return [];
  const kept = parsed.byWorkRole ?? {};
  return Object.keys(byWorkRole).filter((key) => !(key in kept));
}
