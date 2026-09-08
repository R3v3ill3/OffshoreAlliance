/**
 * Credentials for the signed-in e2e flows (WP0.2).
 *
 * DEV PROJECT ONLY (dpnnmkhabysfdogllsyh). Never point these at production.
 * When they are absent every signed-in spec skips with the message below —
 * absent credentials must never fail a run.
 */

export const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
export const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
export const hasE2ECredentials = Boolean(E2E_USER_EMAIL && E2E_USER_PASSWORD);

export const NO_CREDENTIALS_MESSAGE =
  "Skipped: set E2E_USER_EMAIL and E2E_USER_PASSWORD (dev project dpnnmkhabysfdogllsyh only — never production) to run the signed-in e2e flows.";
