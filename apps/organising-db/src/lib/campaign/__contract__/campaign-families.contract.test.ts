/**
 * WP3.8 campaign-families contract suite (docs/organiser-ux-review/wp/wp3.8.md §4.2).
 *
 * Database-backed: runs against NORMAL DEV through the real PostgREST/RPC path
 * with three signed-in accounts. Never against production — the suite THROWS
 * on the production host and on missing variables (no "green because nothing
 * ran"). Not run in Stage 1 (no database); Stage 2 runs it after the WP3.8
 * migration is on dev, Stage 3 runs it again after the reader switch.
 *
 *   OUX_CONTRACT_SUPABASE_URL          https://<dev-ref>.supabase.co
 *   OUX_CONTRACT_SUPABASE_ANON_KEY     the project's anon key
 *   OUX_CONTRACT_USER_EMAIL / _PASSWORD          a user-role account
 *   OUX_CONTRACT_FOREIGN_USER_EMAIL / _PASSWORD  REQUIRED here: a second
 *                                      user-role account; it creates the child
 *                                      C, so C's only writer besides admins is
 *                                      this account (created_by default,
 *                                      20260909120000:119–121)
 *   OUX_CONTRACT_ADMIN_EMAIL / _PASSWORD         NEW (wp3.8.md §9.1 CA): the dev
 *                                      admin account the e2e suite uses; it
 *                                      creates the parent P and the sibling S
 *   OUX_CONTRACT_WORKER_IDS            optional: comma-separated worker ids to
 *                                      use as members (default: the first six
 *                                      workers by id)
 *   OUX_CONTRACT_FOREIGN_CAMPAIGN_ID   accepted for a shared shell with the
 *                                      WP2.2 suite; not used here
 *
 * Fixture (beforeAll), created through the same REST insert the e2e cleanup
 * helper and the WP2.2 suite use (tests/e2e/roles/campaign-cleanup.ts:106–113;
 * not a product creation path): the admin creates parent P, the foreign user
 * creates child C, the admin creates sibling S and links C and S to P, then
 * creates on P one `assessment` activity F with scope = 'family' and one O
 * with scope = 'campaign', and inserts memberships w1, w2 → C; w1, w3 → P;
 * w4 → S. afterAll: the admin flips any is_standing / is_sms_episode fixture
 * row back to false, then delete_campaign on every fixture campaign
 * (20260909130000:76–128; cascades activities and ratings) and asserts zero
 * leftover rows by name.
 *
 * Every assertion reads the database state after the call (wp2.2.md
 * §4.2 discipline). Values live in the shell only, never in a file.
 *
 * Run: `pnpm test:contract src/lib/campaign/__contract__/campaign-families.contract.test.ts`
 * (from apps/organising-db).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { familyActivityFilter } from "../families";

// ---------------------------------------------------------------------------
// Environment (throws, never skips)
// ---------------------------------------------------------------------------

const PRODUCTION_HOST = "gteygwfgjvczanmrwgbr.supabase.co";
const REQUIRED = [
  "OUX_CONTRACT_SUPABASE_URL",
  "OUX_CONTRACT_SUPABASE_ANON_KEY",
  "OUX_CONTRACT_USER_EMAIL",
  "OUX_CONTRACT_USER_PASSWORD",
  "OUX_CONTRACT_FOREIGN_USER_EMAIL",
  "OUX_CONTRACT_FOREIGN_USER_PASSWORD",
  "OUX_CONTRACT_ADMIN_EMAIL",
  "OUX_CONTRACT_ADMIN_PASSWORD",
] as const;

interface Credentials {
  email: string;
  password: string;
}

interface ContractEnv {
  url: string;
  anonKey: string;
  user: Credentials;
  foreign: Credentials;
  admin: Credentials;
  workerIds: number[] | null;
}

function readEnv(): ContractEnv {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `WP3.8 contract suite: missing ${missing.join(", ")}. Set the OUX_CONTRACT_* variables in the shell (normal dev only; never production, never a file).`
    );
  }
  const url = process.env.OUX_CONTRACT_SUPABASE_URL!;
  const host = new URL(url).host;
  if (host === PRODUCTION_HOST) {
    throw new Error("WP3.8 contract suite: refusing to run against the PRODUCTION project.");
  }
  const user = { email: process.env.OUX_CONTRACT_USER_EMAIL!, password: process.env.OUX_CONTRACT_USER_PASSWORD! };
  const foreign = {
    email: process.env.OUX_CONTRACT_FOREIGN_USER_EMAIL!,
    password: process.env.OUX_CONTRACT_FOREIGN_USER_PASSWORD!,
  };
  const admin = { email: process.env.OUX_CONTRACT_ADMIN_EMAIL!, password: process.env.OUX_CONTRACT_ADMIN_PASSWORD! };
  const distinct = new Set([user.email, foreign.email, admin.email].map((e) => e.trim().toLowerCase()));
  if (distinct.size !== 3) {
    throw new Error("WP3.8 contract suite: the user, foreign-user and admin accounts must be three different accounts.");
  }
  const workerIdsRaw = process.env.OUX_CONTRACT_WORKER_IDS ?? "";
  return {
    url,
    anonKey: process.env.OUX_CONTRACT_SUPABASE_ANON_KEY!,
    user,
    foreign,
    admin,
    workerIds: workerIdsRaw
      ? workerIdsRaw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)
      : null,
  };
}

const env = readEnv();

// ---------------------------------------------------------------------------
// Fixture state
// ---------------------------------------------------------------------------

// The app's own clients are `SupabaseClient<any>` (lib/supabase/client.ts /
// server.ts); the suite uses the same untyped shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const NAME_PREFIX = "WP3.8 contract ";
const name = (what: string) => `${NAME_PREFIX}${what} ${runId}`;

let admin: Client;
let user: Client;
let foreign: Client;

/** P, C, S and every fresh campaign a test creates; deleted in afterAll. */
const fixtureCampaignIds = new Set<number>();
let P = 0;
let C = 0;
let S = 0;
let F = 0;
let O = 0;
let w1 = 0;
let w2 = 0;
let w3 = 0;
let w4 = 0;

interface PgError {
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
}

interface CampaignRow {
  campaign_id: number;
  parent_campaign_id: number | null;
  is_sms_episode: boolean;
  is_standing: boolean;
}

interface SummaryRow {
  campaign_id: number;
  worker_id: number;
  cumulative_rating: number | null;
  last_activity_rating: number | null;
  has_supportive_activity_rating: boolean;
  supportive_activity_count: number;
}

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
    throw new Error(`WP3.8 contract suite: ${who} sign-in failed: ${res.error?.message ?? "no session"}`);
  }
  return client;
}

async function roleOf(client: Client, who: string): Promise<string> {
  const res = await client.rpc("get_user_role");
  if (res.error) throw new Error(`WP3.8 contract suite: get_user_role for ${who}: ${res.error.message}`);
  return String(res.data);
}

/** REST insert of a campaign (the e2e cleanup helper's shape); tracked for afterAll. */
async function createCampaign(client: Client, what: string, extra: Record<string, unknown> = {}): Promise<number> {
  const row = unwrap(
    await client
      .from("campaigns")
      .insert({ name: name(what), campaign_type: "organising", status: "planning", ...extra })
      .select("campaign_id")
      .single(),
    `insert campaign ${what}`
  ) as { campaign_id: number };
  fixtureCampaignIds.add(row.campaign_id);
  return row.campaign_id;
}

/** An insert that is expected to be refused: returns the error (and tracks the row if it slipped through). */
async function tryCreateCampaign(client: Client, what: string, extra: Record<string, unknown>): Promise<PgError | null> {
  const res = await client
    .from("campaigns")
    .insert({ name: name(what), campaign_type: "organising", status: "planning", ...extra })
    .select("campaign_id")
    .single();
  if (!res.error && res.data) fixtureCampaignIds.add((res.data as { campaign_id: number }).campaign_id);
  return (res.error as PgError | null) ?? null;
}

async function createActivity(client: Client, campaignId: number, what: string, scope: "campaign" | "family"): Promise<number> {
  const row = unwrap(
    await client
      .from("campaign_activities")
      .insert({ campaign_id: campaignId, title: name(what), activity_kind: "assessment", scope })
      .select("activity_id")
      .single(),
    `insert activity ${what}`
  ) as { activity_id: number };
  return row.activity_id;
}

async function campaignRow(client: Client, id: number): Promise<CampaignRow | null> {
  const res = await client
    .from("campaigns")
    .select("campaign_id, parent_campaign_id, is_sms_episode, is_standing")
    .eq("campaign_id", id)
    .maybeSingle();
  if (res.error) throw new Error(`select campaign ${id}: ${res.error.message}`);
  return (res.data as CampaignRow | null) ?? null;
}

async function parentOf(id: number): Promise<number | null> {
  const row = await campaignRow(admin, id);
  if (!row) throw new Error(`campaign ${id} is gone`);
  return row.parent_campaign_id;
}

async function updateCampaign(client: Client, id: number, patch: Record<string, unknown>): Promise<PgError | null> {
  const res = await client.from("campaigns").update(patch).eq("campaign_id", id);
  return (res.error as PgError | null) ?? null;
}

async function familyIds(client: Client, campaignId: number): Promise<number[]> {
  const res = await client.rpc("campaign_family_activity_ids", { p_campaign_id: campaignId });
  if (res.error) throw new Error(`campaign_family_activity_ids(${campaignId}): ${res.error.message}`);
  const rows: unknown[] = Array.isArray(res.data) ? res.data : [];
  return rows.map((n) => Number(n)).sort((a, b) => a - b);
}

async function ownActivityIds(client: Client, campaignId: number): Promise<number[]> {
  const res = await client.from("campaign_activities").select("activity_id").eq("campaign_id", campaignId);
  return (unwrap(res, `select activities of ${campaignId}`) as { activity_id: number }[])
    .map((r) => r.activity_id)
    .sort((a, b) => a - b);
}

async function ratingsOn(client: Client, activityId: number, workerId?: number): Promise<{ rating_id: number; worker_id: number; rating: number | null }[]> {
  let q = client.from("campaign_activity_ratings").select("rating_id, worker_id, rating").eq("activity_id", activityId);
  if (workerId != null) q = q.eq("worker_id", workerId);
  return unwrap(await q.order("rating_id"), `select ratings on ${activityId}`) as { rating_id: number; worker_id: number; rating: number | null }[];
}

async function summaryFor(client: Client, campaignId: number): Promise<Map<number, SummaryRow>> {
  const res = await client
    .from("campaign_worker_rating_summary")
    .select("campaign_id, worker_id, cumulative_rating, last_activity_rating, has_supportive_activity_rating, supportive_activity_count")
    .eq("campaign_id", campaignId);
  const rows = unwrap(res, `summary for ${campaignId}`) as SummaryRow[];
  return new Map(rows.map((r) => [r.worker_id, r]));
}

/** The trigger's refusal: SQLSTATE 23514 (check_violation) and the exception name in `message`. */
function expectFamilyRefusal(err: PgError | null, token: string, what: string): void {
  expect(err, `${what}: expected a refusal`).not.toBeNull();
  expect(err!.code, `${what}: ${err!.message}`).toBe("23514");
  expect(err!.message, what).toContain(token);
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

beforeAll(async () => {
  admin = await signIn(env.admin, "admin");
  user = await signIn(env.user, "user");
  foreign = await signIn(env.foreign, "foreign user");
  expect(await roleOf(admin, "admin"), "OUX_CONTRACT_ADMIN_* must be an admin account").toBe("admin");
  expect(await roleOf(user, "user"), "OUX_CONTRACT_USER_* must be a user-role account").toBe("user");
  expect(await roleOf(foreign, "foreign user"), "OUX_CONTRACT_FOREIGN_USER_* must be a user-role account").toBe("user");

  // The WP3.8 migration must be on this database (the fixture needs both columns).
  const probe = await admin.from("campaigns").select("campaign_id, parent_campaign_id").limit(1);
  if (probe.error) {
    throw new Error(`WP3.8 contract suite: campaigns.parent_campaign_id is not readable — is 20260917100000_wp3_8_campaign_families applied here? (${probe.error.message})`);
  }

  P = await createCampaign(admin, "parent");
  C = await createCampaign(foreign, "child");
  S = await createCampaign(admin, "sibling");
  for (const id of [C, S]) {
    const err = await updateCampaign(admin, id, { parent_campaign_id: P });
    if (err) throw new Error(`link ${id} to P: ${err.message}`);
  }
  expect(await parentOf(C)).toBe(P);
  expect(await parentOf(S)).toBe(P);

  F = await createActivity(admin, P, "F family", "family");
  O = await createActivity(admin, P, "O owned", "campaign");

  // Members: existing dev workers (the accounts cannot delete workers they create).
  let workers: number[];
  if (env.workerIds && env.workerIds.length >= 4) {
    workers = env.workerIds.slice(0, 6);
  } else {
    const res = await admin.from("workers").select("worker_id").order("worker_id").limit(6);
    workers = (unwrap(res, "select workers") as { worker_id: number }[]).map((w) => w.worker_id);
  }
  if (workers.length < 4) {
    throw new Error("WP3.8 contract suite: the dev database needs at least four workers (or OUX_CONTRACT_WORKER_IDS).");
  }
  [w1, w2, w3, w4] = workers;
  const membership = await admin.from("campaign_worker_membership").insert([
    { campaign_id: C, worker_id: w1 },
    { campaign_id: C, worker_id: w2 },
    { campaign_id: P, worker_id: w1 },
    { campaign_id: P, worker_id: w3 },
    { campaign_id: S, worker_id: w4 },
  ]);
  if (membership.error) throw new Error(`insert membership: ${membership.error.message}`);
});

afterAll(async () => {
  if (!admin) return;
  const ids = [...fixtureCampaignIds];
  // delete_campaign refuses the standing campaign; an SMS episode with no live
  // action deletes normally, but flip it too so nothing fixture-shaped survives.
  for (const id of ids) {
    const row = await campaignRow(admin, id);
    if (row && (row.is_standing || row.is_sms_episode)) {
      const err = await updateCampaign(admin, id, { is_standing: false, is_sms_episode: false });
      if (err) throw new Error(`unflag fixture campaign ${id}: ${err.message}`);
    }
  }
  // Children first (C, S and any fresh child), then the parents: delete_campaign
  // on a parent leaves its children unlinked (SET NULL), which is also fine.
  const rows = await Promise.all(ids.map((id) => campaignRow(admin, id)));
  const ordered = ids
    .map((id, i) => ({ id, row: rows[i] }))
    .filter((x) => x.row !== null)
    .sort((a, b) => Number(b.row!.parent_campaign_id !== null) - Number(a.row!.parent_campaign_id !== null))
    .map((x) => x.id);
  for (const id of ordered) {
    const res = await admin.rpc("delete_campaign", { p_campaign_id: id });
    if (res.error) throw new Error(`delete_campaign(${id}): ${res.error.message}`);
  }
  for (const id of ids) {
    expect(await campaignRow(admin, id), `leftover campaign ${id}`).toBeNull();
    const members = unwrap(
      await admin.from("campaign_worker_membership").select("membership_id").eq("campaign_id", id),
      "leftover membership"
    );
    expect(members).toEqual([]);
    expect(await ownActivityIds(admin, id)).toEqual([]);
  }
  const leftovers = unwrap(
    await admin.from("campaigns").select("campaign_id").like("name", `${NAME_PREFIX}%${runId}`),
    "leftover campaigns by name"
  );
  expect(leftovers).toEqual([]);
  await Promise.all([admin.auth.signOut(), user.auth.signOut(), foreign.auth.signOut()]);
});

// ---------------------------------------------------------------------------
// Fixture sanity
// ---------------------------------------------------------------------------

describe("fixture", () => {
  it("P has two children, F is family and O is owned-only", async () => {
    const children = unwrap(
      await admin.from("campaigns").select("campaign_id").eq("parent_campaign_id", P).order("campaign_id"),
      "children of P"
    ) as { campaign_id: number }[];
    expect(children.map((c) => c.campaign_id).sort((a, b) => a - b)).toEqual([C, S].sort((a, b) => a - b));
    const activities = unwrap(
      await admin.from("campaign_activities").select("activity_id, scope").in("activity_id", [F, O]).order("activity_id"),
      "F and O"
    ) as { activity_id: number; scope: string }[];
    expect(activities.find((a) => a.activity_id === F)?.scope).toBe("family");
    expect(activities.find((a) => a.activity_id === O)?.scope).toBe("campaign");
  });

  it("the foreign user can write C but not P (the SET-a and RAT-a precondition)", async () => {
    const res = await foreign.rpc("campaigns_i_can_write", { p_campaign_ids: [C, P, S] });
    if (res.error) throw new Error(`campaigns_i_can_write: ${res.error.message}`);
    const writable = (Array.isArray(res.data) ? res.data : []).map((n: unknown) => Number(n)).sort((a, b) => a - b);
    expect(writable).toEqual([C]);
  });
});

// ---------------------------------------------------------------------------
// One level (wp3.8.md §3.1 item 5; trigger cases)
// ---------------------------------------------------------------------------

describe("trg_campaigns_enforce_one_level", () => {
  it("grandparent: a campaign that has children cannot itself take a parent (campaign_family_child_has_children)", async () => {
    const G = await createCampaign(admin, "grandparent");
    const err = await updateCampaign(admin, P, { parent_campaign_id: G });
    expectFamilyRefusal(err, "campaign_family_child_has_children", "update P set parent = G");
    expect(await parentOf(P)).toBeNull();
    expect(await parentOf(C)).toBe(P);
  });

  it("grandchild: a fresh campaign cannot choose a parent that has a parent (campaign_family_parent_has_parent)", async () => {
    const err = await tryCreateCampaign(admin, "grandchild", { parent_campaign_id: C });
    expectFamilyRefusal(err, "campaign_family_parent_has_parent", "insert C2 with parent = C");
    const leftovers = unwrap(await admin.from("campaigns").select("campaign_id").eq("parent_campaign_id", C), "children of C");
    expect(leftovers).toEqual([]);
  });

  it("self: a campaign cannot be its own parent (campaign_family_self or the CHECK's 23514)", async () => {
    const err = await updateCampaign(admin, C, { parent_campaign_id: C });
    expect(err, "expected a refusal").not.toBeNull();
    expect(err!.code).toBe("23514");
    expect(
      err!.message.includes("campaign_family_self") || err!.message.includes("campaigns_parent_not_self"),
      err!.message
    ).toBe(true);
    expect(await parentOf(C)).toBe(P);
  });

  it("SMS-episode parent: a child cannot choose an episode (campaign_family_parent_kind)", async () => {
    const E = await createCampaign(admin, "episode", { is_sms_episode: true });
    expect((await campaignRow(admin, E))?.is_sms_episode).toBe(true);
    const err = await tryCreateCampaign(admin, "child of episode", { parent_campaign_id: E });
    expectFamilyRefusal(err, "campaign_family_parent_kind", "insert C3 with parent = E");
    const leftovers = unwrap(await admin.from("campaigns").select("campaign_id").eq("parent_campaign_id", E), "children of E");
    expect(leftovers).toEqual([]);
  });

  it("standing parent: a child cannot choose the standing campaign (campaign_family_parent_kind)", async () => {
    const T = await createCampaign(admin, "standing", { is_standing: true });
    expect((await campaignRow(admin, T))?.is_standing).toBe(true);
    const err = await tryCreateCampaign(admin, "child of standing", { parent_campaign_id: T });
    expectFamilyRefusal(err, "campaign_family_parent_kind", "insert C4 with parent = T");
    const leftovers = unwrap(await admin.from("campaigns").select("campaign_id").eq("parent_campaign_id", T), "children of T");
    expect(leftovers).toEqual([]);
    // Flipped back here as well as in afterAll: delete_campaign refuses a standing campaign.
    const unflag = await updateCampaign(admin, T, { is_standing: false });
    expect(unflag).toBeNull();
  });

  it("episode child: an SMS episode cannot be part of a family (campaign_family_child_kind)", async () => {
    const E = await createCampaign(admin, "episode child", { is_sms_episode: true });
    const err = await updateCampaign(admin, E, { parent_campaign_id: P });
    expectFamilyRefusal(err, "campaign_family_child_kind", "update E set parent = P");
    expect(await parentOf(E)).toBeNull();
  });

  it("a parent flipped to episode while it has children is refused (campaign_family_parent_kind)", async () => {
    const err = await updateCampaign(admin, P, { is_sms_episode: true });
    expectFamilyRefusal(err, "campaign_family_parent_kind", "update P set is_sms_episode = true");
    const row = await campaignRow(admin, P);
    expect(row?.is_sms_episode).toBe(false);
    const standing = await updateCampaign(admin, P, { is_standing: true });
    expectFamilyRefusal(standing, "campaign_family_parent_kind", "update P set is_standing = true");
    expect((await campaignRow(admin, P))?.is_standing).toBe(false);
  });

  it("SET-a: setting a parent needs write access to the parent (42501); clearing always succeeds", async () => {
    const P2 = await createCampaign(admin, "parent 2");
    const refused = await updateCampaign(foreign, C, { parent_campaign_id: P2 });
    expect(refused, "expected 42501").not.toBeNull();
    expect(refused!.code, refused!.message).toBe("42501");
    expect(refused!.message).toContain("campaign_family_parent_not_writable");
    expect(await parentOf(C)).toBe(P);

    const cleared = await updateCampaign(foreign, C, { parent_campaign_id: null });
    expect(cleared).toBeNull();
    expect(await parentOf(C)).toBeNull();

    // The foreign user cannot re-link C to P either (not a writer of P); the admin restores the fixture.
    const relinkRefused = await updateCampaign(foreign, C, { parent_campaign_id: P });
    expect(relinkRefused?.code).toBe("42501");
    expect(await parentOf(C)).toBeNull();
    const restored = await updateCampaign(admin, C, { parent_campaign_id: P });
    expect(restored).toBeNull();
    expect(await parentOf(C)).toBe(P);
  });
});

// ---------------------------------------------------------------------------
// The helper (wp3.8.md §3.1 item 6) and the pure module's filter
// ---------------------------------------------------------------------------

describe("campaign_family_activity_ids", () => {
  it("for C: C's own ∪ {F}; not O; not S's — the same for the user and the foreign user", async () => {
    const own = await ownActivityIds(admin, C);
    const expected = [...own, F].sort((a, b) => a - b);
    expect(await familyIds(user, C)).toEqual(expected);
    expect(await familyIds(foreign, C)).toEqual(expected);
    expect(expected).not.toContain(O);
    for (const id of await ownActivityIds(admin, S)) expect(expected).not.toContain(id);
  });

  it("for P: P's own only (a parent never sees a child's); for S: S's own ∪ {F}", async () => {
    const pOwn = await ownActivityIds(admin, P);
    expect(pOwn).toEqual([F, O].sort((a, b) => a - b));
    expect(await familyIds(user, P)).toEqual(pOwn);
    const sOwn = await ownActivityIds(admin, S);
    expect(await familyIds(user, S)).toEqual([...sOwn, F].sort((a, b) => a - b));
  });

  it("familyActivityFilter() through PostgREST returns exactly the helper's ids for C", async () => {
    const res = await user
      .from("campaign_activities")
      .select("activity_id")
      .or(familyActivityFilter(C, P))
      .order("activity_id");
    const viaFilter = (unwrap(res, "filter") as { activity_id: number }[]).map((r) => r.activity_id);
    expect(viaFilter).toEqual(await familyIds(user, C));
  });
});

// ---------------------------------------------------------------------------
// RAT-a and the RLS confirmation (wp3.8.md §3.4)
// ---------------------------------------------------------------------------

describe("ratings on a shared activity (RAT-a, RLS)", () => {
  it("RAT-a insert: a writer of C who cannot write P upserts a rating on F for w1 — the row lands on F", async () => {
    const res = await foreign.from("campaign_activity_ratings").upsert(
      { activity_id: F, worker_id: w1, rating: 1, binary_value: null, source: "staff", rating_phase: "actual", event_id: null },
      { onConflict: "activity_id,worker_id,rating_phase,event_id" }
    );
    expect(res.error, res.error?.message).toBeNull();
    const rows = await ratingsOn(admin, F, w1);
    expect(rows.map((r) => r.rating)).toEqual([1]);

    // The record_assessment_event path (SECURITY DEFINER upsert by activity id) also succeeds and overwrites, never duplicates.
    const rpc = await foreign.rpc("record_assessment_event", { p_activity_id: F, p_worker_id: w1, p_rating: 2, p_source: "staff" });
    expect(rpc.error, rpc.error?.message).toBeNull();
    const after = await ratingsOn(admin, F, w1);
    expect(after.map((r) => r.rating)).toEqual([2]);
    expect(after[0].rating_id).toBe(rows[0].rating_id);

    // Back to a supportive rating of 1 for VIEW-a below.
    const back = await foreign.rpc("record_assessment_event", { p_activity_id: F, p_worker_id: w1, p_rating: 1, p_source: "staff" });
    expect(back.error).toBeNull();
    expect((await ratingsOn(admin, F, w1)).map((r) => r.rating)).toEqual([1]);

    // A P member who is not in C, rated by the admin (setup for the delete and VIEW-a cases).
    const w3Rating = await admin.from("campaign_activity_ratings").upsert(
      { activity_id: F, worker_id: w3, rating: 1, source: "staff", rating_phase: "actual", event_id: null },
      { onConflict: "activity_id,worker_id,rating_phase,event_id" }
    );
    expect(w3Rating.error, w3Rating.error?.message).toBeNull();
    expect((await ratingsOn(admin, F, w3)).map((r) => r.rating)).toEqual([1]);
  });

  it("delete of the activity is refused for a child-only writer: 0 rows and F still exists", async () => {
    const res = await foreign.from("campaign_activities").delete().eq("activity_id", F).select("activity_id");
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
    expect(await ownActivityIds(admin, P)).toContain(F);
  });

  it("VIEW-a: C's summary counts w1's supportive rating on F, w2 unchanged, no row for w3; P counts w1 and w3; O changes P only", async () => {
    const cBefore = await summaryFor(user, C);
    expect([...cBefore.keys()].sort((a, b) => a - b)).toEqual([w1, w2].sort((a, b) => a - b));
    expect(cBefore.get(w1)?.supportive_activity_count).toBe(1);
    expect(cBefore.get(w1)?.has_supportive_activity_rating).toBe(true);
    expect(cBefore.get(w1)?.last_activity_rating).toBe(1);
    expect(cBefore.get(w2)?.supportive_activity_count).toBe(0);
    expect(cBefore.get(w2)?.has_supportive_activity_rating).toBe(false);
    expect(cBefore.has(w3)).toBe(false);

    const pBefore = await summaryFor(user, P);
    expect([...pBefore.keys()].sort((a, b) => a - b)).toEqual([w1, w3].sort((a, b) => a - b));
    expect(pBefore.get(w1)?.supportive_activity_count).toBe(1);
    expect(pBefore.get(w3)?.supportive_activity_count).toBe(1);

    // A rating on O (owned by P, not shared) for w1 changes P's row and not C's.
    const onO = await admin.from("campaign_activity_ratings").upsert(
      { activity_id: O, worker_id: w1, rating: 2, source: "staff", rating_phase: "actual", event_id: null },
      { onConflict: "activity_id,worker_id,rating_phase,event_id" }
    );
    expect(onO.error, onO.error?.message).toBeNull();
    const pAfter = await summaryFor(user, P);
    expect(pAfter.get(w1)?.supportive_activity_count).toBe(2);
    const cAfter = await summaryFor(user, C);
    expect(cAfter.get(w1)).toEqual(cBefore.get(w1));
    expect(cAfter.get(w2)).toEqual(cBefore.get(w2));
    expect(cAfter.has(w3)).toBe(false);
  });

  it("FQ-b RD-a: a writer of C deletes w1's rating on F (a C member); w3's (P only) is untouched (0 rows)", async () => {
    const w3Before = await ratingsOn(admin, F, w3);
    expect(w3Before).toHaveLength(1);
    const refused = await foreign.from("campaign_activity_ratings").delete().eq("rating_id", w3Before[0].rating_id).select("rating_id");
    expect(refused.error).toBeNull();
    expect(refused.data).toEqual([]);
    expect(await ratingsOn(admin, F, w3)).toHaveLength(1);

    const w1Before = await ratingsOn(admin, F, w1);
    expect(w1Before).toHaveLength(1);
    const allowed = await foreign.from("campaign_activity_ratings").delete().eq("rating_id", w1Before[0].rating_id).select("rating_id");
    expect(allowed.error).toBeNull();
    expect(allowed.data).toEqual([{ rating_id: w1Before[0].rating_id }]);
    expect(await ratingsOn(admin, F, w1)).toEqual([]);

    // The owner path is unchanged: the foreign user still cannot delete a rating on O (owned by P, not shared).
    const onO = await ratingsOn(admin, O, w1);
    expect(onO).toHaveLength(1);
    const ownerOnly = await foreign.from("campaign_activity_ratings").delete().eq("rating_id", onO[0].rating_id).select("rating_id");
    expect(ownerOnly.error).toBeNull();
    expect(ownerOnly.data).toEqual([]);
    expect(await ratingsOn(admin, O, w1)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ON DELETE SET NULL (wp3.8.md §3.1 item 3; R8) — last: it removes P
// ---------------------------------------------------------------------------

describe("deleting the parent", () => {
  it("delete_campaign(P) with C still linked: C's parent is NULL and F's ratings are gone with P's activities", async () => {
    expect(await parentOf(C)).toBe(P);
    expect(await ratingsOn(admin, F)).not.toEqual([]);
    const res = await admin.rpc("delete_campaign", { p_campaign_id: P });
    expect(res.error, res.error?.message).toBeNull();
    fixtureCampaignIds.delete(P);
    expect(await campaignRow(admin, P)).toBeNull();
    expect(await parentOf(C)).toBeNull();
    expect(await parentOf(S)).toBeNull();
    expect(await ratingsOn(admin, F)).toEqual([]);
    expect(await ratingsOn(admin, O)).toEqual([]);
    expect(await familyIds(user, C)).toEqual(await ownActivityIds(admin, C));
  });
});
