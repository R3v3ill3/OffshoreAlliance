/**
 * WP2.2 structure API contract suite (docs/organiser-ux-review/wp/wp2.2.md §4.2).
 *
 * Database-backed: runs against NORMAL DEV through the real PostgREST/RPC path
 * with a signed-in user. Never against production — the suite THROWS on the
 * production host and on missing variables (no "green because nothing ran").
 *
 *   OUX_CONTRACT_SUPABASE_URL        https://<dev-ref>.supabase.co
 *   OUX_CONTRACT_SUPABASE_ANON_KEY   the project's anon key
 *   OUX_CONTRACT_USER_EMAIL          a user-role account (writes to its own campaigns)
 *   OUX_CONTRACT_USER_PASSWORD
 *   OUX_CONTRACT_FOREIGN_CAMPAIGN_ID a campaign the main account cannot write to
 *                                    (REQUIRED; the e2e E2E_FOREIGN_CAMPAIGN_ID
 *                                    campaign qualifies)
 *   OUX_CONTRACT_FOREIGN_USER_EMAIL / _PASSWORD   optional pair (both or neither):
 *                                    a non-admin account that cannot write to the
 *                                    fixture campaign; the one test it gates is
 *                                    the only skip this suite can produce and the
 *                                    Stage 3 paste must report the skipped count
 *   OUX_CONTRACT_WORKER_IDS          optional: comma-separated worker ids to use as
 *                                    members (default: the first six workers by id)
 *
 * Fixture: one campaign `WP2.2 contract <runId>` created through the same REST
 * insert PostgREST exposes (not a product campaign-creation path), an Employer
 * container with two worksite children, a standalone worksite, two custom
 * leaves, a legacy custom-kind container (group_id NULL) and a shift unit, plus
 * six members. `afterAll` deletes both fixture campaigns through
 * `delete_campaign` and asserts zero leftover rows.
 *
 * Enforcement-agnostic: passes with WP2.2a only and with WP2.2b applied — every
 * duplicate assertion accepts the RPC pre-check's 23505 or the index's, same
 * constraint name.
 *
 * Run: `pnpm test:contract` (from apps/organising-db) with the variables in the
 * shell only.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ONE_UNIT_PER_GROUP_CONSTRAINT,
  isStructureApiError,
  structureApi,
  type StructureApi,
  type StructureApiError,
  type StructureApiErrorKind,
} from "../structure-api";

// ---------------------------------------------------------------------------
// Environment (throws, never skips)
// ---------------------------------------------------------------------------

const PRODUCTION_HOST = "gteygwfgjvczanmrwgbr.supabase.co";
const REQUIRED = [
  "OUX_CONTRACT_SUPABASE_URL",
  "OUX_CONTRACT_SUPABASE_ANON_KEY",
  "OUX_CONTRACT_USER_EMAIL",
  "OUX_CONTRACT_USER_PASSWORD",
  "OUX_CONTRACT_FOREIGN_CAMPAIGN_ID",
] as const;

interface ContractEnv {
  url: string;
  anonKey: string;
  email: string;
  password: string;
  foreignEmail: string;
  foreignPassword: string;
  foreignCampaignId: number;
  workerIds: number[] | null;
}

function readEnv(): ContractEnv {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `WP2.2 contract suite: missing ${missing.join(", ")}. Set the OUX_CONTRACT_* variables in the shell (normal dev only; never production, never a file).`
    );
  }
  const url = process.env.OUX_CONTRACT_SUPABASE_URL!;
  const host = new URL(url).host;
  if (host === PRODUCTION_HOST) {
    throw new Error("WP2.2 contract suite: refusing to run against the PRODUCTION project.");
  }
  const foreignCampaignRaw = process.env.OUX_CONTRACT_FOREIGN_CAMPAIGN_ID ?? "";
  if (!/^\d+$/.test(foreignCampaignRaw)) {
    throw new Error("WP2.2 contract suite: OUX_CONTRACT_FOREIGN_CAMPAIGN_ID must be a campaign id the main account cannot write to.");
  }
  const foreignEmail = process.env.OUX_CONTRACT_FOREIGN_USER_EMAIL ?? "";
  const foreignPassword = process.env.OUX_CONTRACT_FOREIGN_USER_PASSWORD ?? "";
  if (Boolean(foreignEmail) !== Boolean(foreignPassword)) {
    throw new Error("WP2.2 contract suite: set both OUX_CONTRACT_FOREIGN_USER_EMAIL and OUX_CONTRACT_FOREIGN_USER_PASSWORD, or neither.");
  }
  const workerIdsRaw = process.env.OUX_CONTRACT_WORKER_IDS ?? "";
  return {
    url,
    anonKey: process.env.OUX_CONTRACT_SUPABASE_ANON_KEY!,
    email: process.env.OUX_CONTRACT_USER_EMAIL!,
    password: process.env.OUX_CONTRACT_USER_PASSWORD!,
    foreignEmail,
    foreignPassword,
    foreignCampaignId: Number(foreignCampaignRaw),
    workerIds: workerIdsRaw
      ? workerIdsRaw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)
      : null,
  };
}

const env = readEnv();
const hasForeignUser = Boolean(env.foreignEmail && env.foreignPassword);

// ---------------------------------------------------------------------------
// Fixture state
// ---------------------------------------------------------------------------

// The app's own clients are `SupabaseClient<any>` (lib/supabase/client.ts /
// server.ts); the suite uses the same untyped shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>;

const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const CAMPAIGN_NAME = `WP2.2 contract ${runId}`;
const OTHER_CAMPAIGN_NAME = `WP2.2 contract other ${runId}`;

let client: Client;
let api: StructureApi;
let campaignId = 0;
let otherCampaignId = 0;
let otherUnitId = 0;
let workers: number[] = [];
const units = {
  employer: 0,
  site1: 0,
  site2: 0,
  site3: 0,
  custom1: 0,
  custom2: 0,
  legacyContainer: 0,
  shift1: 0,
  employerB: 0,
  siteB: 0,
};
const groups = { worksite: 0, employer: 0, custom: 0, legacy: 0, shift: 0 };
const createdCampaignIds: number[] = [];

interface PlacementRow {
  id: number;
  ou_id: number;
  worker_id: number;
  is_primary: boolean;
  assignment_source: string;
  assigned_rule_id: number | null;
  group_id: number;
}
interface UnitRow {
  ou_id: number;
  name: string;
  ou_type: string;
  group_id: number | null;
  parent_ou_id: number | null;
  ou_group_id: number | null;
  display_order: number;
  is_group_container: boolean;
  total_workers_estimated: number | null;
}
interface GroupRow {
  group_id: number;
  kind: string;
  name: string;
  display_order: number;
  source_ou_id: number | null;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what}: no data`);
  return res.data;
}

async function campaignUnits(cid = campaignId): Promise<UnitRow[]> {
  const res = await client
    .from("campaign_organising_units")
    .select("ou_id, name, ou_type, group_id, parent_ou_id, ou_group_id, display_order, is_group_container, total_workers_estimated")
    .eq("campaign_id", cid)
    .order("ou_id");
  return unwrap(res, "select units") as UnitRow[];
}

async function campaignGroups(cid = campaignId): Promise<GroupRow[]> {
  const res = await client
    .from("campaign_groups")
    .select("group_id, kind, name, display_order, source_ou_id")
    .eq("campaign_id", cid)
    .order("group_id");
  return unwrap(res, "select groups") as GroupRow[];
}

async function placements(cid = campaignId): Promise<PlacementRow[]> {
  const ouIds = (await campaignUnits(cid)).map((u) => u.ou_id);
  if (ouIds.length === 0) return [];
  const res = await client
    .from("campaign_worker_ou")
    .select("id, ou_id, worker_id, is_primary, assignment_source, assigned_rule_id, group_id")
    .in("ou_id", ouIds)
    .order("id");
  return unwrap(res, "select placements") as PlacementRow[];
}

async function unitRow(ouId: number): Promise<UnitRow | undefined> {
  const res = await client
    .from("campaign_organising_units")
    .select("ou_id, name, ou_type, group_id, parent_ou_id, ou_group_id, display_order, is_group_container, total_workers_estimated")
    .eq("ou_id", ouId)
    .maybeSingle();
  if (res.error) throw new Error(`select unit ${ouId}: ${res.error.message}`);
  return (res.data ?? undefined) as UnitRow | undefined;
}

/** C-a: at most one placement per (worker, group). */
async function assertOnePerGroup(cid = campaignId): Promise<void> {
  const rows = await placements(cid);
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.worker_id}:${r.group_id}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  expect(dupes, "C-a violated: (worker:group) with more than one placement").toEqual([]);
}

/** C-h: at most one primary per worker in the campaign. */
async function assertSinglePrimary(cid = campaignId): Promise<void> {
  const rows = await placements(cid);
  const byWorker = new Map<number, number>();
  for (const r of rows) if (r.is_primary) byWorker.set(r.worker_id, (byWorker.get(r.worker_id) ?? 0) + 1);
  const bad = [...byWorker.entries()].filter(([, n]) => n > 1).map(([w]) => w);
  expect(bad, "C-h violated: workers with two primaries").toEqual([]);
}

async function expectKind(promise: Promise<unknown>, kind: StructureApiErrorKind): Promise<StructureApiError> {
  try {
    await promise;
  } catch (error) {
    if (!isStructureApiError(error)) throw error;
    expect(error.kind, `${error.rpc}: ${error.code} ${error.message}`).toBe(kind);
    return error;
  }
  throw new Error(`expected a ${kind} StructureApiError`);
}

/** Enforcement-agnostic duplicate assertion: pre-check or index, same constraint. */
async function expectDuplicateInGroup(promise: Promise<unknown>): Promise<void> {
  const err = await expectKind(promise, "duplicate_in_group");
  expect(err.code).toBe("23505");
  expect(err.constraint).toBe(ONE_UNIT_PER_GROUP_CONSTRAINT);
}

async function createUnit(row: Record<string, unknown>, cid = campaignId): Promise<{ ou_id: number; group_id: number | null }> {
  const res = await client
    .from("campaign_organising_units")
    .insert({ campaign_id: cid, source: "manual", ...row })
    .select("ou_id, group_id")
    .single();
  return unwrap(res, `insert unit ${String(row.name)}`) as { ou_id: number; group_id: number | null };
}

async function clearPlacements(): Promise<void> {
  await api.placements.unassign({ campaignId, workerIds: workers });
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

beforeAll(async () => {
  client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signIn = await client.auth.signInWithPassword({ email: env.email, password: env.password });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`WP2.2 contract suite: sign-in failed: ${signIn.error?.message ?? "no session"}`);
  }
  api = structureApi(client);

  const campaign = unwrap(
    await client
      .from("campaigns")
      .insert({ name: CAMPAIGN_NAME, campaign_type: "organising", status: "planning" })
      .select("campaign_id")
      .single(),
    "insert campaign"
  ) as { campaign_id: number };
  campaignId = campaign.campaign_id;
  createdCampaignIds.push(campaignId);

  const other = unwrap(
    await client
      .from("campaigns")
      .insert({ name: OTHER_CAMPAIGN_NAME, campaign_type: "organising", status: "planning" })
      .select("campaign_id")
      .single(),
    "insert other campaign"
  ) as { campaign_id: number };
  otherCampaignId = other.campaign_id;
  createdCampaignIds.push(otherCampaignId);
  otherUnitId = (await createUnit({ name: `WP2.2 other unit ${runId}`, ou_type: "worksite" }, otherCampaignId)).ou_id;

  // Members: existing dev workers (the account cannot delete workers it creates).
  if (env.workerIds && env.workerIds.length >= 4) {
    workers = env.workerIds.slice(0, 6);
  } else {
    const res = await client.from("workers").select("worker_id").order("worker_id").limit(6);
    workers = (unwrap(res, "select workers") as { worker_id: number }[]).map((w) => w.worker_id);
  }
  if (workers.length < 4) {
    throw new Error("WP2.2 contract suite: the dev database needs at least four workers (or OUX_CONTRACT_WORKER_IDS).");
  }
  const membership = await client
    .from("campaign_worker_membership")
    .insert(workers.map((worker_id) => ({ campaign_id: campaignId, worker_id })));
  if (membership.error) throw new Error(`insert membership: ${membership.error.message}`);

  const employer = await createUnit({ name: `WP2.2 Employer ${runId}`, ou_type: "employer", is_group_container: true });
  units.employer = employer.ou_id;
  units.site1 = (
    await createUnit({
      name: `WP2.2 Site 1 ${runId}`,
      ou_type: "worksite",
      parent_ou_id: units.employer,
      ou_group_id: units.employer,
      unit_basis: { custom: true },
    })
  ).ou_id;
  units.site2 = (
    await createUnit({
      name: `WP2.2 Site 2 ${runId}`,
      ou_type: "worksite",
      parent_ou_id: units.employer,
      ou_group_id: units.employer,
      unit_basis: { custom: true },
    })
  ).ou_id;
  units.site3 = (await createUnit({ name: `WP2.2 Site 3 ${runId}`, ou_type: "worksite" })).ou_id;
  units.custom1 = (await createUnit({ name: `WP2.2 Custom 1 ${runId}`, ou_type: "custom" })).ou_id;
  units.custom2 = (await createUnit({ name: `WP2.2 Custom 2 ${runId}`, ou_type: "custom" })).ou_id;
  units.legacyContainer = (
    await createUnit({ name: `WP2.2 Legacy container ${runId}`, ou_type: "custom", is_group_container: true })
  ).ou_id;
  units.shift1 = (await createUnit({ name: `WP2.2 Shift 1 ${runId}`, ou_type: "shift" })).ou_id;
  units.employerB = (await createUnit({ name: `WP2.2 Employer B ${runId}`, ou_type: "employer", is_group_container: true })).ou_id;
  units.siteB = (
    await createUnit({
      name: `WP2.2 Site B ${runId}`,
      ou_type: "worksite",
      parent_ou_id: units.employerB,
      ou_group_id: units.employerB,
      unit_basis: { custom: true },
    })
  ).ou_id;

  const g = await campaignGroups();
  const byKind = (kind: string, name?: string) =>
    g.find((x) => x.kind === kind && (name == null || x.name === name))?.group_id ?? 0;
  groups.worksite = byKind("worksite");
  groups.employer = byKind("employer");
  groups.shift = byKind("shift");
  groups.custom = byKind("custom", "Custom");
  groups.legacy = g.find((x) => x.source_ou_id === units.legacyContainer)?.group_id ?? 0;
  for (const [k, v] of Object.entries(groups)) {
    if (!v) throw new Error(`WP2.2 contract suite: fixture group "${k}" was not derived by the WP2.1 triggers`);
  }
});

afterAll(async () => {
  if (!client) return;
  const allUnitIds = new Set<number>();
  for (const cid of createdCampaignIds) {
    for (const u of await campaignUnits(cid)) allUnitIds.add(u.ou_id);
  }
  for (const cid of createdCampaignIds) {
    const res = await client.rpc("delete_campaign", { p_campaign_id: cid });
    if (res.error) throw new Error(`delete_campaign(${cid}): ${res.error.message}`);
  }
  for (const cid of createdCampaignIds) {
    expect(await campaignUnits(cid)).toEqual([]);
    expect(await campaignGroups(cid)).toEqual([]);
    const members = unwrap(
      await client.from("campaign_worker_membership").select("membership_id").eq("campaign_id", cid),
      "leftover membership"
    );
    expect(members).toEqual([]);
    const campaigns = unwrap(await client.from("campaigns").select("campaign_id").eq("campaign_id", cid), "leftover campaign");
    expect(campaigns).toEqual([]);
  }
  if (allUnitIds.size > 0) {
    const leftovers = unwrap(
      await client.from("campaign_worker_ou").select("id").in("ou_id", [...allUnitIds]),
      "leftover placements"
    );
    expect(leftovers).toEqual([]);
  }
  await client.auth.signOut();
});

beforeEach(async () => {
  await clearPlacements();
});

// ---------------------------------------------------------------------------
// Fixture sanity
// ---------------------------------------------------------------------------

describe("fixture", () => {
  it("derived the expected groups and the legacy container has no group (C-e precondition)", async () => {
    const rows = await campaignUnits();
    const byId = new Map(rows.map((r) => [r.ou_id, r]));
    expect(byId.get(units.employer)?.group_id).toBe(groups.employer);
    expect(byId.get(units.site1)?.group_id).toBe(groups.worksite);
    expect(byId.get(units.site2)?.group_id).toBe(groups.worksite);
    expect(byId.get(units.site3)?.group_id).toBe(groups.worksite);
    expect(byId.get(units.custom1)?.group_id).toBe(groups.custom);
    expect(byId.get(units.shift1)?.group_id).toBe(groups.shift);
    expect(byId.get(units.legacyContainer)?.group_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

describe("structure_group_create", () => {
  it("is idempotent for a fixed kind that already exists", async () => {
    const res = await api.groups.create({ campaignId, kind: "worksite", name: "" });
    expect(res).toEqual({ group_id: groups.worksite, created: false });
  });

  it("creates a missing fixed kind once and then returns it", async () => {
    const first = await api.groups.create({ campaignId, kind: "crew", name: "" });
    expect(first.created).toBe(true);
    const again = await api.groups.create({ campaignId, kind: "crew", name: "Ignored" });
    expect(again).toEqual({ group_id: first.group_id, created: false });
    const row = (await campaignGroups()).find((g) => g.group_id === first.group_id);
    expect(row?.name).toBe("Crew");
    await api.groups.remove({ campaignId, groupId: first.group_id, mode: "empty_only" });
  });

  it("creates a custom group and rejects a case-insensitive duplicate name (duplicate_group)", async () => {
    const created = await api.groups.create({ campaignId, kind: "custom", name: `WP2.2 Custom G ${runId}` });
    expect(created.created).toBe(true);
    const err = await expectKind(
      api.groups.create({ campaignId, kind: "custom", name: `wp2.2 custom g ${runId}` }),
      "duplicate_group"
    );
    expect(err.code).toBe("23505");
    await api.groups.remove({ campaignId, groupId: created.group_id, mode: "empty_only" });
  });

  it("rejects an unknown kind and a blank custom name (22023)", async () => {
    await expectKind(api.groups.create({ campaignId, kind: "team" as "custom", name: "x" }), "invalid_argument");
    await expectKind(api.groups.create({ campaignId, kind: "custom", name: "   " }), "invalid_argument");
  });
});

describe("structure_group_update", () => {
  it("renames and reorders a custom group", async () => {
    const created = await api.groups.create({ campaignId, kind: "custom", name: `WP2.2 Rename me ${runId}` });
    await api.groups.update({ campaignId, groupId: created.group_id, name: `WP2.2 Renamed ${runId}`, displayOrder: 42 });
    const row = (await campaignGroups()).find((g) => g.group_id === created.group_id);
    expect(row).toMatchObject({ name: `WP2.2 Renamed ${runId}`, display_order: 42 });
    await api.groups.remove({ campaignId, groupId: created.group_id, mode: "empty_only" });
  });

  it("renaming a container-backed group renames its legacy container", async () => {
    await api.groups.update({ campaignId, groupId: groups.legacy, name: `WP2.2 Legacy renamed ${runId}` });
    expect((await unitRow(units.legacyContainer))?.name).toBe(`WP2.2 Legacy renamed ${runId}`);
    expect((await campaignGroups()).find((g) => g.group_id === groups.legacy)?.name).toBe(`WP2.2 Legacy renamed ${runId}`);
  });

  it("rejects a blank name, a missing group and a group of another campaign (C-i)", async () => {
    await expectKind(api.groups.update({ campaignId, groupId: groups.custom, name: " " }), "invalid_argument");
    await expectKind(api.groups.update({ campaignId, groupId: 2_000_000_000, name: "x" }), "not_found");
    const otherGroup = (await campaignGroups(otherCampaignId))[0];
    await expectKind(api.groups.update({ campaignId, groupId: otherGroup.group_id, name: "x" }), "invalid_argument");
  });
});

describe("structure_group_reorder", () => {
  it("sets display_order by position and keeps unlisted groups after the listed ones", async () => {
    const res = await api.groups.reorder({ campaignId, groupIds: [groups.custom, groups.worksite] });
    expect(res.updated).toBe(2);
    const g = await campaignGroups();
    const order = (id: number) => g.find((x) => x.group_id === id)!.display_order;
    expect(order(groups.custom)).toBe(0);
    expect(order(groups.worksite)).toBe(1);
    for (const other of g.filter((x) => x.group_id !== groups.custom && x.group_id !== groups.worksite)) {
      expect(other.display_order).toBeGreaterThanOrEqual(2);
    }
  });

  it("rejects duplicates (22023)", async () => {
    await expectKind(api.groups.reorder({ campaignId, groupIds: [groups.custom, groups.custom] }), "invalid_argument");
  });
});

describe("structure_group_delete", () => {
  it("empty_only refuses a group that still has units (P0001)", async () => {
    await expectKind(api.groups.remove({ campaignId, groupId: groups.worksite, mode: "empty_only" }), "rule_violation");
    expect((await campaignGroups()).some((g) => g.group_id === groups.worksite)).toBe(true);
  });

  it("cascade_units deletes the group's units and their placements, then the group", async () => {
    const created = await api.groups.create({ campaignId, kind: "custom", name: `WP2.2 Cascade ${runId}` });
    const made = await api.units.create({
      campaignId,
      units: [
        { client_ref: "a", name: `WP2.2 Cascade A ${runId}`, ou_type: "custom", group_id: created.group_id },
        { client_ref: "b", name: `WP2.2 Cascade B ${runId}`, ou_type: "custom", group_id: created.group_id },
      ],
      assignments: [{ ou_ref: "a", worker_id: workers[0] }],
    });
    expect(made.units.map((u) => u.group_id)).toEqual([created.group_id, created.group_id]);
    const res = await api.groups.remove({ campaignId, groupId: created.group_id, mode: "cascade_units" });
    expect(res.deleted_ou_ids.sort()).toEqual(made.units.map((u) => u.ou_id).sort());
    expect(res.placements_removed).toBe(1);
    expect((await campaignGroups()).some((g) => g.group_id === created.group_id)).toBe(false);
    for (const u of made.units) expect(await unitRow(u.ou_id)).toBeUndefined();
  });

  it("rejects an unknown mode (22023)", async () => {
    await expectKind(api.groups.remove({ campaignId, groupId: groups.custom, mode: "nuke" as "empty_only" }), "invalid_argument");
  });
});

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

describe("structure_units_create", () => {
  it("creates a container plus members in one call via client_ref and applies assignments with move semantics", async () => {
    await api.placements.assign({ campaignId, ouId: units.site3, workerIds: [workers[0]] });
    const res = await api.units.create({
      campaignId,
      units: [
        { client_ref: "emp", name: `WP2.2 Emp 2 ${runId}`, ou_type: "employer", is_group_container: true },
        { client_ref: "s", name: `WP2.2 Emp 2 site ${runId}`, ou_type: "worksite", parent_ou_id: "emp", ou_group_id: "emp", unit_basis: { custom: true } },
      ],
      assignments: [
        { ou_ref: "s", worker_id: workers[0] },
        { ou_ref: "s", worker_id: workers[1], is_primary: true },
      ],
    });
    expect(res.units.map((u) => u.client_ref)).toEqual(["emp", "s"]);
    expect(res.units[0].group_id).toBe(groups.employer);
    expect(res.units[1].group_id).toBe(groups.worksite);
    expect(res).toMatchObject({ inserted: 1, moved: 1, skipped: 0, displaced: 0 });
    const site = await unitRow(res.units[1].ou_id);
    expect(site).toMatchObject({ parent_ou_id: res.units[0].ou_id, ou_group_id: res.units[0].ou_id });
    const rows = await placements();
    expect(rows.filter((r) => r.worker_id === workers[0]).map((r) => r.ou_id)).toEqual([res.units[1].ou_id]);
    expect(rows.find((r) => r.worker_id === workers[1])).toMatchObject({ ou_id: res.units[1].ou_id, is_primary: true });
    await assertOnePerGroup();
    await api.units.remove({ campaignId, ouId: res.units[0].ou_id, deleteChildren: true });
  });

  it("C-g: a fixed-kind unit cannot be pinned to a custom group; a custom unit can", async () => {
    await expectKind(
      api.units.create({ campaignId, units: [{ name: `WP2.2 Pinned ${runId}`, ou_type: "worksite", group_id: groups.custom }] }),
      "invalid_argument"
    );
    const res = await api.units.create({
      campaignId,
      units: [{ client_ref: "p", name: `WP2.2 Pinned custom ${runId}`, ou_type: "custom", group_id: groups.legacy }],
    });
    expect(res.units[0].group_id).toBe(groups.legacy);
    await api.units.remove({ campaignId, ouId: res.units[0].ou_id });
  });

  it("is atomic: a valid first element and an invalid second leave nothing behind", async () => {
    const before = (await campaignUnits()).length;
    await expectKind(
      api.units.create({
        campaignId,
        units: [
          { name: `WP2.2 Atomic ok ${runId}`, ou_type: "worksite" },
          { name: `WP2.2 Atomic bad ${runId}`, ou_type: "worksite", description: "no such column" } as never,
        ],
      }),
      "invalid_argument"
    );
    expect((await campaignUnits()).length).toBe(before);
  });

  it("C-i: a parent from another campaign is rejected (22023); an unknown parent is not_found", async () => {
    await expectKind(
      api.units.create({ campaignId, units: [{ name: `WP2.2 Foreign parent ${runId}`, ou_type: "worksite", parent_ou_id: otherUnitId }] }),
      "invalid_argument"
    );
    await expectKind(
      api.units.create({ campaignId, units: [{ name: `WP2.2 Missing parent ${runId}`, ou_type: "worksite", parent_ou_id: 2_000_000_000 }] }),
      "not_found"
    );
  });

  it("rejects an unknown ou_type and a non-member assignment (22023)", async () => {
    await expectKind(api.units.create({ campaignId, units: [{ name: "x", ou_type: "galaxy" }] }), "invalid_argument");
    const nonMember = Math.max(...workers) + 1_000_000;
    await expectKind(
      api.units.create({
        campaignId,
        units: [{ client_ref: "u", name: `WP2.2 Non-member ${runId}`, ou_type: "worksite" }],
        assignments: [{ ou_ref: "u", worker_id: nonMember }],
      }),
      "not_found"
    );
  });
});

describe("structure_unit_update", () => {
  it("applies a whitelisted patch (estimated_size alias) and returns the keys", async () => {
    const res = await api.units.update({ campaignId, ouId: units.site3, patch: { name: `WP2.2 Site 3 renamed ${runId}`, estimated_size: 17, user_rating: 2 } });
    expect(res).toEqual({ ou_id: units.site3, updated_keys: ["estimated_size", "name", "user_rating"] });
    expect(await unitRow(units.site3)).toMatchObject({ name: `WP2.2 Site 3 renamed ${runId}`, total_workers_estimated: 17 });
  });

  it("rejects keys outside the whitelist (description, leader_worker_id, ou_type) with 22023", async () => {
    for (const patch of [{ description: "x" }, { leader_worker_id: 1 }, { ou_type: "shift" }, { group_id: 1 }]) {
      await expectKind(api.units.update({ campaignId, ouId: units.site3, patch: patch as never }), "invalid_argument");
    }
  });

  it("not_found for a missing unit and 22023 for another campaign's unit (C-i)", async () => {
    await expectKind(api.units.update({ campaignId, ouId: 2_000_000_000, patch: { name: "x" } }), "not_found");
    await expectKind(api.units.update({ campaignId, ouId: otherUnitId, patch: { name: "x" } }), "invalid_argument");
  });
});

describe("structure_unit_reorder", () => {
  it("sets a 0-based display_order for the listed units", async () => {
    await api.units.reorder({ campaignId, ouIds: [units.custom2, units.custom1, units.site3] });
    expect((await unitRow(units.custom2))?.display_order).toBe(0);
    expect((await unitRow(units.custom1))?.display_order).toBe(1);
    expect((await unitRow(units.site3))?.display_order).toBe(2);
  });

  it("rejects duplicates and foreign units", async () => {
    await expectKind(api.units.reorder({ campaignId, ouIds: [units.custom1, units.custom1] }), "invalid_argument");
    await expectKind(api.units.reorder({ campaignId, ouIds: [otherUnitId] }), "invalid_argument");
  });
});

describe("structure_unit_delete", () => {
  it("moves and removes placements per reassignment, carries the primary (C-h), and removes the rest", async () => {
    const made = await api.units.create({ campaignId, units: [{ name: `WP2.2 Doomed ${runId}`, ou_type: "worksite" }] });
    const doomed = made.units[0].ou_id;
    await api.placements.assign({ campaignId, ouId: doomed, workerIds: [workers[0], workers[1], workers[2]] });
    await api.placements.setPrimary({ campaignId, workerId: workers[0], ouId: doomed });
    const res = await api.units.remove({
      campaignId,
      ouId: doomed,
      reassignments: [
        { worker_id: workers[0], to_ou_id: units.site3 },
        { worker_id: workers[1], to_ou_id: null },
      ],
    });
    expect(res).toMatchObject({ deleted_ou_ids: [doomed], placements_moved: 1, placements_removed: 2, placements_displaced: 0 });
    const rows = await placements();
    expect(rows.find((r) => r.worker_id === workers[0])).toMatchObject({ ou_id: units.site3, is_primary: true });
    expect(rows.filter((r) => r.worker_id === workers[1] || r.worker_id === workers[2])).toEqual([]);
    expect(await unitRow(doomed)).toBeUndefined();
    await assertOnePerGroup();
    await assertSinglePrimary();
  });

  it("detaches children by default and deletes them with deleteChildren", async () => {
    const made = await api.units.create({
      campaignId,
      units: [
        { client_ref: "c", name: `WP2.2 Container D ${runId}`, ou_type: "employer", is_group_container: true },
        { client_ref: "m", name: `WP2.2 Member D ${runId}`, ou_type: "worksite", parent_ou_id: "c", ou_group_id: "c" },
      ],
    });
    const [container, member] = made.units.map((u) => u.ou_id);
    await api.units.remove({ campaignId, ouId: container });
    expect(await unitRow(member)).toMatchObject({ parent_ou_id: null, ou_group_id: null, group_id: groups.worksite });

    const made2 = await api.units.create({
      campaignId,
      units: [
        { client_ref: "c", name: `WP2.2 Container E ${runId}`, ou_type: "employer", is_group_container: true },
        { client_ref: "m", name: `WP2.2 Member E ${runId}`, ou_type: "worksite", parent_ou_id: "c", ou_group_id: "c" },
      ],
      assignments: [{ ou_ref: "m", worker_id: workers[3] }],
    });
    const res = await api.units.remove({ campaignId, ouId: made2.units[0].ou_id, deleteChildren: true });
    expect(res.deleted_ou_ids.sort()).toEqual(made2.units.map((u) => u.ou_id).sort());
    expect(res.placements_removed).toBe(1);
    expect(await unitRow(made2.units[1].ou_id)).toBeUndefined();
    await api.units.remove({ campaignId, ouId: member });
  });

  it("is atomic: a bad second reassignment leaves the unit and its placements untouched", async () => {
    await api.placements.assign({ campaignId, ouId: units.custom1, workerIds: [workers[0]] });
    await expectKind(
      api.units.remove({
        campaignId,
        ouId: units.custom1,
        reassignments: [
          { worker_id: workers[0], to_ou_id: units.custom2 },
          { worker_id: workers[1], to_ou_id: units.custom2 }, // no placement on custom1
        ],
      }),
      "not_found"
    );
    expect(await unitRow(units.custom1)).toBeDefined();
    expect((await placements()).find((r) => r.worker_id === workers[0])?.ou_id).toBe(units.custom1);
  });
});

describe("structure_unit_merge", () => {
  it("re-points, collapses (primary OR-ed), preserves provenance (C-l), re-points unit rules and deletes the sources", async () => {
    const made = await api.units.create({
      campaignId,
      units: [
        { client_ref: "s", name: `WP2.2 Survivor ${runId}`, ou_type: "worksite" },
        { client_ref: "a", name: `WP2.2 Source A ${runId}`, ou_type: "worksite" },
      ],
    });
    const [survivor, sourceA] = made.units.map((u) => u.ou_id);
    await api.placements.assign({ campaignId, ouId: survivor, workerIds: [workers[0]] });
    await api.placements.assign({ campaignId, ouId: sourceA, workerIds: [workers[1]], source: "universe" });
    const beforeRows = await placements();
    const sourceRowB = beforeRows.find((r) => r.worker_id === workers[1] && r.ou_id === sourceA)!;
    const rule = unwrap(
      await client
        .from("campaign_unit_rules")
        .insert({ campaign_id: campaignId, ou_id: sourceA, dimension_type: "employer", operator: "equals", value_int: 1 })
        .select("rule_id")
        .single(),
      "insert unit rule"
    ) as { rule_id: number };

    const res = await api.units.merge({ campaignId, survivorOuId: survivor, sourceOuIds: [sourceA] });
    expect(res).toMatchObject({ moved: 1, collapsed: 0, deleted_ou_ids: [sourceA] });
    expect(res.repointed.campaign_unit_rules).toBe(1);
    const after = await placements();
    const movedRow = after.find((r) => r.id === sourceRowB.id);
    expect(movedRow).toMatchObject({ ou_id: survivor, assignment_source: "universe", worker_id: workers[1] });
    expect(await unitRow(sourceA)).toBeUndefined();
    const ruleRow = unwrap(await client.from("campaign_unit_rules").select("ou_id").eq("rule_id", rule.rule_id).single(), "rule");
    expect(ruleRow).toEqual({ ou_id: survivor });
    await assertOnePerGroup();
    await client.from("campaign_unit_rules").delete().eq("rule_id", rule.rule_id);
    await api.units.remove({ campaignId, ouId: survivor });
  });

  it("C-j: refuses a cross-group merge and a survivor that is also a source; nothing changes", async () => {
    const made = await api.units.create({
      campaignId,
      units: [
        { client_ref: "s", name: `WP2.2 Survivor 2 ${runId}`, ou_type: "custom" },
        { client_ref: "a", name: `WP2.2 Source 2 ${runId}`, ou_type: "custom", group_id: groups.legacy },
      ],
    });
    await expectKind(api.units.merge({ campaignId, survivorOuId: made.units[0].ou_id, sourceOuIds: [made.units[1].ou_id] }), "invalid_argument");
    await expectKind(api.units.merge({ campaignId, survivorOuId: made.units[0].ou_id, sourceOuIds: [made.units[0].ou_id] }), "invalid_argument");
    await expectKind(api.units.merge({ campaignId, survivorOuId: made.units[0].ou_id, sourceOuIds: [] }), "invalid_argument");
    for (const u of made.units) expect(await unitRow(u.ou_id)).toBeDefined();
    await api.units.remove({ campaignId, ouId: made.units[0].ou_id });
    await api.units.remove({ campaignId, ouId: made.units[1].ou_id });
    // The `collapsed > 0` branch needs a worker on a source AND the survivor
    // in one group — a pre-WP2.2b duplicate the API refuses to create (C-a).
    // It is exercised by the clone rehearsal on real H9 data, not here.
  });

  it("legacy check_worker_ou_group_exclusivity still refuses merging worksites of two different Employer containers (P0001 → rule_violation; wp2.2.md §3.4 C-j note)", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]] });
    await api.placements.assign({ campaignId, ouId: units.siteB, workerIds: [workers[1]] });
    const before = await placements();
    await expectKind(api.units.merge({ campaignId, survivorOuId: units.siteB, sourceOuIds: [units.site1] }), "rule_violation");
    expect(await placements()).toEqual(before);
    expect(await unitRow(units.site1)).toBeDefined();
  });

  it("refuses a source that has child units (P0001)", async () => {
    await expectKind(api.units.merge({ campaignId, survivorOuId: units.site3, sourceOuIds: [units.employer] }), "invalid_argument");
    const made = await api.units.create({
      campaignId,
      units: [
        { client_ref: "c", name: `WP2.2 Container M ${runId}`, ou_type: "worksite", is_group_container: true },
        { client_ref: "m", name: `WP2.2 Member M ${runId}`, ou_type: "worksite", parent_ou_id: "c", ou_group_id: "c" },
      ],
    });
    await expectKind(api.units.merge({ campaignId, survivorOuId: units.site3, sourceOuIds: [made.units[0].ou_id] }), "rule_violation");
    await api.units.remove({ campaignId, ouId: made.units[0].ou_id, deleteChildren: true });
  });
});

describe("structure_unit_split", () => {
  it("C-k: same-group children take the workers out of the source; keepInSource is ignored and reported as displaced", async () => {
    await api.placements.assign({ campaignId, ouId: units.site3, workerIds: [workers[0], workers[1]] });
    const before = await placements();
    const rowA = before.find((r) => r.worker_id === workers[0])!;
    const res = await api.units.split({
      campaignId,
      sourceOuId: units.site3,
      children: [
        { client_ref: "a", name: `WP2.2 Split A ${runId}` },
        { client_ref: "b", name: `WP2.2 Split B ${runId}` },
      ],
      assignments: [
        { child_ref: "a", worker_id: workers[0] },
        { child_ref: "b", worker_id: workers[1] },
      ],
      keepInSource: true,
    });
    expect(res.children.map((c) => c.group_id)).toEqual([groups.worksite, groups.worksite]);
    expect(res).toMatchObject({ moved: 2, copied: 0, kept: 0, displaced: 2 });
    const after = await placements();
    expect(after.filter((r) => r.ou_id === units.site3)).toEqual([]);
    expect(after.find((r) => r.id === rowA.id)?.ou_id).toBe(res.children[0].ou_id);
    for (const c of res.children) expect(await unitRow(c.ou_id)).toMatchObject({ parent_ou_id: units.site3 });
    await assertOnePerGroup();
    for (const c of res.children) await api.units.remove({ campaignId, ouId: c.ou_id });
  });

  it("cross-group children honour keepInSource (kept) or move the source row (moved)", async () => {
    await api.placements.assign({ campaignId, ouId: units.site3, workerIds: [workers[0], workers[1]] });
    const res = await api.units.split({
      campaignId,
      sourceOuId: units.site3,
      children: [{ client_ref: "x", name: `WP2.2 Split shift ${runId}`, ou_type: "shift", parent_ou_id: null }],
      assignments: [{ child_ref: "x", worker_id: workers[0] }],
      keepInSource: true,
    });
    expect(res).toMatchObject({ moved: 0, copied: 1, kept: 1, displaced: 0 });
    let rows = await placements();
    expect(rows.filter((r) => r.worker_id === workers[0]).map((r) => r.ou_id).sort()).toEqual([units.site3, res.children[0].ou_id].sort());

    const res2 = await api.units.split({
      campaignId,
      sourceOuId: units.site3,
      children: [{ client_ref: "y", name: `WP2.2 Split shift 2 ${runId}`, ou_type: "custom", parent_ou_id: null }],
      assignments: [{ child_ref: "y", worker_id: workers[1] }],
    });
    expect(res2).toMatchObject({ moved: 1, copied: 0, kept: 0 });
    rows = await placements();
    expect(rows.filter((r) => r.worker_id === workers[1]).map((r) => r.ou_id)).toEqual([res2.children[0].ou_id]);
    await assertOnePerGroup();
    await api.units.remove({ campaignId, ouId: res.children[0].ou_id });
    await api.units.remove({ campaignId, ouId: res2.children[0].ou_id });
  });

  it("is atomic: assigning one worker to two siblings raises duplicate_in_group and creates no children", async () => {
    await api.placements.assign({ campaignId, ouId: units.site3, workerIds: [workers[0]] });
    const before = (await campaignUnits()).length;
    await expectDuplicateInGroup(
      api.units.split({
        campaignId,
        sourceOuId: units.site3,
        children: [
          { client_ref: "a", name: `WP2.2 Split dup A ${runId}` },
          { client_ref: "b", name: `WP2.2 Split dup B ${runId}` },
        ],
        assignments: [
          { child_ref: "a", worker_id: workers[0] },
          { child_ref: "b", worker_id: workers[0] },
        ],
      })
    );
    expect((await campaignUnits()).length).toBe(before);
    expect((await placements()).find((r) => r.worker_id === workers[0])?.ou_id).toBe(units.site3);
  });

  it("rejects a fixed-kind p_group_id (C-g)", async () => {
    await expectKind(
      api.units.split({ campaignId, sourceOuId: units.custom1, children: [{ name: "x" }], groupId: groups.worksite }),
      "invalid_argument"
    );
  });
});

describe("structure_units_bulk_save", () => {
  it("deletes, updates and creates in one call", async () => {
    const made = await api.units.create({
      campaignId,
      units: [
        { name: `WP2.2 Bulk del ${runId}`, ou_type: "worksite" },
        { name: `WP2.2 Bulk upd ${runId}`, ou_type: "worksite" },
      ],
    });
    const [del, upd] = made.units.map((u) => u.ou_id);
    await api.placements.assign({ campaignId, ouId: del, workerIds: [workers[0]] });
    const res = await api.units.bulkSave({
      campaignId,
      deleteOuIds: [del],
      updates: [{ ou_id: upd, name: `WP2.2 Bulk updated ${runId}`, total_workers_estimated: 3 }],
      creates: [{ client_ref: "n", name: `WP2.2 Bulk new ${runId}`, ou_type: "shift" }],
    });
    expect(res).toMatchObject({ deleted_ou_ids: [del], updated_ou_ids: [upd], placements_removed: 1 });
    expect(res.created[0]).toMatchObject({ client_ref: "n", group_id: groups.shift });
    expect(await unitRow(del)).toBeUndefined();
    expect(await unitRow(upd)).toMatchObject({ name: `WP2.2 Bulk updated ${runId}`, total_workers_estimated: 3 });
    await api.units.remove({ campaignId, ouId: upd });
    await api.units.remove({ campaignId, ouId: res.created[0].ou_id });
  });

  it("is atomic: a unit both deleted and updated is refused and nothing changes", async () => {
    const made = await api.units.create({ campaignId, units: [{ name: `WP2.2 Bulk atomic ${runId}`, ou_type: "worksite" }] });
    const id = made.units[0].ou_id;
    await expectKind(
      api.units.bulkSave({ campaignId, deleteOuIds: [id], updates: [{ ou_id: id, name: "x" }], creates: [{ name: `WP2.2 Bulk ghost ${runId}`, ou_type: "shift" }] }),
      "invalid_argument"
    );
    expect(await unitRow(id)).toMatchObject({ name: `WP2.2 Bulk atomic ${runId}` });
    expect((await campaignUnits()).some((u) => u.name === `WP2.2 Bulk ghost ${runId}`)).toBe(false);
    await api.units.remove({ campaignId, ouId: id });
  });
});

// ---------------------------------------------------------------------------
// Placements
// ---------------------------------------------------------------------------

describe("structure_placements_assign", () => {
  it("inserts, skips a same-group conflict by default, moves with onConflict move, errors with onConflict error (C-a)", async () => {
    let res = await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0], workers[1]] });
    expect(res).toMatchObject({ inserted: 2, moved: 0, skipped: 0, displaced: 0 });
    res = await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]] });
    expect(res).toMatchObject({ inserted: 0, moved: 0, skipped: 1 });
    res = await api.placements.assign({ campaignId, ouId: units.site2, workerIds: [workers[0]] });
    expect(res).toMatchObject({ inserted: 0, skipped: 1 });
    res = await api.placements.assign({ campaignId, ouId: units.site2, workerIds: [workers[0]], onConflict: "move" });
    expect(res).toMatchObject({ moved: 1, displaced: 0 });
    await expectDuplicateInGroup(api.placements.assign({ campaignId, ouId: units.site3, workerIds: [workers[0]], onConflict: "error" }));
    const rows = await placements();
    expect(rows.filter((r) => r.worker_id === workers[0]).map((r) => r.ou_id)).toEqual([units.site2]);
    await assertOnePerGroup();
  });

  it("C-e: a legacy container without a group rejects placements (P0001); an Employer container with a group accepts them", async () => {
    await expectKind(api.placements.assign({ campaignId, ouId: units.legacyContainer, workerIds: [workers[0]] }), "rule_violation");
    const res = await api.placements.assign({ campaignId, ouId: units.employer, workerIds: [workers[0]], source: "universe" });
    expect(res.inserted).toBe(1);
    expect((await placements()).find((r) => r.ou_id === units.employer)).toMatchObject({ worker_id: workers[0], assignment_source: "universe", group_id: groups.employer });
  });

  it("C-h: isPrimary makes the placement the single campaign-wide primary", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]], isPrimary: true });
    await api.placements.assign({ campaignId, ouId: units.shift1, workerIds: [workers[0]], isPrimary: true });
    const rows = (await placements()).filter((r) => r.worker_id === workers[0]);
    expect(rows.filter((r) => r.is_primary).map((r) => r.ou_id)).toEqual([units.shift1]);
    await assertSinglePrimary();
  });

  it("rejects a non-member (22023), an unknown worker (P0002), a bad source and a bad conflict mode (22023)", async () => {
    const nonMember = unwrap(
      await client.from("workers").select("worker_id").not("worker_id", "in", `(${workers.join(",")})`).order("worker_id").limit(1),
      "a non-member worker"
    ) as { worker_id: number }[];
    if (nonMember.length > 0) {
      await expectKind(api.placements.assign({ campaignId, ouId: units.site1, workerIds: [nonMember[0].worker_id] }), "invalid_argument");
    }
    await expectKind(api.placements.assign({ campaignId, ouId: units.site1, workerIds: [2_000_000_000] }), "not_found");
    await expectKind(api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]], source: "magic" as "manual" }), "invalid_argument");
    await expectKind(api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]], onConflict: "maybe" as "skip" }), "invalid_argument");
    await expectKind(api.placements.assign({ campaignId, ouId: otherUnitId, workerIds: [workers[0]] }), "invalid_argument");
  });
});

describe("structure_placements_move", () => {
  it("C-b/C-l: a move re-points the source row (same id, same provenance) and displaces the target group's other placement", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]], source: "universe", isPrimary: true });
    const rowBefore = (await placements()).find((r) => r.worker_id === workers[0])!;
    const res = await api.placements.move({ campaignId, workerIds: [workers[0]], fromOuId: units.site1, toOuId: units.site3, keepInParent: false });
    expect(res).toMatchObject({ moved: 1, inserted: 0, displaced: 0, removed: 0, skipped: 0, parent_inserted: 0 });
    const rowAfter = (await placements()).find((r) => r.worker_id === workers[0])!;
    expect(rowAfter).toMatchObject({ id: rowBefore.id, ou_id: units.site3, assignment_source: "universe", is_primary: true });
    await assertOnePerGroup();
  });

  it("re-issuing a completed move is a no-op (skipped), and a missing source row is not_found", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]] });
    await api.placements.move({ campaignId, workerIds: [workers[0]], fromOuId: units.site1, toOuId: units.site3 });
    const again = await api.placements.move({ campaignId, workerIds: [workers[0]], fromOuId: units.site1, toOuId: units.site3 });
    expect(again).toMatchObject({ moved: 0, skipped: 1, removed: 0 });
    await expectKind(api.placements.move({ campaignId, workerIds: [workers[1]], fromOuId: units.site1, toOuId: units.site3 }), "not_found");
  });

  it("dragging from Unassigned inserts a manual row and displaces the worker's other placement in that group", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]], isPrimary: true });
    const res = await api.placements.move({ campaignId, workerIds: [workers[0]], toOuId: units.site3 });
    expect(res).toMatchObject({ moved: 0, inserted: 1, displaced: 1 });
    const rows = (await placements()).filter((r) => r.worker_id === workers[0]);
    expect(rows).toHaveLength(1);
    // C-h: the displaced row was the primary → the new row becomes primary.
    expect(rows[0]).toMatchObject({ ou_id: units.site3, assignment_source: "manual", is_primary: true });
  });

  it("C-c / K1: copy is allowed across groups and refused within a group (23505, state unchanged)", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]] });
    const res = await api.placements.move({ campaignId, workerIds: [workers[0]], fromOuId: units.site1, toOuId: units.shift1, keepSource: true });
    expect(res).toMatchObject({ inserted: 1, moved: 0, removed: 0 });
    const before = await placements();
    await expectDuplicateInGroup(
      api.placements.move({ campaignId, workerIds: [workers[0]], fromOuId: units.site1, toOuId: units.site3, keepSource: true })
    );
    expect(await placements()).toEqual(before);
    expect(before.filter((r) => r.worker_id === workers[0]).map((r) => r.ou_id).sort()).toEqual([units.site1, units.shift1].sort());
  });

  it("C-d: unassign within one group removes only that group's placement; without a group removes all", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0], workers[1]] });
    await api.placements.assign({ campaignId, ouId: units.shift1, workerIds: [workers[0], workers[1]] });
    const res = await api.placements.move({ campaignId, workerIds: [workers[0]], toOuId: null, withinGroupId: groups.worksite });
    expect(res).toMatchObject({ removed: 1 });
    expect((await placements()).filter((r) => r.worker_id === workers[0]).map((r) => r.ou_id)).toEqual([units.shift1]);
    const all = await api.placements.move({ campaignId, workerIds: [workers[0], workers[1]], toOuId: null });
    expect(all.removed).toBe(3);
    expect((await placements()).filter((r) => workers.slice(0, 2).includes(r.worker_id))).toEqual([]);
    const copyToUnassigned = await api.placements.move({ campaignId, workerIds: [workers[0]], toOuId: null, keepSource: true });
    expect(copyToUnassigned).toMatchObject({ removed: 0, skipped: 1 });
  });

  it("keepInParent creates the Employer-container placement for a worksite child target (M2 going forward) and can be turned off", async () => {
    const res = await api.placements.move({ campaignId, workerIds: [workers[0]], toOuId: units.site1 });
    expect(res).toMatchObject({ inserted: 1, parent_inserted: 1 });
    let rows = (await placements()).filter((r) => r.worker_id === workers[0]);
    expect(rows.map((r) => r.ou_id).sort()).toEqual([units.site1, units.employer].sort());
    // Sibling move keeps the parent placement (already there → not inserted again).
    const sib = await api.placements.move({ campaignId, workerIds: [workers[0]], fromOuId: units.site1, toOuId: units.site2 });
    expect(sib).toMatchObject({ moved: 1, parent_inserted: 0 });
    await clearPlacements();
    const off = await api.placements.move({ campaignId, workerIds: [workers[1]], toOuId: units.site1, keepInParent: false });
    expect(off).toMatchObject({ inserted: 1, parent_inserted: 0 });
    rows = (await placements()).filter((r) => r.worker_id === workers[1]);
    expect(rows.map((r) => r.ou_id)).toEqual([units.site1]);
    await assertOnePerGroup();
  });

  it("legacy check_worker_ou_group_exclusivity still refuses a move between worksites of two different Employer containers (P0001 → rule_violation; wp2.2.md §3.4 C-b note)", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]] });
    const before = await placements();
    await expectKind(
      api.placements.move({ campaignId, workerIds: [workers[0]], fromOuId: units.site1, toOuId: units.siteB, keepInParent: false }),
      "rule_violation"
    );
    expect(await placements()).toEqual(before);
  });

  it("rejects same source and target, withinGroupId with a target, and a container without a group (C-e)", async () => {
    await expectKind(api.placements.move({ campaignId, workerIds: [workers[0]], fromOuId: units.site1, toOuId: units.site1 }), "invalid_argument");
    await expectKind(api.placements.move({ campaignId, workerIds: [workers[0]], toOuId: units.site1, withinGroupId: groups.worksite }), "invalid_argument");
    await expectKind(api.placements.move({ campaignId, workerIds: [workers[0]], toOuId: units.legacyContainer }), "rule_violation");
  });
});

describe("structure_placements_unassign", () => {
  it("removes one placement, a group's placement, or everything; idempotent", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]] });
    await api.placements.assign({ campaignId, ouId: units.shift1, workerIds: [workers[0]] });
    await api.placements.assign({ campaignId, ouId: units.custom1, workerIds: [workers[0]] });
    expect(await api.placements.unassign({ campaignId, workerIds: [workers[0]], ouId: units.site1 })).toEqual({ removed: 1 });
    expect(await api.placements.unassign({ campaignId, workerIds: [workers[0]], withinGroupId: groups.shift })).toEqual({ removed: 1 });
    expect(await api.placements.unassign({ campaignId, workerIds: [workers[0]] })).toEqual({ removed: 1 });
    expect(await api.placements.unassign({ campaignId, workerIds: [workers[0]] })).toEqual({ removed: 0 });
    await expectKind(api.placements.unassign({ campaignId, workerIds: [workers[0]], ouId: units.site1, withinGroupId: groups.shift }), "invalid_argument");
  });
});

describe("structure_placements_set_primary", () => {
  it("C-h: clears the other primary and sets this one; not_found without a placement", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]], isPrimary: true });
    await api.placements.assign({ campaignId, ouId: units.shift1, workerIds: [workers[0]] });
    const res = await api.placements.setPrimary({ campaignId, workerId: workers[0], ouId: units.shift1 });
    expect(res.cleared).toBe(1);
    const rows = (await placements()).filter((r) => r.worker_id === workers[0]);
    expect(rows.find((r) => r.ou_id === units.shift1)?.is_primary).toBe(true);
    expect(rows.find((r) => r.ou_id === units.site1)?.is_primary).toBe(false);
    await assertSinglePrimary();
    await expectKind(api.placements.setPrimary({ campaignId, workerId: workers[1], ouId: units.site1 }), "not_found");
  });
});

describe("structure_placements_replace_rule_rows", () => {
  it("R1: replaces rule rows only; manual and universe rows survive; same-group manual rows win (skipped)", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0]], source: "universe" });
    await api.placements.assign({ campaignId, ouId: units.custom1, workerIds: [workers[1]], source: "manual" });
    await api.placements.assign({ campaignId, ouId: units.shift1, workerIds: [workers[2]], source: "rule" });
    const res = await api.placements.replaceRuleRows({
      campaignId,
      rows: [
        { ou_id: units.custom2, worker_id: workers[1] }, // same custom group as the manual row → skipped
        { ou_id: units.shift1, worker_id: workers[3] },
      ],
    });
    expect(res).toEqual({ removed: 1, inserted: 1, skipped: 1 });
    const rows = await placements();
    expect(rows.find((r) => r.worker_id === workers[0])).toMatchObject({ ou_id: units.site1, assignment_source: "universe" });
    expect(rows.find((r) => r.worker_id === workers[1])).toMatchObject({ ou_id: units.custom1, assignment_source: "manual" });
    expect(rows.find((r) => r.worker_id === workers[2])).toBeUndefined();
    expect(rows.find((r) => r.worker_id === workers[3])).toMatchObject({ ou_id: units.shift1, assignment_source: "rule" });
    await assertOnePerGroup();
  });

  it("rejects a container target, a foreign rule id and a malformed element (22023)", async () => {
    await expectKind(api.placements.replaceRuleRows({ campaignId, rows: [{ ou_id: units.employer, worker_id: workers[0] }] }), "invalid_argument");
    await expectKind(api.placements.replaceRuleRows({ campaignId, rows: [{ ou_id: units.site1, worker_id: workers[0], assigned_rule_id: 2_000_000_000 }] }), "invalid_argument");
    await expectKind(api.placements.replaceRuleRows({ campaignId, rows: [{ ou_id: units.site1 } as never] }), "invalid_argument");
  });
});

describe("structure_materialise_employer_placements", () => {
  it("M2: gives every worksite-child member one universe placement on the Employer container; idempotent", async () => {
    await api.placements.assign({ campaignId, ouId: units.site1, workerIds: [workers[0], workers[1]] });
    await api.placements.assign({ campaignId, ouId: units.site2, workerIds: [workers[2]] });
    await api.placements.assign({ campaignId, ouId: units.employer, workerIds: [workers[2]], source: "manual" });
    const res = await api.placements.materialiseEmployer({ campaignId });
    expect(res).toEqual({ inserted: 2, skipped_existing: 1, containers: 2, multi_container_workers: 0 });
    const rows = (await placements()).filter((r) => r.ou_id === units.employer);
    expect(rows.map((r) => r.worker_id).sort()).toEqual([workers[0], workers[1], workers[2]].sort());
    expect(rows.filter((r) => r.worker_id !== workers[2]).every((r) => r.assignment_source === "universe" && !r.is_primary)).toBe(true);
    expect(await api.placements.materialiseEmployer({ campaignId })).toEqual({ inserted: 0, skipped_existing: 3, containers: 2, multi_container_workers: 0 });
    await assertOnePerGroup();
  });
});

// ---------------------------------------------------------------------------
// Permissions and invariants
// ---------------------------------------------------------------------------

describe("permissions (42501 from the pre-check, never a silent no-op)", () => {
  it.skipIf(!hasForeignUser)(
    "a user without write permission on the campaign gets forbidden from every RPC (SKIPPED when OUX_CONTRACT_FOREIGN_USER_EMAIL/_PASSWORD are unset — report the skipped count)",
    async () => {
    const foreign: Client = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signIn = await foreign.auth.signInWithPassword({ email: env.foreignEmail, password: env.foreignPassword });
    if (signIn.error) throw new Error(`foreign sign-in failed: ${signIn.error.message}`);
    const fapi = structureApi(foreign);
    const before = await placements();
    await expectKind(fapi.placements.unassign({ campaignId, workerIds: workers }), "forbidden");
    await expectKind(fapi.units.update({ campaignId, ouId: units.site3, patch: { name: "hacked" } }), "forbidden");
    await expectKind(fapi.groups.create({ campaignId, kind: "custom", name: "hacked" }), "forbidden");
    await expectKind(fapi.units.create({ campaignId, units: [{ name: "hacked", ou_type: "worksite" }] }), "forbidden");
    expect(await placements()).toEqual(before);
    await foreign.auth.signOut();
    }
  );

  it("the main user gets forbidden on OUX_CONTRACT_FOREIGN_CAMPAIGN_ID (always runs)", async () => {
    // Read through the main client (may be RLS-empty); the two reads must match.
    const before = await placements(env.foreignCampaignId);
    await expectKind(api.placements.unassign({ campaignId: env.foreignCampaignId, workerIds: [workers[0]] }), "forbidden");
    await expectKind(api.units.create({ campaignId: env.foreignCampaignId, units: [{ name: "hacked", ou_type: "worksite" }] }), "forbidden");
    await expectKind(api.groups.create({ campaignId: env.foreignCampaignId, kind: "custom", name: "hacked" }), "forbidden");
    expect(await placements(env.foreignCampaignId)).toEqual(before);
  });

  it("a missing campaign is not_found", async () => {
    await expectKind(api.placements.unassign({ campaignId: 2_000_000_000, workerIds: [workers[0]] }), "not_found");
  });
});

describe("invariants after the suite", () => {
  it("C-a: no (worker, group) pair holds two placements; C-h: no worker holds two primaries", async () => {
    await assertOnePerGroup();
    await assertSinglePrimary();
  });

  it("C-f: no RPC created a unit named Unassigned", async () => {
    const names = (await campaignUnits()).map((u) => u.name.trim().toLowerCase());
    expect(names).not.toContain("unassigned");
  });
});
