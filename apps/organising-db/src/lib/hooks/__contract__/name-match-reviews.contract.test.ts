/**
 * DA0.3 hooks contract suite (docs/data-architecture/wp/da0.3.md §2.6.3,
 * §2.6.4): every PostgREST string the Name Reviews page emits, executed
 * against NORMAL DEV through the page's own query builders, as the
 * `user`-role account (the read-only organiser the page must serve) and as
 * the admin. A PostgREST error (PGRST200/201 embed ambiguity, a parse error,
 * a permission error for an authenticated reader) fails; an empty array
 * passes. Read-only: nothing is written.
 *
 * Never against production — THROWS on the production host and on missing
 * variables (no "green because nothing ran"). Values live in the shell only.
 *
 *   OUX_CONTRACT_SUPABASE_URL          https://<dev-ref>.supabase.co
 *   OUX_CONTRACT_SUPABASE_ANON_KEY     the project's anon key
 *   OUX_CONTRACT_USER_EMAIL / _PASSWORD          a user-role account
 *   OUX_CONTRACT_ADMIN_EMAIL / _PASSWORD         a dev admin account
 *
 * Run: `pnpm test:contract src/lib/hooks/__contract__/name-match-reviews.contract.test.ts`
 * (from apps/organising-db).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import {
  nameMatchReviewsQuery,
  nameReviewDecidersQuery,
  nameReviewImportsQuery,
  type NameReviewEntity,
  type NameReviewStatusFilter,
} from "../useNameMatchReviews";
import {
  employerAliasSearchQuery,
  employerSearchQuery,
  worksiteAliasSearchQuery,
  worksiteSearchQuery,
} from "../useNameEntitySearch";

const PRODUCTION_HOST = "gteygwfgjvczanmrwgbr.supabase.co";
const REQUIRED = [
  "OUX_CONTRACT_SUPABASE_URL",
  "OUX_CONTRACT_SUPABASE_ANON_KEY",
  "OUX_CONTRACT_USER_EMAIL",
  "OUX_CONTRACT_USER_PASSWORD",
  "OUX_CONTRACT_ADMIN_EMAIL",
  "OUX_CONTRACT_ADMIN_PASSWORD",
] as const;

function readEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `DA0.3 hooks contract suite: missing ${missing.join(", ")}. Set the OUX_CONTRACT_* variables in the shell (normal dev only; never production, never a file).`
    );
  }
  const url = process.env.OUX_CONTRACT_SUPABASE_URL!;
  if (new URL(url).host === PRODUCTION_HOST) {
    throw new Error("DA0.3 hooks contract suite: refusing to run against the PRODUCTION project.");
  }
  return {
    url,
    anonKey: process.env.OUX_CONTRACT_SUPABASE_ANON_KEY!,
    user: { email: process.env.OUX_CONTRACT_USER_EMAIL!, password: process.env.OUX_CONTRACT_USER_PASSWORD! },
    admin: { email: process.env.OUX_CONTRACT_ADMIN_EMAIL!, password: process.env.OUX_CONTRACT_ADMIN_PASSWORD! },
  };
}

const env = readEnv();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

async function signIn(creds: { email: string; password: string }, who: string): Promise<Client> {
  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const res = await client.auth.signInWithPassword(creds);
  if (res.error || !res.data.session) {
    throw new Error(`DA0.3 hooks contract suite: ${who} sign-in failed: ${res.error?.message ?? "no session"}`);
  }
  return client;
}

interface Outcome {
  data: unknown;
  error: { code?: string; message: string } | null;
}

function expectNoPostgrestError(res: Outcome, what: string): unknown[] {
  if (res.error) {
    throw new Error(`${what}: ${res.error.code ?? ""} ${res.error.message}`);
  }
  expect(Array.isArray(res.data)).toBe(true);
  return res.data as unknown[];
}

const ENTITIES: NameReviewEntity[] = ["employer", "worksite"];
const STATUSES: NameReviewStatusFilter[] = ["open", "auto", "decided", "all"];
/** Includes the characters the `or=(…)` grammar reserves (sanitised by `ilikePattern`). */
const SEARCHES = ["zzq-da03", "Acme (WA), Pty. Ltd", 'Acme "Marine"\\x'];

describe.each([
  ["user", () => env.user],
  ["admin", () => env.admin],
] as const)("Name Reviews PostgREST strings as %s", (who, creds) => {
  let client: Client;

  beforeAll(async () => {
    client = await signIn(creds(), who);
  });

  it("P1 name_match_reviews with three unhinted embeds, every entity × status filter, with and without an import", async () => {
    for (const entity of ENTITIES) {
      for (const status of STATUSES) {
        for (const importId of [null, 2147483647]) {
          const rows = expectNoPostgrestError(
            await nameMatchReviewsQuery(client, { entity, status, importId }),
            `P1 ${entity}/${status}/${importId}`
          );
          for (const row of rows as Record<string, unknown>[]) {
            expect(row).toHaveProperty("import_logs");
            expect(row).toHaveProperty("employers");
            expect(row).toHaveProperty("worksites");
          }
        }
      }
    }
  });

  it("P2–P5 entity and alias search", async () => {
    for (const q of SEARCHES) {
      expectNoPostgrestError(await employerSearchQuery(client, q), `P2 ${q}`);
      expectNoPostgrestError(await employerAliasSearchQuery(client, q), `P3 ${q}`);
      expectNoPostgrestError(await worksiteSearchQuery(client, q), `P4 ${q}`);
      expectNoPostgrestError(await worksiteAliasSearchQuery(client, q), `P5 ${q}`);
    }
  });

  it("P6 import filter", async () => {
    expectNoPostgrestError(await nameReviewImportsQuery(client), "P6");
  });

  it("P9 decided-by names", async () => {
    expectNoPostgrestError(
      await nameReviewDecidersQuery(client, ["00000000-0000-0000-0000-000000000000"]),
      "P9"
    );
  });
});
