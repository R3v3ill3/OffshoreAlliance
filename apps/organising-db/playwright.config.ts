import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the organising-db app (WP0.2).
 *
 * Deliberately no `webServer` block: the operator points E2E_BASE_URL at
 * whatever is already running (a dev server, `pnpm start`, or a preview URL).
 * Starting one here would fight an already-running dev server on port 3000.
 *
 * `devices["Desktop Chrome"]` matters. `src/app/layout.tsx` derives `isMobile`
 * from the request user-agent and `data-table.tsx` branches on it, so only a
 * desktop context renders the <table> the wall-chart spec clicks.
 */

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** Written by global setup — always exists, even with no credentials. */
export const STORAGE_STATE = "tests/e2e/.auth/user.json";

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
