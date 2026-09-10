// WP1.1 (fix round 2) — the pure seam between the per-user workspace form in
// Administration → Users and the `workspacePrefs` field of the
// /api/admin/update-user PATCH body.
//
// It exists so the three rules that decide whether the stored column is
// rewritten are testable without React:
//   * a name-only edit sends nothing (`undefined`, dropped by JSON.stringify);
//   * while the org-wide defaults are unavailable (still loading, or the GET
//     failed) the resolved mode is unknown, so the stored `modules` list is
//     preserved verbatim instead of being cleared on the assumption of full
//     mode;
//   * an organiser selection with nothing ticked is not a document anyone
//     means, so it sends nothing rather than blocking the whole save.

import type { WorkspaceModuleId } from "./modules";
import type { WorkspaceMode } from "./resolve";
import type { WorkspacePrefs } from "./prefs-schema";

/** The three workspace fields of the per-user edit dialog. */
export interface WorkspaceFormState {
  /** "default" = follow the role default (no `mode` key is stored). */
  mode: "default" | WorkspaceMode;
  /** `null` = follow the role default (no `modules` key is stored). */
  modules: WorkspaceModuleId[] | null;
  /** Not editable in the dialog; preserved from the stored document. */
  allowShowEverything: boolean | undefined;
}

export interface WorkspacePrefsPayloadInput {
  /** The fields exactly as parsed when the dialog opened. */
  initial: WorkspaceFormState;
  /** The fields as they stand now. */
  current: WorkspaceFormState;
  /**
   * The mode `resolveWorkspace()` reports for the current form values.
   * Meaningful only when `defaultsAvailable` is true — without the org-wide
   * defaults the resolver has to assume `full`, which is a guess.
   */
  effectiveMode: WorkspaceMode;
  /** False while the org-defaults query is loading or has errored. */
  defaultsAvailable: boolean;
}

export function sameModuleList(
  a: WorkspaceModuleId[] | null,
  b: WorkspaceModuleId[] | null
): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** True when any of the three workspace fields moved since the dialog opened. */
export function workspaceFormChanged(
  initial: WorkspaceFormState,
  current: WorkspaceFormState
): boolean {
  return (
    initial.mode !== current.mode ||
    initial.allowShowEverything !== current.allowShowEverything ||
    !sameModuleList(initial.modules, current.modules)
  );
}

/**
 * True when the admin has explicitly ticked nothing in organiser mode. Such a
 * document resolves back to the registry defaults (resolve.ts R6), so it is
 * never what was meant; the caller shows an inline hint and this function
 * returns `undefined` from `workspacePrefsPayload`.
 */
export function workspaceSelectionEmpty(input: {
  current: WorkspaceFormState;
  effectiveMode: WorkspaceMode;
  defaultsAvailable: boolean;
}): boolean {
  return (
    input.defaultsAvailable &&
    input.effectiveMode === "organiser" &&
    input.current.modules !== null &&
    input.current.modules.length === 0
  );
}

function buildPrefs(
  mode: "default" | WorkspaceMode,
  modules: WorkspaceModuleId[] | null,
  allowShowEverything: boolean | undefined
): WorkspacePrefs {
  return {
    ...(mode !== "default" ? { mode } : {}),
    ...(modules !== null ? { modules } : {}),
    ...(allowShowEverything !== undefined ? { allowShowEverything } : {}),
  };
}

/**
 * The value to send as `workspacePrefs`, or `undefined` for "leave the stored
 * column exactly as it is" (the key is then absent from the PATCH body, which
 * /api/admin/update-user treats as untouched).
 */
export function workspacePrefsPayload(
  input: WorkspacePrefsPayloadInput
): WorkspacePrefs | undefined {
  const { initial, current, effectiveMode, defaultsAvailable } = input;

  if (!workspaceFormChanged(initial, current)) return undefined;

  if (!defaultsAvailable) {
    // The role default is unknown, so whether a pinned list is meaningful is
    // unknowable too: keep whatever was stored rather than clearing it.
    return buildPrefs(current.mode, initial.modules, current.allowShowEverything);
  }

  if (effectiveMode === "organiser") {
    if (workspaceSelectionEmpty({ current, effectiveMode, defaultsAvailable })) return undefined;
    return buildPrefs(current.mode, current.modules, current.allowShowEverything);
  }

  // Full mode shows every module, so a pinned list is dropped rather than
  // stored to reappear on a later switch back to organiser mode.
  return buildPrefs(current.mode, null, current.allowShowEverything);
}
