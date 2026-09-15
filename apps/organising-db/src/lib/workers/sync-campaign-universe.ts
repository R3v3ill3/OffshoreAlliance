import { structureApi } from "@/lib/campaign/structure-api";
import { fetchAllRows, POSTGREST_PAGE_SIZE } from "@/lib/supabase/fetch-all-rows";

/**
 * Keep campaign membership and employer/worksite organising units in step
 * with the global worker record.
 *
 * Employer and worksite live on `workers` (one primary of each). Campaigns
 * declare a universe via `campaign_employers` / `campaign_worksites`. When a
 * worker is placed at an employer or worksite, they should appear in every
 * active/planning (non-SMS-episode) campaign whose universe includes that
 * employer or worksite — and in any matching employer/worksite units.
 *
 * WP2.2 Stage 6 (wp2.2.md §3.11 row 15, §3.7, §3.8 R1, §3.10): every
 * placement this module writes goes through `structureApi(client)
 * .placements.assign({ source: "universe", onConflict: "skip" })`, one call
 * per target unit, so a worker already placed in the target's group is
 * skipped rather than duplicated (C-a) and Recompute no longer withdraws
 * these rows (R1). A matched worksite child's Employer container (a container
 * with a group) is also a target, so members get their Employer placement at
 * sync time (§3.7). `loadOuTargets` is paged (§3.10). Membership rows are not
 * one of the two structure tables and are still upserted directly.
 */

export type WorkerPlacement = {
  workerId: number;
  employerId: number | null;
  worksiteId: number | null;
};

export type CampaignUniverse = {
  campaignId: number;
  employerIds: number[];
  worksiteIds: number[];
};

export type OuPlacementTarget = {
  ouId: number;
  campaignId: number;
  futureGroupKey: string | null;
  isGroupContainer: boolean;
  autoMatch: boolean;
  employerId: number | null;
  worksiteId: number | null;
  /**
   * `ou_group_id` — the group container this unit is a member of, when any
   * (§3.7: a matched member's container is a target too). Optional so the
   * pure matcher keeps accepting the pre-Stage-6 shape.
   */
  ouGroupId?: number | null;
};

export type LegacyOuGroupIdentity = {
  ouId: number;
  ouType: string;
  ouGroupId: number | null;
  isGroupContainer: boolean;
};

const GROUP_KIND_BY_OU_TYPE: Readonly<Record<string, string>> = {
  worksite: "worksite",
  employer: "employer",
  shift: "shift",
  crew_rotation: "crew",
  job_type: "occupation",
  work_area: "work_area",
  department: "custom",
  custom: "custom",
  network: "custom",
  ethnic_community: "custom",
  accommodation: "custom",
};

const MEMBERSHIP_CHUNK = 200;
const OU_CHUNK = 200;

/**
 * Page size of the `loadOuTargets` read (wp2.2.md §3.10): PostgREST's
 * max-rows setting silently truncates an unranged select, so the units are
 * read in `.order("ou_id").range(from, from + PAGE_SIZE - 1)` pages until a
 * short page. Exported for the paging test.
 */
export const PAGE_SIZE: number = POSTGREST_PAGE_SIZE;

/**
 * Mirrors WP2.1's FGK-EXPRESSION using only columns that predate the migration,
 * so application deployment remains safe before and after group_id is added.
 */
export function futureGroupKeyForLegacyOu(
  ou: LegacyOuGroupIdentity,
  parent: LegacyOuGroupIdentity | undefined
): string | null {
  const kind = GROUP_KIND_BY_OU_TYPE[ou.ouType];
  if (kind == null) return null;
  if (ou.isGroupContainer && kind === "custom") return null;
  if (kind !== "custom") return `kind:${kind}`;

  const parentKind = parent == null ? null : GROUP_KIND_BY_OU_TYPE[parent.ouType];
  if (
    ou.ouGroupId != null &&
    parent?.ouId === ou.ouGroupId &&
    parent.isGroupContainer &&
    parentKind === "custom"
  ) {
    return `source:${parent.ouId}`;
  }
  return `type:${ou.ouType}`;
}

export function workerMatchesCampaignUniverse(
  worker: WorkerPlacement,
  campaign: CampaignUniverse
): boolean {
  if (worker.employerId != null && campaign.employerIds.includes(worker.employerId)) {
    return true;
  }
  if (worker.worksiteId != null && campaign.worksiteIds.includes(worker.worksiteId)) {
    return true;
  }
  return false;
}

export function matchingOusForWorker(
  worker: WorkerPlacement,
  ous: OuPlacementTarget[]
): number[] {
  const candidates: Array<{
    ouId: number;
    partitionKey: string;
    specificity: number;
  }> = [];
  const maximumSpecificity = new Map<string, number>();

  for (const ou of ous) {
    if (ou.isGroupContainer || !ou.autoMatch || ou.futureGroupKey == null) continue;
    const hasEmployerBasis = ou.employerId != null;
    const hasWorksiteBasis = ou.worksiteId != null;
    if (!hasEmployerBasis && !hasWorksiteBasis) continue;
    if (hasEmployerBasis && worker.employerId !== ou.employerId) continue;
    if (hasWorksiteBasis && worker.worksiteId !== ou.worksiteId) continue;

    const partitionKey = JSON.stringify([ou.campaignId, ou.futureGroupKey]);
    const specificity = Number(hasEmployerBasis) + Number(hasWorksiteBasis);
    candidates.push({ ouId: ou.ouId, partitionKey, specificity });
    maximumSpecificity.set(
      partitionKey,
      Math.max(maximumSpecificity.get(partitionKey) ?? 0, specificity)
    );
  }

  // One unit per group (Stage 6 fix round 1, A1): of the equally specific
  // candidates in a partition (campaign + future group) only the first in
  // input order is kept — the "keep one" the RPC would apply anyway with
  // `p_on_conflict: "skip"` (C-a), decided here so the choice is per worker
  // and deterministic, and so the container appended below always belongs
  // to the child the worker actually lands on.
  const seenPartition = new Set<string>();
  const matched: number[] = [];
  for (const candidate of candidates) {
    if (candidate.specificity !== maximumSpecificity.get(candidate.partitionKey)) continue;
    if (seenPartition.has(candidate.partitionKey)) continue;
    seenPartition.add(candidate.partitionKey);
    matched.push(candidate.ouId);
  }

  // §3.7 (Stage 6, D13 follow-up): the group container a matched member
  // belongs to is a target for the same worker, so a worksite member gets
  // the Employer placement `structure_materialise_employer_placements`
  // would give it. Only a container with a group is a legal target (C-e);
  // for the legacy columns this module reads, "has a group" is exactly
  // `futureGroupKey != null` (a custom-kind container's key is null). The
  // container's own basis / auto_match is not consulted — as in M2, the
  // child's match is what places the worker. Appended after the matched
  // units, once each; `p_on_conflict: "skip"` makes the extra row idempotent.
  const byId = new Map(ous.map((ou) => [ou.ouId, ou]));
  const out = [...matched];
  for (const ouId of matched) {
    const parentId = byId.get(ouId)?.ouGroupId;
    if (parentId == null || out.includes(parentId)) continue;
    const parent = byId.get(parentId);
    if (!parent || !parent.isGroupContainer || parent.futureGroupKey == null) continue;
    out.push(parentId);
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseUnitBasisId(
  basis: unknown,
  key: "employer_id" | "worksite_id"
): number | null {
  if (!basis || typeof basis !== "object") return null;
  const raw = (basis as Record<string, unknown>)[key];
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 && raw <= 2_147_483_647 ? raw : null;
  }
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

function parseUnitBasisAutoMatch(basis: unknown): boolean {
  if (!basis || typeof basis !== "object") return true;
  return (basis as Record<string, unknown>).auto_match !== false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

async function loadWorkerPlacements(
  supabase: Supa,
  workerIds: number[]
): Promise<WorkerPlacement[]> {
  const out: WorkerPlacement[] = [];
  for (const batch of chunk(workerIds, 200)) {
    const { data, error } = await supabase
      .from("workers")
      .select("worker_id, employer_id, worksite_id")
      .in("worker_id", batch);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      out.push({
        workerId: row.worker_id as number,
        employerId: (row.employer_id as number | null) ?? null,
        worksiteId: (row.worksite_id as number | null) ?? null,
      });
    }
  }
  return out;
}

async function loadActiveCampaignUniverses(supabase: Supa): Promise<CampaignUniverse[]> {
  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns")
    .select("campaign_id")
    .in("status", ["planning", "active"])
    .eq("is_sms_episode", false);
  if (campErr) throw new Error(campErr.message);
  const campaignIds = (campaigns ?? []).map((c: { campaign_id: number }) => c.campaign_id);
  if (campaignIds.length === 0) return [];

  const employerIdsByCampaign = new Map<number, number[]>();
  const worksiteIdsByCampaign = new Map<number, number[]>();
  for (const id of campaignIds) {
    employerIdsByCampaign.set(id, []);
    worksiteIdsByCampaign.set(id, []);
  }

  for (const batch of chunk(campaignIds, 200)) {
    const { data: employers, error: empErr } = await supabase
      .from("campaign_employers")
      .select("campaign_id, employer_id")
      .in("campaign_id", batch);
    if (empErr) throw new Error(empErr.message);
    for (const row of employers ?? []) {
      employerIdsByCampaign.get(row.campaign_id as number)?.push(row.employer_id as number);
    }

    const { data: worksites, error: wsErr } = await supabase
      .from("campaign_worksites")
      .select("campaign_id, worksite_id")
      .in("campaign_id", batch)
      .not("worksite_id", "is", null);
    if (wsErr) throw new Error(wsErr.message);
    for (const row of worksites ?? []) {
      if (row.worksite_id == null) continue;
      worksiteIdsByCampaign.get(row.campaign_id as number)?.push(row.worksite_id as number);
    }
  }

  return campaignIds.map((campaignId: number) => ({
    campaignId,
    employerIds: employerIdsByCampaign.get(campaignId) ?? [],
    worksiteIds: worksiteIdsByCampaign.get(campaignId) ?? [],
  }));
}

type OuTargetRow = {
  ou_id: number;
  campaign_id: number;
  ou_type: string;
  ou_group_id: number | null;
  is_group_container: boolean;
  unit_basis: unknown;
};

/**
 * The campaign's units as placement targets. Paged per campaign batch
 * (wp2.2.md §3.10): `.order("ou_id", { ascending: true }).range(from, from +
 * PAGE_SIZE - 1)` until a short page, so a campaign batch with more units
 * than PostgREST's max-rows setting is read completely. Exported for the
 * paging test.
 */
export async function loadOuTargets(
  supabase: Supa,
  campaignIds: number[]
): Promise<OuPlacementTarget[]> {
  const out: OuPlacementTarget[] = [];
  for (const batch of chunk(campaignIds, 200)) {
    const data = await fetchAllRows<OuTargetRow>(
      (from, to) =>
        supabase
          .from("campaign_organising_units")
          .select(
            "ou_id, campaign_id, ou_type, ou_group_id, is_group_container, unit_basis"
          )
          .in("campaign_id", batch)
          .order("ou_id", { ascending: true })
          .range(from, to),
      PAGE_SIZE
    );

    const rows: Array<
      LegacyOuGroupIdentity & { campaignId: number; unitBasis: unknown }
    > = data.map((row) => ({
        ouId: row.ou_id,
        campaignId: row.campaign_id,
        ouType: row.ou_type,
        ouGroupId: row.ou_group_id ?? null,
        isGroupContainer: Boolean(row.is_group_container),
        unitBasis: row.unit_basis,
      }));
    const rowsById = new Map(rows.map((row) => [row.ouId, row]));

    for (const row of rows) {
      const parent = row.ouGroupId == null ? undefined : rowsById.get(row.ouGroupId);
      out.push({
        ouId: row.ouId,
        campaignId: row.campaignId,
        futureGroupKey: futureGroupKeyForLegacyOu(row, parent),
        isGroupContainer: row.isGroupContainer,
        autoMatch: parseUnitBasisAutoMatch(row.unitBasis),
        employerId: parseUnitBasisId(row.unitBasis, "employer_id"),
        worksiteId: parseUnitBasisId(row.unitBasis, "worksite_id"),
        ouGroupId: row.ouGroupId,
      });
    }
  }
  return out;
}

async function upsertMembership(
  supabase: Supa,
  rows: { campaign_id: number; worker_id: number }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let count = 0;
  for (const batch of chunk(rows, MEMBERSHIP_CHUNK)) {
    const { error } = await supabase.from("campaign_worker_membership").upsert(batch, {
      onConflict: "campaign_id,worker_id",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
    count += batch.length;
  }
  return count;
}

type OuPlacementRow = { campaignId: number; ouId: number; workerId: number };

export type OuPlacementCounts = {
  /** Rows the RPC inserted (`inserted`). */
  ouAssignmentsUpserted: number;
  /** Rows the RPC left out: already on the unit, or already in a unit of that group (`skipped`). */
  ouAssignmentsSkipped: number;
};

/**
 * One `structure_placements_assign` per target unit (wp2.2.md §3.11 row 15):
 * `p_source: "universe"` (R1), `p_on_conflict: "skip"`, worker ids batched
 * per unit in `OU_CHUNK`s as the legacy upsert batched its rows. Units are
 * visited in first-seen order. Counts come from the RPC's result, not from
 * the number of rows sent (the legacy count included ignored duplicates).
 */
async function assignOuPlacements(
  supabase: Supa,
  rows: OuPlacementRow[]
): Promise<OuPlacementCounts> {
  const counts: OuPlacementCounts = { ouAssignmentsUpserted: 0, ouAssignmentsSkipped: 0 };
  if (rows.length === 0) return counts;
  const byUnit = new Map<string, { campaignId: number; ouId: number; workerIds: number[] }>();
  for (const row of rows) {
    const key = `${row.campaignId}:${row.ouId}`;
    const unit = byUnit.get(key) ?? { campaignId: row.campaignId, ouId: row.ouId, workerIds: [] };
    if (!unit.workerIds.includes(row.workerId)) unit.workerIds.push(row.workerId);
    byUnit.set(key, unit);
  }
  const api = structureApi(supabase);
  for (const unit of byUnit.values()) {
    for (const batch of chunk(unit.workerIds, OU_CHUNK)) {
      const res = await api.placements.assign({
        campaignId: unit.campaignId,
        ouId: unit.ouId,
        workerIds: batch,
        source: "universe",
        isPrimary: false,
        onConflict: "skip",
      });
      counts.ouAssignmentsUpserted += res.inserted;
      counts.ouAssignmentsSkipped += res.skipped;
    }
  }
  return counts;
}

export type SyncWorkersResult = OuPlacementCounts & {
  membershipsUpserted: number;
  campaignsTouched: number;
  /**
   * Matching campaigns the actor cannot write to (WP1.6). Their enrolment is
   * skipped rather than attempted, because the insert would fail RLS and
   * take the whole enclosing mutation down with it.
   */
  campaignsSkippedNoAccess: number;
};

const EMPTY_SYNC_RESULT: SyncWorkersResult = {
  membershipsUpserted: 0,
  ouAssignmentsUpserted: 0,
  ouAssignmentsSkipped: 0,
  campaignsTouched: 0,
  campaignsSkippedNoAccess: 0,
};

/**
 * Split the campaigns whose universe matches into the ones the actor may
 * write to and a count of the ones they may not. Pure, so the split is unit
 * testable; the writable set comes from the `campaigns_i_can_write` RPC.
 */
export function planUniverseSyncTargets<T extends { campaignId: number }>(
  matching: T[],
  writable: ReadonlySet<number>
): { allowed: T[]; skippedNoAccess: number } {
  const allowed = matching.filter((c) => writable.has(c.campaignId));
  return { allowed, skippedNoAccess: matching.length - allowed.length };
}

async function loadWritableCampaignIds(supabase: Supa, campaignIds: number[]): Promise<Set<number>> {
  if (campaignIds.length === 0) return new Set();
  const { data, error } = await supabase.rpc("campaigns_i_can_write", {
    p_campaign_ids: campaignIds,
  });
  if (error) throw new Error(error.message);
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return new Set<number>(rows.map((n) => Number(n)));
}

/**
 * Given workers that already have (or just received) a global employer /
 * worksite, add them to every matching live campaign the actor can write to
 * and place them in matching employer/worksite units.
 *
 * WP1.6: matching campaigns the actor cannot write to are skipped and counted
 * in `campaignsSkippedNoAccess`. Before WP1.6 those upserts were silent
 * no-ops under the old policies; under campaign-scoped RLS they would raise
 * 42501, so the filter is what keeps worker moves and imports working.
 */
export async function syncWorkersToMatchingCampaigns(
  supabase: Supa,
  workerIds: number[]
): Promise<SyncWorkersResult> {
  const uniqueIds = [...new Set(workerIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueIds.length === 0) {
    return { ...EMPTY_SYNC_RESULT };
  }

  const workers = (await loadWorkerPlacements(supabase, uniqueIds)).filter(
    (w) => w.employerId != null || w.worksiteId != null
  );
  if (workers.length === 0) {
    return { ...EMPTY_SYNC_RESULT };
  }

  const campaigns = await loadActiveCampaignUniverses(supabase);
  const allMatchingCampaigns = campaigns.filter((c) =>
    workers.some((w) => workerMatchesCampaignUniverse(w, c))
  );
  if (allMatchingCampaigns.length === 0) {
    return { ...EMPTY_SYNC_RESULT };
  }

  const writable = await loadWritableCampaignIds(
    supabase,
    allMatchingCampaigns.map((c) => c.campaignId)
  );
  const { allowed: matchingCampaigns, skippedNoAccess } = planUniverseSyncTargets(
    allMatchingCampaigns,
    writable
  );
  if (skippedNoAccess > 0) {
    console.error("[sync-campaign-universe] skipped campaigns the actor cannot write to", {
      skipped: skippedNoAccess,
      of: allMatchingCampaigns.length,
    });
  }
  if (matchingCampaigns.length === 0) {
    return { ...EMPTY_SYNC_RESULT, campaignsSkippedNoAccess: skippedNoAccess };
  }

  const membershipRows: { campaign_id: number; worker_id: number }[] = [];
  for (const campaign of matchingCampaigns) {
    for (const worker of workers) {
      if (workerMatchesCampaignUniverse(worker, campaign)) {
        membershipRows.push({ campaign_id: campaign.campaignId, worker_id: worker.workerId });
      }
    }
  }

  const ous = await loadOuTargets(
    supabase,
    matchingCampaigns.map((c) => c.campaignId)
  );
  const ousByCampaign = new Map<number, OuPlacementTarget[]>();
  for (const ou of ous) {
    const list = ousByCampaign.get(ou.campaignId) ?? [];
    list.push(ou);
    ousByCampaign.set(ou.campaignId, list);
  }

  const ouRows: OuPlacementRow[] = [];
  for (const campaign of matchingCampaigns) {
    const campaignOus = ousByCampaign.get(campaign.campaignId) ?? [];
    for (const worker of workers) {
      if (!workerMatchesCampaignUniverse(worker, campaign)) continue;
      for (const ouId of matchingOusForWorker(worker, campaignOus)) {
        ouRows.push({ campaignId: campaign.campaignId, ouId, workerId: worker.workerId });
      }
    }
  }

  const membershipsUpserted = await upsertMembership(supabase, membershipRows);
  const placementCounts = await assignOuPlacements(supabase, ouRows);
  return {
    membershipsUpserted,
    ...placementCounts,
    campaignsTouched: matchingCampaigns.length,
    campaignsSkippedNoAccess: skippedNoAccess,
  };
}

export type SyncCampaignUniverseResult = OuPlacementCounts & {
  workersAdded: number;
};

const EMPTY_CAMPAIGN_SYNC_RESULT: SyncCampaignUniverseResult = {
  workersAdded: 0,
  ouAssignmentsUpserted: 0,
  ouAssignmentsSkipped: 0,
};

/**
 * Pull every worker whose global employer/worksite is in this campaign's
 * universe into membership, and place them in matching units.
 */
export async function syncCampaignUniverseFromEmployersWorksites(
  supabase: Supa,
  campaignId: number
): Promise<SyncCampaignUniverseResult> {
  if (!Number.isFinite(campaignId)) {
    return { ...EMPTY_CAMPAIGN_SYNC_RESULT };
  }

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("campaign_id, status, is_sms_episode")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (campErr) throw new Error(campErr.message);
  if (!campaign || campaign.is_sms_episode) {
    return { ...EMPTY_CAMPAIGN_SYNC_RESULT };
  }

  const { data: employers, error: empErr } = await supabase
    .from("campaign_employers")
    .select("employer_id")
    .eq("campaign_id", campaignId);
  if (empErr) throw new Error(empErr.message);
  const employerIds = (employers ?? []).map((r: { employer_id: number }) => r.employer_id);

  const { data: worksites, error: wsErr } = await supabase
    .from("campaign_worksites")
    .select("worksite_id")
    .eq("campaign_id", campaignId)
    .not("worksite_id", "is", null);
  if (wsErr) throw new Error(wsErr.message);
  const worksiteIds = (worksites ?? [])
    .map((r: { worksite_id: number | null }) => r.worksite_id)
    .filter((id: number | null): id is number => id != null);

  if (employerIds.length === 0 && worksiteIds.length === 0) {
    return { ...EMPTY_CAMPAIGN_SYNC_RESULT };
  }

  const matchedIds = new Set<number>();
  if (employerIds.length > 0) {
    const rows = await fetchAllRows<{ worker_id: number }>((from, to) =>
      supabase
        .from("workers")
        .select("worker_id")
        .in("employer_id", employerIds)
        .eq("is_active", true)
        .range(from, to)
    );
    for (const row of rows) matchedIds.add(row.worker_id);
  }
  if (worksiteIds.length > 0) {
    const rows = await fetchAllRows<{ worker_id: number }>((from, to) =>
      supabase
        .from("workers")
        .select("worker_id")
        .in("worksite_id", worksiteIds)
        .eq("is_active", true)
        .range(from, to)
    );
    for (const row of rows) matchedIds.add(row.worker_id);
  }

  const workerIds = [...matchedIds];
  if (workerIds.length === 0) {
    return { ...EMPTY_CAMPAIGN_SYNC_RESULT };
  }

  const membershipRows = workerIds.map((worker_id) => ({ campaign_id: campaignId, worker_id }));
  await upsertMembership(supabase, membershipRows);

  const placements = await loadWorkerPlacements(supabase, workerIds);
  const ous = await loadOuTargets(supabase, [campaignId]);
  const ouRows: OuPlacementRow[] = [];
  for (const worker of placements) {
    for (const ouId of matchingOusForWorker(worker, ous)) {
      ouRows.push({ campaignId, ouId, workerId: worker.workerId });
    }
  }
  const placementCounts = await assignOuPlacements(supabase, ouRows);
  return { workersAdded: workerIds.length, ...placementCounts };
}

/**
 * Attach employers/worksites used on imported workers to the campaign universe
 * so the campaign's declared scope matches the people just added.
 */
export async function ensureCampaignUniverseJunctions(
  supabase: Supa,
  campaignId: number,
  employerIds: number[],
  worksiteIds: number[]
): Promise<void> {
  const uniqueEmployers = [...new Set(employerIds.filter((id) => Number.isFinite(id) && id > 0))];
  const uniqueWorksites = [...new Set(worksiteIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueEmployers.length > 0) {
    await supabase.from("campaign_employers").upsert(
      uniqueEmployers.map((employer_id) => ({ campaign_id: campaignId, employer_id })),
      { onConflict: "campaign_id,employer_id", ignoreDuplicates: true }
    );
  }
  if (uniqueWorksites.length > 0) {
    const { data: existing } = await supabase
      .from("campaign_worksites")
      .select("worksite_id")
      .eq("campaign_id", campaignId)
      .in("worksite_id", uniqueWorksites);
    const have = new Set(
      (existing ?? []).map((r: { worksite_id: number | null }) => r.worksite_id)
    );
    const toAdd = uniqueWorksites
      .filter((id) => !have.has(id))
      .map((worksite_id) => ({
        campaign_id: campaignId,
        worksite_id,
        sector_wide: false,
      }));
    if (toAdd.length > 0) {
      await supabase.from("campaign_worksites").insert(toAdd);
    }
  }
}

export function employerWorksiteFromOuBasis(unitBasis: unknown): {
  employerId: number | null;
  worksiteId: number | null;
} {
  return {
    employerId: parseUnitBasisId(unitBasis, "employer_id"),
    worksiteId: parseUnitBasisId(unitBasis, "worksite_id"),
  };
}

/**
 * Stamp global employer/worksite from an organising unit's unit_basis when
 * the worker does not already have that field set (fill-blanks).
 */
export async function stampEmployerWorksiteFromOu(
  supabase: Supa,
  workerIds: number[],
  unitBasis: unknown
): Promise<number> {
  const { employerId, worksiteId } = employerWorksiteFromOuBasis(unitBasis);
  if (employerId == null && worksiteId == null) return 0;
  const uniqueIds = [...new Set(workerIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueIds.length === 0) return 0;

  const placements = await loadWorkerPlacements(supabase, uniqueIds);
  let stamped = 0;
  for (const worker of placements) {
    const patch: { employer_id?: number; worksite_id?: number } = {};
    if (employerId != null && worker.employerId == null) patch.employer_id = employerId;
    if (worksiteId != null && worker.worksiteId == null) patch.worksite_id = worksiteId;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase.from("workers").update(patch).eq("worker_id", worker.workerId);
    if (error) throw new Error(error.message);
    stamped++;
  }
  return stamped;
}
