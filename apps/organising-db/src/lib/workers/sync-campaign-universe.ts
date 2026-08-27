import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

/**
 * Keep campaign membership and employer/worksite organising units in step
 * with the global worker record.
 *
 * Employer and worksite live on `workers` (one primary of each). Campaigns
 * declare a universe via `campaign_employers` / `campaign_worksites`. When a
 * worker is placed at an employer or worksite, they should appear in every
 * active/planning (non-SMS-episode) campaign whose universe includes that
 * employer or worksite — and in any matching employer/worksite units.
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
  isGroupContainer: boolean;
  employerId: number | null;
  worksiteId: number | null;
};

const MEMBERSHIP_CHUNK = 200;
const OU_CHUNK = 200;

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
  const ids: number[] = [];
  for (const ou of ous) {
    if (ou.isGroupContainer) continue;
    if (ou.employerId != null && worker.employerId === ou.employerId) {
      ids.push(ou.ouId);
      continue;
    }
    if (ou.worksiteId != null && worker.worksiteId === ou.worksiteId) {
      ids.push(ou.ouId);
    }
  }
  return ids;
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
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
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

async function loadOuTargets(
  supabase: Supa,
  campaignIds: number[]
): Promise<OuPlacementTarget[]> {
  const out: OuPlacementTarget[] = [];
  for (const batch of chunk(campaignIds, 200)) {
    const { data, error } = await supabase
      .from("campaign_organising_units")
      .select("ou_id, campaign_id, is_group_container, unit_basis")
      .in("campaign_id", batch);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      out.push({
        ouId: row.ou_id as number,
        campaignId: row.campaign_id as number,
        isGroupContainer: Boolean(row.is_group_container),
        employerId: parseUnitBasisId(row.unit_basis, "employer_id"),
        worksiteId: parseUnitBasisId(row.unit_basis, "worksite_id"),
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

async function upsertOuAssignments(
  supabase: Supa,
  rows: { ou_id: number; worker_id: number; assignment_source: string }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let count = 0;
  for (const batch of chunk(rows, OU_CHUNK)) {
    const { error } = await supabase.from("campaign_worker_ou").upsert(batch, {
      onConflict: "ou_id,worker_id",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
    count += batch.length;
  }
  return count;
}

export type SyncWorkersResult = {
  membershipsUpserted: number;
  ouAssignmentsUpserted: number;
  campaignsTouched: number;
};

/**
 * Given workers that already have (or just received) a global employer /
 * worksite, add them to every matching live campaign and place them in
 * matching employer/worksite units.
 */
export async function syncWorkersToMatchingCampaigns(
  supabase: Supa,
  workerIds: number[]
): Promise<SyncWorkersResult> {
  const uniqueIds = [...new Set(workerIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueIds.length === 0) {
    return { membershipsUpserted: 0, ouAssignmentsUpserted: 0, campaignsTouched: 0 };
  }

  const workers = (await loadWorkerPlacements(supabase, uniqueIds)).filter(
    (w) => w.employerId != null || w.worksiteId != null
  );
  if (workers.length === 0) {
    return { membershipsUpserted: 0, ouAssignmentsUpserted: 0, campaignsTouched: 0 };
  }

  const campaigns = await loadActiveCampaignUniverses(supabase);
  const matchingCampaigns = campaigns.filter((c) =>
    workers.some((w) => workerMatchesCampaignUniverse(w, c))
  );
  if (matchingCampaigns.length === 0) {
    return { membershipsUpserted: 0, ouAssignmentsUpserted: 0, campaignsTouched: 0 };
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

  const ouRows: { ou_id: number; worker_id: number; assignment_source: string }[] = [];
  for (const campaign of matchingCampaigns) {
    const campaignOus = ousByCampaign.get(campaign.campaignId) ?? [];
    for (const worker of workers) {
      if (!workerMatchesCampaignUniverse(worker, campaign)) continue;
      for (const ouId of matchingOusForWorker(worker, campaignOus)) {
        ouRows.push({ ou_id: ouId, worker_id: worker.workerId, assignment_source: "rule" });
      }
    }
  }

  const membershipsUpserted = await upsertMembership(supabase, membershipRows);
  const ouAssignmentsUpserted = await upsertOuAssignments(supabase, ouRows);
  return {
    membershipsUpserted,
    ouAssignmentsUpserted,
    campaignsTouched: matchingCampaigns.length,
  };
}

export type SyncCampaignUniverseResult = {
  workersAdded: number;
  ouAssignmentsUpserted: number;
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
    return { workersAdded: 0, ouAssignmentsUpserted: 0 };
  }

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("campaign_id, status, is_sms_episode")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (campErr) throw new Error(campErr.message);
  if (!campaign || campaign.is_sms_episode) {
    return { workersAdded: 0, ouAssignmentsUpserted: 0 };
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
    return { workersAdded: 0, ouAssignmentsUpserted: 0 };
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
    return { workersAdded: 0, ouAssignmentsUpserted: 0 };
  }

  const membershipRows = workerIds.map((worker_id) => ({ campaign_id: campaignId, worker_id }));
  await upsertMembership(supabase, membershipRows);

  const placements = await loadWorkerPlacements(supabase, workerIds);
  const ous = await loadOuTargets(supabase, [campaignId]);
  const ouRows: { ou_id: number; worker_id: number; assignment_source: string }[] = [];
  for (const worker of placements) {
    for (const ouId of matchingOusForWorker(worker, ous)) {
      ouRows.push({ ou_id: ouId, worker_id: worker.workerId, assignment_source: "rule" });
    }
  }
  const ouAssignmentsUpserted = await upsertOuAssignments(supabase, ouRows);
  return { workersAdded: workerIds.length, ouAssignmentsUpserted };
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
