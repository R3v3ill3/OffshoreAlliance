/**
 * DA0.3 contract suite (docs/data-architecture/wp/da0.3.md §2.6.3).
 *
 * Database-backed: runs against NORMAL DEV through the real PostgREST / RPC
 * path with two signed-in accounts and the service role for seeding. Never
 * against production — the suite THROWS on the production host and on
 * missing variables (no "green because nothing ran"). Values live in the
 * shell only, never in a file.
 *
 *   OUX_CONTRACT_SUPABASE_URL           https://<dev-ref>.supabase.co
 *   OUX_CONTRACT_SUPABASE_ANON_KEY      the project's anon key
 *   OUX_CONTRACT_SERVICE_ROLE_KEY       the project's service-role key (seeding + cleanup only)
 *   OUX_CONTRACT_USER_EMAIL / _PASSWORD          a user-role account (A8)
 *   OUX_CONTRACT_ADMIN_EMAIL / _PASSWORD         a dev admin account (decides)
 *
 * Fixture (beforeAll, service role): one import_logs row, four synthetic
 * workers (reference_id 'DA03-C-<run>-n', names 'Fixture' / 'Person n', no
 * email / phone) and one employer queue row + a sibling row from no import.
 * afterAll removes every seeded row and every alias the decisions wrote and
 * asserts nothing is left. Organisation strings and ids only.
 *
 * Run: `pnpm test:contract src/lib/import/__contract__/name-match-reviews.contract.test.ts`
 * (from apps/organising-db).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FOLD_PARITY_CASES } from "../__tests__/fixtures/fold-parity";
import { foldName } from "../name-fold";
import { loadReferenceSet, resolveNames } from "../resolve-names";

// ---------------------------------------------------------------------------
// Environment (throws, never skips)
// ---------------------------------------------------------------------------

const PRODUCTION_HOST = "gteygwfgjvczanmrwgbr.supabase.co";
const REQUIRED = [
  "OUX_CONTRACT_SUPABASE_URL",
  "OUX_CONTRACT_SUPABASE_ANON_KEY",
  "OUX_CONTRACT_SERVICE_ROLE_KEY",
  "OUX_CONTRACT_USER_EMAIL",
  "OUX_CONTRACT_USER_PASSWORD",
  "OUX_CONTRACT_ADMIN_EMAIL",
  "OUX_CONTRACT_ADMIN_PASSWORD",
] as const;

interface Credentials {
  email: string;
  password: string;
}

function readEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `DA0.3 contract suite: missing ${missing.join(", ")}. Set the OUX_CONTRACT_* variables in the shell (normal dev only; never production, never a file).`
    );
  }
  const url = process.env.OUX_CONTRACT_SUPABASE_URL!;
  if (new URL(url).host === PRODUCTION_HOST) {
    throw new Error("DA0.3 contract suite: refusing to run against the PRODUCTION project.");
  }
  return {
    url,
    anonKey: process.env.OUX_CONTRACT_SUPABASE_ANON_KEY!,
    serviceKey: process.env.OUX_CONTRACT_SERVICE_ROLE_KEY!,
    user: { email: process.env.OUX_CONTRACT_USER_EMAIL!, password: process.env.OUX_CONTRACT_USER_PASSWORD! },
    admin: { email: process.env.OUX_CONTRACT_ADMIN_EMAIL!, password: process.env.OUX_CONTRACT_ADMIN_PASSWORD! },
  };
}

const env = readEnv();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const RAW = `DA0.3 Contract Co ${runId}`;
const RAW_OTHER = `DA0.3 Contract Other ${runId}`;
const CREATE_NAME = `DA0.3 Contract Created ${runId}`;

let service: Client;
let admin: Client;
let user: Client;
let importId = 0;
let targetEmployerId = 0;
let targetEmployerName = "";
let otherEmployerId = 0;
let otherEmployerName = "";
let reviewId = 0;
let siblingId = 0;
let unmatchedId = 0;
const workerIds: number[] = [];
let createdEmployerId: number | null = null;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what}: no data`);
  return res.data;
}

async function signIn(creds: Credentials, who: string): Promise<Client> {
  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const res = await client.auth.signInWithPassword({ email: creds.email, password: creds.password });
  if (res.error || !res.data.session) {
    throw new Error(`DA0.3 contract suite: ${who} sign-in failed: ${res.error?.message ?? "no session"}`);
  }
  return client;
}

async function roleOf(client: Client, who: string): Promise<string> {
  const res = await client.rpc("get_user_role");
  if (res.error) throw new Error(`DA0.3 contract suite: get_user_role for ${who}: ${res.error.message}`);
  return String(res.data);
}

interface DecideResult {
  review: { id: number; status: string; match_method: string | null; resolved_employer_id: number | null; decided_at: string | null };
  alias_written: boolean;
  backfilled_worker_ids: number[];
  siblings_resolved: number;
}

async function decide(client: Client, payload: Record<string, unknown>) {
  return client.rpc("decide_name_match", { payload });
}

beforeAll(async () => {
  service = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  admin = await signIn(env.admin, "admin");
  user = await signIn(env.user, "user");
  expect(await roleOf(admin, "admin")).toBe("admin");
  expect(await roleOf(user, "user")).toBe("user");

  const employers = unwrap(
    await service.from("employers").select("employer_id, employer_name").eq("is_active", true).order("employer_id").limit(2),
    "employers"
  ) as { employer_id: number; employer_name: string }[];
  if (employers.length < 2) throw new Error("DA0.3 contract suite: need two active employers on dev");
  targetEmployerId = employers[0].employer_id;
  targetEmployerName = employers[0].employer_name;
  otherEmployerId = employers[1].employer_id;
  otherEmployerName = employers[1].employer_name;

  const {
    data: { user: adminUser },
  } = await admin.auth.getUser();

  const log = unwrap(
    await service
      .from("import_logs")
      .insert({ file_name: `DA0.3 contract ${runId}`, import_type: "membership_status_sync", imported_by: adminUser?.id ?? null })
      .select("import_id")
      .single(),
    "import_logs insert"
  ) as { import_id: number };
  importId = log.import_id;

  const workers = unwrap(
    await service
      .from("workers")
      .insert([
        { first_name: "Fixture", last_name: "Person 1", reference_id: `DA03-C-${runId}-1`, employer_name_raw: RAW, names_import_id: importId, is_active: true },
        { first_name: "Fixture", last_name: "Person 2", reference_id: `DA03-C-${runId}-2`, employer_name_raw: RAW.toUpperCase(), names_import_id: importId, is_active: true },
        { first_name: "Fixture", last_name: "Person 3", reference_id: `DA03-C-${runId}-3`, employer_name_raw: RAW, names_import_id: importId, employer_id: otherEmployerId, is_active: true },
        { first_name: "Fixture", last_name: "Person 4", reference_id: `DA03-C-${runId}-4`, employer_name_raw: RAW_OTHER, names_import_id: importId, is_active: true },
      ])
      .select("worker_id")
      .order("worker_id"),
    "workers insert"
  ) as { worker_id: number }[];
  workerIds.push(...workers.map((w) => w.worker_id));

  const reviews = unwrap(
    await service
      .from("name_match_reviews")
      .insert([
        {
          entity: "employer",
          raw_name: RAW,
          normalised_name: foldName(RAW),
          import_id: importId,
          status: "needs_review",
          match_score: 0.8,
          candidate_proposals: [{ id: targetEmployerId, name: targetEmployerName, score: 0.8, is_principal: false }],
          occurrences: 3,
          created_by: adminUser?.id ?? null,
        },
        {
          entity: "employer",
          raw_name: RAW,
          normalised_name: foldName(RAW),
          import_id: null,
          status: "needs_review",
          candidate_proposals: [{ id: targetEmployerId, name: targetEmployerName, score: 0.8, is_principal: false }],
          occurrences: 1,
        },
        {
          entity: "employer",
          raw_name: RAW_OTHER,
          normalised_name: foldName(RAW_OTHER),
          import_id: importId,
          status: "unmatched",
          candidate_proposals: [],
          occurrences: 1,
        },
      ])
      .select("id, import_id, raw_name")
      .order("id"),
    "name_match_reviews insert"
  ) as { id: number; import_id: number | null; raw_name: string }[];
  reviewId = reviews.find((r) => r.raw_name === RAW && r.import_id === importId)!.id;
  siblingId = reviews.find((r) => r.raw_name === RAW && r.import_id === null)!.id;
  unmatchedId = reviews.find((r) => r.raw_name === RAW_OTHER)!.id;
});

afterAll(async () => {
  if (!service) return;
  const ids = [reviewId, siblingId, unmatchedId].filter((n) => n > 0);
  if (ids.length > 0) await service.from("name_match_reviews").delete().in("id", ids);
  for (const raw of [RAW, RAW_OTHER]) {
    await service.from("employer_name_aliases").delete().ilike("alias_name", raw);
  }
  if (workerIds.length > 0) await service.from("workers").delete().in("worker_id", workerIds);
  if (createdEmployerId != null) await service.from("employers").delete().eq("employer_id", createdEmployerId);
  if (importId > 0) await service.from("import_logs").delete().eq("import_id", importId);
  const leftovers = unwrap(await service.from("workers").select("worker_id").like("reference_id", `DA03-C-${runId}-%`), "leftover workers") as unknown[];
  expect(leftovers).toHaveLength(0);
  const leftoverAliases = unwrap(await service.from("employer_name_aliases").select("id").ilike("alias_name", `DA0.3 Contract%${runId}%`), "leftover aliases") as unknown[];
  expect(leftoverAliases).toHaveLength(0);
});

describe("fold_name() parity (§2.3.2)", () => {
  it.each(FOLD_PARITY_CASES)("SQL fold_name equals foldName for %j", async ({ input, folded }) => {
    const res = await admin.rpc("fold_name", { p: input });
    expect(res.error).toBeNull();
    expect(res.data).toBe(folded);
    expect(foldName(input)).toBe(folded);
  });
});

describe("(a) employer_name_aliases admits source = 'import'", () => {
  it("an admin insert with source 'import' succeeds and is removed again", async () => {
    const inserted = await admin
      .from("employer_name_aliases")
      .insert({ employer_id: targetEmployerId, alias_name: `DA0.3 Contract Alias ${runId}`, source: "import" })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();
    const id = (inserted.data as { id: number }).id;
    const removed = await service.from("employer_name_aliases").delete().eq("id", id);
    expect(removed.error).toBeNull();
  });
});

describe("role coverage (A8)", () => {
  it("a user-role account can read the queue", async () => {
    const res = await user.from("name_match_reviews").select("id, entity, raw_name, status").eq("id", reviewId);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
  });

  it("a user-role account cannot decide (Only admins…)", async () => {
    const res = await decide(user, { id: reviewId, action: "reject" });
    expect(res.error?.message ?? "").toMatch(/Only admins/);
  });

  it("the anon role has no access to the table", async () => {
    const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const res = await anon.from("name_match_reviews").select("id").limit(1);
    expect(res.error?.code).toBe("42501");
  });
});

describe("decide_name_match (A5, A9)", () => {
  it("override writes the alias, back-fills exactly the two null-FK workers and resolves the sibling", async () => {
    const res = await decide(admin, { id: reviewId, action: "override", employer_id: targetEmployerId, notes: "contract override" });
    expect(res.error).toBeNull();
    const result = res.data as DecideResult;
    expect(result.alias_written).toBe(true);
    expect(result.backfilled_worker_ids).toEqual([workerIds[0], workerIds[1]]);
    expect(result.siblings_resolved).toBe(1);
    expect(result.review.status).toBe("overridden");
    expect(result.review.match_method).toBe("manual");
    expect(result.review.resolved_employer_id).toBe(targetEmployerId);

    const alias = unwrap(
      await service.from("employer_name_aliases").select("employer_id, source").ilike("alias_name", RAW),
      "alias"
    ) as { employer_id: number; source: string }[];
    expect(alias).toEqual([{ employer_id: targetEmployerId, source: "import" }]);

    const rows = unwrap(
      await service.from("workers").select("worker_id, employer_id").in("worker_id", workerIds).order("worker_id"),
      "workers"
    ) as { worker_id: number; employer_id: number | null }[];
    expect(rows.map((r) => r.employer_id)).toEqual([targetEmployerId, targetEmployerId, otherEmployerId, null]);

    const sibling = unwrap(await service.from("name_match_reviews").select("status, resolved_employer_id, notes").eq("id", siblingId).single(), "sibling") as {
      status: string;
      resolved_employer_id: number | null;
      notes: string | null;
    };
    expect(sibling.status).toBe("overridden");
    expect(sibling.resolved_employer_id).toBe(targetEmployerId);
    expect(sibling.notes).toBe(`resolved with review ${reviewId}`);
  });

  it("second-replay invariant: the raw string now resolves as an alias", async () => {
    const ref = await loadReferenceSet(service, "employer");
    const [outcome] = resolveNames("employer", [`  ${RAW.toUpperCase()} `], ref);
    expect(outcome.status).toBe("alias");
    expect(outcome.resolvedId).toBe(targetEmployerId);
  });

  it("reopen clears the decision but keeps the alias and the back-fill", async () => {
    const res = await decide(admin, { id: reviewId, action: "reopen" });
    expect(res.error).toBeNull();
    const row = (res.data as DecideResult).review;
    expect(row.status).toBe("needs_review");
    expect(row.decided_at).toBeNull();
    expect(row.resolved_employer_id).toBeNull();
    const alias = unwrap(await service.from("employer_name_aliases").select("id").ilike("alias_name", RAW), "alias") as unknown[];
    expect(alias).toHaveLength(1);
    const w1 = unwrap(await service.from("workers").select("employer_id").eq("worker_id", workerIds[0]).single(), "w1") as { employer_id: number | null };
    expect(w1.employer_id).toBe(targetEmployerId);
  });

  it("reject is sticky: the resolver returns rejected for the string afterwards", async () => {
    const res = await decide(admin, { id: reviewId, action: "reject", notes: "not an employer" });
    expect(res.error).toBeNull();
    expect((res.data as DecideResult).review.status).toBe("rejected");
    // the alias written earlier still wins in the resolver order? No: rejected memory is checked first.
    const ref = await loadReferenceSet(service, "employer");
    const [outcome] = resolveNames("employer", [RAW], ref);
    expect(outcome.status).toBe("rejected");
  });

  it("confirm refuses a target that is not one of the proposals (A6): use override", async () => {
    const res = await decide(admin, { id: unmatchedId, action: "confirm", employer_id: targetEmployerId });
    expect(res.error?.message ?? "").toMatch(/not one of the proposals; use override/);
    const row = unwrap(await service.from("name_match_reviews").select("status").eq("id", unmatchedId).single(), "row") as { status: string };
    expect(row.status).toBe("unmatched");
  });

  it("create with a name that already exists raises the verbatim message", async () => {
    const res = await decide(admin, { id: unmatchedId, action: "create", create: { employer_name: otherEmployerName } });
    expect(res.error?.message ?? "").toMatch(/already exists — search for it instead/);
    const row = unwrap(await service.from("name_match_reviews").select("status").eq("id", unmatchedId).single(), "row") as { status: string };
    expect(row.status).toBe("unmatched");
  });

  it("create makes the row and back-fills the worker that carried the string", async () => {
    const res = await decide(admin, { id: unmatchedId, action: "create", create: { employer_name: CREATE_NAME, employer_category: "Subcontractor" } });
    expect(res.error).toBeNull();
    const result = res.data as DecideResult;
    createdEmployerId = result.review.resolved_employer_id;
    expect(createdEmployerId).not.toBeNull();
    expect(result.review.status).toBe("confirmed");
    expect(result.review.match_method).toBe("created");
    expect(result.backfilled_worker_ids).toEqual([workerIds[3]]);
    expect(result.alias_written).toBe(true);
  });
});
