import { resolve } from "node:path";

import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

import { parseWorkspacePrefs, type WorkspacePrefs } from "@/lib/workspace/prefs-schema";
import type { WorkspaceMode } from "@/lib/workspace/resolve";

import { ADMIN_STORAGE_STATE, E2E_BASE_URL } from "../../playwright.config";
import {
  E2E_USER_EMAIL,
  NO_ADMIN_CREDENTIALS_MESSAGE,
  NO_CREDENTIALS_MESSAGE,
  hasE2EAdminCredentials,
  hasE2ECredentials,
} from "./env";

/**
 * WP1.7 follow-up — **a spec that needs a workspace mode owns that
 * precondition.**
 *
 * Why this exists: `workspace_prefs` on the e2e account is empty, so the
 * account's mode comes from the org-wide defaults (`app_settings`), which an
 * admin can change through the app at any time and which are shared dev state
 * this suite does not own. When the default for work role `organiser` was
 * flipped to organiser mode, every spec written against the full-mode page
 * broke at once — flow one's "Campaign summary" heading, the ten sidebar
 * rows, the eight campaign tabs, the role specs' wall-chart locators — none of
 * which is a product regression. `resolveWorkspace()` R5 says a valid per-user
 * `mode` beats the role default, so pinning the per-user override is the one
 * lever a spec can pull without touching what the operator owns.
 *
 * Everything here goes through WP1.1's validated admin write path
 * (`PATCH /api/admin/update-user`, whose `workspacePrefsSchema` parses the
 * body before the service-role client touches the column) and reads back
 * through `GET /api/admin/users`, with the admin storage state global setup
 * wrote — the same two calls the WP1.2/WP1.4 organiser round trips already
 * make. No database connection, no credentials typed into a form.
 *
 * `withUserMode(mode)` is the whole contract in one line per describe:
 *   1. record the account's CURRENT `workspace_prefs` (whatever it is);
 *   2. pin `{ mode }` for the duration of the suite;
 *   3. restore what was recorded — not `{}` blindly. Restoring `{}` would be
 *      correct today only by accident: an operator who sets a deliberate
 *      per-user override would have it silently erased by a test run.
 *
 * Without admin credentials the pin cannot be made, so the suite skips rather
 * than assuming a mode it could not set (and the hooks below no-op instead of
 * opening an admin storage state a credential-less checkout does not have).
 */

/** Why a mode-pinned suite skips when the admin account is not configured. */
export const NO_MODE_PIN_MESSAGE =
  "This suite pins the e2e account's workspace mode through the admin API before it runs, so it cannot run without the admin account.";

/** A record in a test annotation and in the run log; never an assertion. */
function note(description: string): void {
  console.log(`[workspace-mode] ${description}`);
  try {
    test.info().annotations.push({ type: "workspace-mode", description });
  } catch {
    // Playwright throws when there is no running test; the log line above is
    // the record in that case.
  }
}

/**
 * A browser context signed in as the dev admin, from the storage state global
 * setup wrote. `browser.newContext()` does not inherit the config's `use`
 * block, so `baseURL` is passed explicitly for the relative API paths below.
 */
export async function openAdminContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: resolve(__dirname, "../..", ADMIN_STORAGE_STATE),
  });
}

/** Every profile row the admin API returns, in the shape these helpers read. */
interface AdminUserRow {
  user_id: string;
  email?: string;
  workspace_prefs?: unknown;
}

async function adminUsers(admin: BrowserContext): Promise<AdminUserRow[]> {
  const list = await admin.request.get("/api/admin/users");
  expect(list.ok(), "the admin account must be able to list users").toBeTruthy();
  const { users } = (await list.json()) as { users: AdminUserRow[] };
  return users;
}

/**
 * The E2E_USER account's `user_id`, matched on the email `GET
 * /api/admin/users` joins in from `auth.admin.listUsers`. Returns null only
 * if the assertion below is somehow non-fatal; callers guard on it anyway.
 */
export async function findE2EUserId(admin: BrowserContext): Promise<string | null> {
  const users = await adminUsers(admin);
  const userId =
    users.find((u) => u.email?.toLowerCase() === E2E_USER_EMAIL.toLowerCase())?.user_id ?? null;
  expect(userId, "the E2E_USER account must exist on dev").toBeTruthy();
  return userId;
}

/**
 * The account's stored `workspace_prefs`, raw. `GET /api/admin/users` selects
 * `*` from `user_profiles`, so a cleared column reads back as `{}`.
 *
 * The row must exist: `?? {}` on a missing row would report "no override" for
 * a deleted user or a response-shape change, which is not the same thing.
 */
export async function readUserPrefs(admin: BrowserContext, userId: string): Promise<unknown> {
  const users = await adminUsers(admin);
  const row = users.find((u) => u.user_id === userId);
  expect(row, "the e2e user's profile row must exist").toBeTruthy();
  return row?.workspace_prefs;
}

/**
 * Writes `prefs` to the account and verifies the write from the same route.
 * `null` clears the override — WP1.1's API parses it to `{}` so the column's
 * NOT NULL holds — which is why the read-back expects `prefs ?? {}`.
 *
 * Asserted, not fire-and-forget: a silently failed write means the suite runs
 * in the wrong mode (or leaves the shared dev account pinned for whatever
 * runs next), and that must fail loudly here rather than as a mystery
 * locator failure somewhere else.
 */
export async function setUserPrefs(
  admin: BrowserContext,
  userId: string,
  prefs: WorkspacePrefs | null
): Promise<void> {
  const res = await admin.request.patch("/api/admin/update-user", {
    data: { userId, workspacePrefs: prefs },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  expect(
    await readUserPrefs(admin, userId),
    `workspace_prefs must be exactly ${JSON.stringify(prefs ?? {})}`
  ).toEqual(prefs ?? {});
}

/**
 * Pins the account's workspace mode (`{ mode }`), or clears the whole
 * per-user override with `null`.
 *
 * Note what this deliberately does NOT do: it never touches the org-wide
 * defaults. Those are shared state the operator owns, and a suite that
 * rewrote them would fight whatever an admin had just set in the app.
 */
export async function setUserMode(
  admin: BrowserContext,
  userId: string,
  mode: WorkspaceMode | null
): Promise<void> {
  await setUserPrefs(admin, userId, mode === null ? null : { mode });
}

/**
 * Puts back the prefs `readUserPrefs` returned earlier.
 *
 * The stored value is untrusted jsonb and the admin API's schema is
 * `.strict()`, so it is run through the product's own lenient reader first: a
 * document that would be rejected on the way back in (an unknown key from a
 * future registry) is restored as "no override" with a note, rather than
 * failing the suite in an `afterAll` that has nothing to do with what it was
 * testing.
 */
export async function restoreUserPrefs(
  admin: BrowserContext,
  userId: string,
  previous: unknown
): Promise<void> {
  const parsed = parseWorkspacePrefs(previous);
  if (parsed === null && previous !== undefined && JSON.stringify(previous) !== "{}") {
    note(
      `the recorded workspace_prefs ${JSON.stringify(previous)} is not a document the admin API accepts; restoring the override as cleared instead`
    );
  }
  await setUserPrefs(admin, userId, parsed);
}

/**
 * Suite-scoped mode pin. Call it in a `test.describe` body:
 *
 * ```ts
 * test.describe("…", () => {
 *   withUserMode("full");
 *   test("…", async ({ page }) => { … });
 * });
 * ```
 *
 * Semantics:
 *   - `beforeAll` records the account's current `workspace_prefs` and pins
 *     `{ mode }`; `afterAll` restores exactly what was recorded.
 *   - AuthProvider caches `workspace_prefs` with the profile at sign-in, so
 *     the pin is seen by any full page load after it — every spec here starts
 *     with `page.goto`, which is one. A client-side navigation would not be.
 *   - Without user OR admin credentials the whole describe skips: the pin
 *     cannot be made, and running on whatever the org default happens to be
 *     is precisely the assumption this helper exists to remove.
 */
export function withUserMode(mode: WorkspaceMode): void {
  test.skip(
    !hasE2ECredentials || !hasE2EAdminCredentials,
    `${NO_CREDENTIALS_MESSAGE} ${NO_ADMIN_CREDENTIALS_MESSAGE} ${NO_MODE_PIN_MESSAGE}`
  );

  let admin: BrowserContext | null = null;
  let userId: string | null = null;
  let previous: unknown;
  let pinned = false;

  test.beforeAll(async ({ browser }) => {
    // Belt and braces: if Playwright ever runs hooks for a statically skipped
    // suite, this must not open an admin storage state that a credential-less
    // checkout does not have.
    if (!hasE2ECredentials || !hasE2EAdminCredentials) {
      note(`no admin credentials: the ${mode}-mode pin was skipped`);
      return;
    }
    admin = await openAdminContext(browser);
    userId = await findE2EUserId(admin);
    if (!userId) return;
    previous = await readUserPrefs(admin, userId);
    await setUserMode(admin, userId, mode);
    pinned = true;
    note(`pinned mode="${mode}" (was ${JSON.stringify(previous)})`);
  });

  test.afterAll(async () => {
    try {
      if (admin && userId && pinned) await restoreUserPrefs(admin, userId, previous);
    } finally {
      await admin?.close();
      admin = null;
      userId = null;
      pinned = false;
    }
  });
}
