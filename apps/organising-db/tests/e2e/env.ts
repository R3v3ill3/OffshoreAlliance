/**
 * Credentials for the signed-in e2e flows (WP0.2, WP1.6).
 *
 * DEV PROJECT ONLY (dpnnmkhabysfdogllsyh). Never point these at production.
 * When they are absent every signed-in spec skips with the message below —
 * absent credentials must never fail a run. Values are read from the
 * environment only; they are never printed and never written to the repo.
 */

export const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
export const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
export const hasE2ECredentials = Boolean(E2E_USER_EMAIL && E2E_USER_PASSWORD);

export const NO_CREDENTIALS_MESSAGE =
  "Skipped: set E2E_USER_EMAIL and E2E_USER_PASSWORD (dev project dpnnmkhabysfdogllsyh only — never production) to run the signed-in e2e flows.";

/** A dev account with user_profiles.role = 'admin', for the chromium-admin project (WP1.6). */
export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
export const hasE2EAdminCredentials = Boolean(E2E_ADMIN_EMAIL && E2E_ADMIN_PASSWORD);

export const NO_ADMIN_CREDENTIALS_MESSAGE =
  "Skipped: set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (a dev admin account on dpnnmkhabysfdogllsyh only — never production) to run the admin role-coverage flows.";

/**
 * A dev campaign the E2E_USER account can NOT write to (WP1.6 §2.7.3). Found
 * by the discovery query in scripts/data-hygiene/oux-wp1.6/95_role_probes.sql;
 * never hard-coded because WP0.4's backfill changes which campaigns qualify.
 */
export const E2E_FOREIGN_CAMPAIGN_ID = process.env.E2E_FOREIGN_CAMPAIGN_ID ?? "";
export const hasE2EForeignCampaign = /^\d+$/.test(E2E_FOREIGN_CAMPAIGN_ID);

export const NO_FOREIGN_CAMPAIGN_MESSAGE =
  "Skipped: set E2E_FOREIGN_CAMPAIGN_ID to a dev campaign id the E2E_USER account cannot write to (from the 95_role_probes.sql discovery query).";
