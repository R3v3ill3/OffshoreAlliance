import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the organising-db app (WP0.2, WP1.6).
 *
 * Deliberately no `webServer` block: the operator points E2E_BASE_URL at
 * whatever is already running (a dev server, `pnpm start`, or a preview URL).
 * Starting one here would fight an already-running dev server on port 3000.
 *
 * `devices["Desktop Chrome"]` matters. `src/app/layout.tsx` derives `isMobile`
 * from the request user-agent and `data-table.tsx` branches on it, so only a
 * desktop context renders the <table> the wall-chart spec clicks.
 *
 * Two projects (WP1.6 role coverage): `chromium` runs everything except the
 * `tests/e2e/roles/*-admin.spec.ts` files as the E2E_USER account;
 * `chromium-admin` runs only those files as the E2E_ADMIN account. The
 * testIgnore/testMatch pair is what stops the existing specs running twice.
 */

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** Written by global setup — always exists, even with no credentials. */
export const STORAGE_STATE = "tests/e2e/.auth/user.json";
/** Written by global setup — always exists, even with no admin credentials. */
export const ADMIN_STORAGE_STATE = "tests/e2e/.auth/admin.json";

const ADMIN_SPECS = /roles\/.*-admin\.spec\.ts$/;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    storageState: STORAGE_STATE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      testIgnore: ADMIN_SPECS,
    },
    {
      name: "chromium-admin",
      use: { ...devices["Desktop Chrome"], storageState: ADMIN_STORAGE_STATE },
      testMatch: ADMIN_SPECS,
    },
  ],
});
