import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { chromium } from "@playwright/test";

import { E2E_BASE_URL, STORAGE_STATE } from "../../playwright.config";
import {
  E2E_USER_EMAIL,
  E2E_USER_PASSWORD,
  NO_CREDENTIALS_MESSAGE,
  hasE2ECredentials,
} from "./env";

const EMPTY_STORAGE_STATE = { cookies: [], origins: [] };

/**
 * Signs in once and saves the session for every spec (WP0.2).
 *
 * A file is ALWAYS written at STORAGE_STATE, even with no credentials:
 * Playwright resolves `use.storageState` before any test can call `test.skip`,
 * so a missing file errors the whole run instead of skipping it.
 *
 * This never throws on missing credentials. The specs' own guards turn that
 * into a clean skip.
 */
export default async function globalSetup(): Promise<void> {
  const storagePath = resolve(__dirname, "../..", STORAGE_STATE);
  mkdirSync(dirname(storagePath), { recursive: true });
  writeFileSync(storagePath, JSON.stringify(EMPTY_STORAGE_STATE), "utf8");

  if (!hasE2ECredentials) {
    console.log(NO_CREDENTIALS_MESSAGE);
    return;
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(new URL("/login", E2E_BASE_URL).toString());
    // Selectors from src/app/(auth)/login/page.tsx.
    await page.locator("#email").fill(E2E_USER_EMAIL);
    await page.locator("#password").fill(E2E_USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    // login/page.tsx pushes /campaigns on success; middleware also bounces a
    // signed-in /login there.
    await page.waitForURL(/\/campaigns(\?|$)/, { timeout: 30_000 });

    await context.storageState({ path: storagePath });
  } finally {
    await browser.close();
  }
}
