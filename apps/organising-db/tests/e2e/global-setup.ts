import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { chromium } from "@playwright/test";

import { ADMIN_STORAGE_STATE, E2E_BASE_URL, REST_CONFIG_PATH, STORAGE_STATE } from "../../playwright.config";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_USER_EMAIL,
  E2E_USER_PASSWORD,
  NO_ADMIN_CREDENTIALS_MESSAGE,
  NO_CREDENTIALS_MESSAGE,
  hasE2EAdminCredentials,
  hasE2ECredentials,
} from "./env";

const EMPTY_STORAGE_STATE = { cookies: [], origins: [] };

/**
 * The Supabase REST origin and public anon key, captured from the first
 * request the app makes to its Supabase project during sign-in (the
 * `apikey` header is the anon key, which the app ships in its bundle). The
 * WP1.6 role specs use it to sweep/delete their own fixtures through the
 * `delete_campaign` RPC with the signed-in session's token (tests/e2e/roles/
 * campaign-cleanup.ts), which also checks the origin against the session
 * cookie's project ref before any call.
 */
let capturedRestConfig: { supabaseUrl: string; anonKey: string } | null = null;

/**
 * Signs in once per account and saves the session for every spec
 * (WP0.2; second account added by WP1.6).
 *
 * A file is ALWAYS written at each storage-state path, even with no
 * credentials: Playwright resolves `use.storageState` before any test can
 * call `test.skip`, so a missing file errors the whole run instead of
 * skipping it.
 *
 * This never throws on missing credentials. The specs' own guards turn that
 * into a clean skip.
 */
async function signIn(email: string, password: string, storagePath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("request", (req) => {
      if (capturedRestConfig) return;
      const url = req.url();
      if (!/^https:\/\/[a-z0-9]+\.supabase\.co\//.test(url)) return;
      const anonKey = req.headers()["apikey"];
      if (!anonKey) return;
      capturedRestConfig = { supabaseUrl: new URL(url).origin, anonKey };
    });

    await page.goto(new URL("/login", E2E_BASE_URL).toString());
    // Selectors from src/app/(auth)/login/page.tsx.
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    // login/page.tsx pushes /campaigns on success; middleware also bounces a
    // signed-in /login there.
    await page.waitForURL(/\/campaigns(\?|$)/, { timeout: 30_000 });

    await context.storageState({ path: storagePath });
  } finally {
    await browser.close();
  }
}

function writeEmptyState(storagePath: string): void {
  mkdirSync(dirname(storagePath), { recursive: true });
  writeFileSync(storagePath, JSON.stringify(EMPTY_STORAGE_STATE), "utf8");
}

export default async function globalSetup(): Promise<void> {
  const userPath = resolve(__dirname, "../..", STORAGE_STATE);
  const adminPath = resolve(__dirname, "../..", ADMIN_STORAGE_STATE);
  const restPath = resolve(__dirname, "../..", REST_CONFIG_PATH);
  writeEmptyState(userPath);
  writeEmptyState(adminPath);
  // Never leave a previous run's REST config behind: it must describe the
  // project the sessions written below belong to.
  rmSync(restPath, { force: true });

  if (hasE2ECredentials) {
    await signIn(E2E_USER_EMAIL, E2E_USER_PASSWORD, userPath);
  } else {
    console.log(NO_CREDENTIALS_MESSAGE);
  }

  if (hasE2EAdminCredentials) {
    await signIn(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, adminPath);
  } else {
    console.log(NO_ADMIN_CREDENTIALS_MESSAGE);
  }

  if (capturedRestConfig) {
    writeFileSync(restPath, JSON.stringify(capturedRestConfig), "utf8");
  }
}
