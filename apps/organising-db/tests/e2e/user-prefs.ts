import { expect, test, type BrowserContext } from "@playwright/test";

import type { WorkspacePrefs } from "@/lib/workspace/prefs-schema";

import {
  NO_ADMIN_CREDENTIALS_MESSAGE,
  NO_CREDENTIALS_MESSAGE,
  hasE2EAdminCredentials,
  hasE2ECredentials,
} from "./env";
import {
  findE2EUserId,
  openAdminContext,
  readUserPrefs,
  restoreUserPrefs,
  setUserPrefs,
} from "./workspace-mode";

/**
 * WP2.4 (wp2.4.md §4.5) — **a spec that needs a per-user document owns that
 * precondition**, the whole document this time, not only `mode`.
 *
 * `withUserMode` (tests/e2e/workspace-mode.ts) pins `{ mode }`; the groups_v2
 * spec also needs the per-user flag `{ flags: { groups_v2: true } }` (FL-b,
 * wp2.4.md §3.2), and the two pins must not leave each other's state behind
 * — pinning the flag inside a `withUserMode` suite would restore `{ mode }`
 * over the flag, or the flag over the mode, depending on which `afterAll`
 * runs last. So this helper pins ONE document for the suite and restores
 * exactly what it recorded, through the same validated admin route
 * (`PATCH /api/admin/update-user`, whose strict `workspacePrefsSchema` accepts
 * `flags.groups_v2`) and the same read-back (`GET /api/admin/users`).
 *
 * `withUserPrefs(document)`:
 *   1. `beforeAll` records the account's CURRENT `workspace_prefs`;
 *   2. pins `document` for the suite;
 *   3. `afterAll` restores what was recorded (the lenient reader guards the
 *      restore exactly as `restoreUserPrefs` does for `withUserMode`).
 *
 * One record/restore per suite; never nest it inside `withUserMode`. Without
 * user or admin credentials the describe skips — the pin cannot be made, and
 * running against whatever the account happens to hold is the assumption
 * this helper exists to remove.
 */

/** Why a prefs-pinned suite skips when the admin account is not configured. */
export const NO_PREFS_PIN_MESSAGE =
  "This suite pins the e2e account's workspace_prefs document through the admin API before it runs, so it cannot run without the admin account.";

function note(description: string): void {
  console.log(`[user-prefs] ${description}`);
  try {
    test.info().annotations.push({ type: "user-prefs", description });
  } catch {
    // No running test (a hook that threw early): the log line is the record.
  }
}

/** The account's current document, recorded, then `document` pinned (asserted on read-back). */
export async function pinUserPrefs(
  admin: BrowserContext,
  userId: string,
  document: WorkspacePrefs
): Promise<unknown> {
  const previous = await readUserPrefs(admin, userId);
  await setUserPrefs(admin, userId, document);
  return previous;
}

/**
 * Suite-scoped document pin. Call it in a `test.describe` body:
 *
 * ```ts
 * test.describe("…", () => {
 *   withUserPrefs({ mode: "full", flags: { groups_v2: true } });
 *   test("…", async ({ page }) => { … });
 * });
 * ```
 *
 * AuthProvider caches `workspace_prefs` with the profile at sign-in, so the
 * pin is seen by any full page load after it — every spec starts with
 * `page.goto`, which is one.
 */
export function withUserPrefs(document: WorkspacePrefs): void {
  test.skip(
    !hasE2ECredentials || !hasE2EAdminCredentials,
    `${NO_CREDENTIALS_MESSAGE} ${NO_ADMIN_CREDENTIALS_MESSAGE} ${NO_PREFS_PIN_MESSAGE}`
  );

  let admin: BrowserContext | null = null;
  let userId: string | null = null;
  let previous: unknown;
  let pinned = false;

  test.beforeAll(async ({ browser }) => {
    if (!hasE2ECredentials || !hasE2EAdminCredentials) {
      note(`no admin credentials: the prefs pin ${JSON.stringify(document)} was skipped`);
      return;
    }
    admin = await openAdminContext(browser);
    userId = await findE2EUserId(admin);
    if (!userId) return;
    previous = await pinUserPrefs(admin, userId, document);
    pinned = true;
    note(`pinned ${JSON.stringify(document)} (was ${JSON.stringify(previous)})`);
    expect(pinned).toBe(true);
  });

  test.afterAll(async () => {
    try {
      if (admin && userId && pinned) {
        await restoreUserPrefs(admin, userId, previous);
        note(`restored ${JSON.stringify(previous ?? {})}`);
      }
    } finally {
      await admin?.close();
      admin = null;
      userId = null;
      pinned = false;
    }
  });
}
