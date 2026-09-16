import { structureApi } from "@/lib/campaign/structure-api";
import { assertRowsAffected } from "@/lib/supabase/assert-rows-affected";
import { fetchAllRows, POSTGREST_PAGE_SIZE } from "@/lib/supabase/fetch-all-rows";
import {
  universeMatchModeFromFlags,
  type UniverseMatchMode,
} from "@/lib/workers/sync-campaign-universe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const BATCH = 200;

export type MembershipEmployerClass = "keep" | "wrong_employer" | "no_employer";

export type CampaignEmployerOption = {
  employerId: number;
  employerName: string;
};

export type ClassifiedMember = {
  workerId: number;
  firstName: string;
  lastName: string;
  employerId: number | null;
  employerName: string | null;
  worksiteId: number | null;
  worksiteName: string | null;
  class: MembershipEmployerClass;
};

export type UniverseRefreshReview = {
  campaignId: number;
  matchMode: UniverseMatchMode;
  campaignEmployers: CampaignEmployerOption[];
  keepCount: number;
  wrongEmployer: ClassifiedMember[];
  noEmployer: ClassifiedMember[];
  blockedReason: string | null;
};

export type NoEmployerAction = "remove" | "set_employer";

export type NoEmployerChoice = {
  workerId: number;
  action: NoEmployerAction;
  employerId?: number | null;
};

export type UniverseRefreshPlan = {
  removeWorkerIds: number[];
  setEmployer: Array<{ workerId: number; employerId: number }>;
};

export type ApplyUniverseRefreshResult = {
  removed: number;
  employersSet: number;
};

export function classifyMemberEmployer(
  employerId: number | null | undefined,
  campaignEmployerIds: readonly number[]
): MembershipEmployerClass {
  if (employerId == null) return "no_employer";
  return campaignEmployerIds.includes(employerId) ? "keep" : "wrong_employer";
}

export function refreshBlockedReason(input: {
  matchMode: UniverseMatchMode;
  campaignEmployerCount: number;
}): string | null {
  if (input.matchMode === "or") {
    return "Turn off “Include other employers at these sites” before refreshing. Refresh removes workers whose employer is not a campaign employer.";
  }
  if (input.campaignEmployerCount === 0) {
    return "Save at least one campaign employer before refreshing membership.";
  }
  return null;
}

export function workerDisplayName(member: Pick<ClassifiedMember, "firstName" | "lastName" | "workerId">): string {
  const name = `${member.firstName} ${member.lastName}`.trim();
  return name || `Worker #${member.workerId}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function uniquePositiveIds(ids: Array<number | null | undefined>): number[] {
  return [...new Set(ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id) && id > 0))];
}

function resolveSetEmployerId(
  choice: NoEmployerChoice,
  campaignEmployers: CampaignEmployerOption[]
): number {
  if (choice.employerId != null) {
    if (!campaignEmployers.some((e) => e.employerId === choice.employerId)) {
      throw new Error(
        `Employer #${choice.employerId} is not a saved employer on this campaign.`
      );
    }
    return choice.employerId;
  }
  if (campaignEmployers.length === 1) return campaignEmployers[0].employerId;
  throw new Error("Choose which campaign employer to set for workers with no employer.");
}

/**
 * Builds the writes from a fresh review plus the organiser's choices for
 * members with no employer. Wrong-employer members are always removed.
 * Every current no-employer member must have a choice.
 */
export function planUniverseRefresh(
  review: UniverseRefreshReview,
  noEmployerChoices: readonly NoEmployerChoice[]
): UniverseRefreshPlan {
  const blocked =
    review.blockedReason ??
    refreshBlockedReason({
      matchMode: review.matchMode,
      campaignEmployerCount: review.campaignEmployers.length,
    });
  if (blocked) throw new Error(blocked);

  const choiceByWorker = new Map(noEmployerChoices.map((c) => [c.workerId, c]));
  const missing = review.noEmployer
    .filter((m) => !choiceByWorker.has(m.workerId))
    .map((m) => workerDisplayName(m));
  if (missing.length > 0) {
    const shown = missing.slice(0, 8).join(", ");
    const extra = missing.length > 8 ? ` and ${missing.length - 8} more` : "";
    throw new Error(
      `Choose remove or set employer for every worker with no employer (${shown}${extra}).`
    );
  }

  const removeWorkerIds = review.wrongEmployer.map((m) => m.workerId);
  const setEmployer: Array<{ workerId: number; employerId: number }> = [];

  for (const member of review.noEmployer) {
    const choice = choiceByWorker.get(member.workerId);
    if (!choice) continue;
    if (choice.action === "remove") {
      removeWorkerIds.push(member.workerId);
      continue;
    }
    setEmployer.push({
      workerId: member.workerId,
      employerId: resolveSetEmployerId(choice, review.campaignEmployers),
    });
  }

  return {
    removeWorkerIds: [...new Set(removeWorkerIds)],
    setEmployer,
  };
}

async function loadNameMap(
  supabase: Supa,
  table: "employers" | "worksites",
  idColumn: "employer_id" | "worksite_id",
  nameColumn: "employer_name" | "worksite_name",
  ids: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  for (const batch of chunk(ids, BATCH)) {
    const { data, error } = await supabase
      .from(table)
      .select(`${idColumn}, ${nameColumn}`)
      .in(idColumn, batch);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const id = row[idColumn] as number;
      const name = (row[nameColumn] as string | null) ?? null;
      if (typeof id === "number") map.set(id, name?.trim() || `${table === "employers" ? "Employer" : "Worksite"} #${id}`);
    }
  }
  return map;
}

export async function loadUniverseRefreshReview(
  supabase: Supa,
  campaignId: number
): Promise<UniverseRefreshReview> {
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("campaign_id, sector_wide")
    .eq("campaign_id", campaignId)
    .single();
  if (campErr) throw new Error(campErr.message);
  if (!campaign) throw new Error("Campaign not found.");

  const { data: worksiteRows, error: wsErr } = await supabase
    .from("campaign_worksites")
    .select("worksite_id, sector_wide")
    .eq("campaign_id", campaignId);
  if (wsErr) throw new Error(wsErr.message);

  const { data: employerRows, error: empErr } = await supabase
    .from("campaign_employers")
    .select("employer_id")
    .eq("campaign_id", campaignId);
  if (empErr) throw new Error(empErr.message);

  const campaignEmployerIds = uniquePositiveIds(
    (employerRows ?? []).map((r: { employer_id: number | null }) => r.employer_id)
  );
  const employerNames = await loadNameMap(
    supabase,
    "employers",
    "employer_id",
    "employer_name",
    campaignEmployerIds
  );
  const campaignEmployers: CampaignEmployerOption[] = campaignEmployerIds.map((employerId) => ({
    employerId,
    employerName: employerNames.get(employerId) ?? `Employer #${employerId}`,
  }));

  const matchMode = universeMatchModeFromFlags({
    campaignSectorWide: Boolean((campaign as { sector_wide?: boolean | null }).sector_wide),
    worksiteSectorWide: (worksiteRows ?? []).some(
      (r: { sector_wide?: boolean | null }) => Boolean(r.sector_wide)
    ),
  });

  const membership = await fetchAllRows<{ worker_id: number }>(
    (from, to) =>
      supabase
        .from("campaign_worker_membership")
        .select("worker_id")
        .eq("campaign_id", campaignId)
        .order("worker_id")
        .range(from, to),
    POSTGREST_PAGE_SIZE
  );
  const workerIds = uniquePositiveIds(membership.map((r) => r.worker_id));

  const workers: Array<{
    worker_id: number;
    first_name: string | null;
    last_name: string | null;
    employer_id: number | null;
    worksite_id: number | null;
  }> = [];
  for (const batch of chunk(workerIds, BATCH)) {
    const { data, error } = await supabase
      .from("workers")
      .select("worker_id, first_name, last_name, employer_id, worksite_id")
      .in("worker_id", batch);
    if (error) throw new Error(error.message);
    workers.push(...((data ?? []) as typeof workers));
  }

  const workerEmployerNames = await loadNameMap(
    supabase,
    "employers",
    "employer_id",
    "employer_name",
    uniquePositiveIds(workers.map((w) => w.employer_id))
  );
  const workerWorksiteNames = await loadNameMap(
    supabase,
    "worksites",
    "worksite_id",
    "worksite_name",
    uniquePositiveIds(workers.map((w) => w.worksite_id))
  );

  const keep: ClassifiedMember[] = [];
  const wrongEmployer: ClassifiedMember[] = [];
  const noEmployer: ClassifiedMember[] = [];

  for (const row of workers) {
    const classified: ClassifiedMember = {
      workerId: row.worker_id,
      firstName: row.first_name ?? "",
      lastName: row.last_name ?? "",
      employerId: row.employer_id ?? null,
      employerName: row.employer_id != null ? workerEmployerNames.get(row.employer_id) ?? null : null,
      worksiteId: row.worksite_id ?? null,
      worksiteName: row.worksite_id != null ? workerWorksiteNames.get(row.worksite_id) ?? null : null,
      class: classifyMemberEmployer(row.employer_id ?? null, campaignEmployerIds),
    };
    if (classified.class === "keep") keep.push(classified);
    else if (classified.class === "wrong_employer") wrongEmployer.push(classified);
    else noEmployer.push(classified);
  }

  const byName = (a: ClassifiedMember, b: ClassifiedMember) =>
    a.lastName.localeCompare(b.lastName) ||
    a.firstName.localeCompare(b.firstName) ||
    a.workerId - b.workerId;
  wrongEmployer.sort(byName);
  noEmployer.sort(byName);

  return {
    campaignId,
    matchMode,
    campaignEmployers,
    keepCount: keep.length,
    wrongEmployer,
    noEmployer,
    blockedReason: refreshBlockedReason({
      matchMode,
      campaignEmployerCount: campaignEmployers.length,
    }),
  };
}

async function removeMembers(
  supabase: Supa,
  campaignId: number,
  workerIds: number[]
): Promise<number> {
  if (workerIds.length === 0) return 0;

  for (const batch of chunk(workerIds, BATCH)) {
    await structureApi(supabase).placements.unassign({
      campaignId,
      workerIds: batch,
    });
  }

  for (const batch of chunk(workerIds, BATCH)) {
    const memRes = await supabase
      .from("campaign_worker_membership")
      .delete({ count: "exact" })
      .eq("campaign_id", campaignId)
      .in("worker_id", batch);
    assertRowsAffected(memRes, batch.length, "Removing workers from the campaign");
  }

  const { data: campaignLists, error: listErr } = await supabase
    .from("call_lists")
    .select("list_id")
    .eq("campaign_id", campaignId);
  if (listErr) throw new Error(listErr.message);
  const listIds = (campaignLists ?? []).map((l: { list_id: number }) => l.list_id);
  if (listIds.length > 0) {
    for (const batch of chunk(workerIds, BATCH)) {
      const { error } = await supabase
        .from("call_list_items")
        .delete()
        .in("worker_id", batch)
        .in("list_id", listIds);
      if (error) throw new Error(error.message);
    }
  }

  return workerIds.length;
}

async function setWorkerEmployers(
  supabase: Supa,
  assignments: Array<{ workerId: number; employerId: number }>
): Promise<number> {
  if (assignments.length === 0) return 0;
  const byEmployer = new Map<number, number[]>();
  for (const row of assignments) {
    const list = byEmployer.get(row.employerId) ?? [];
    list.push(row.workerId);
    byEmployer.set(row.employerId, list);
  }
  let updated = 0;
  for (const [employerId, workerIds] of byEmployer) {
    for (const batch of chunk(workerIds, BATCH)) {
      const res = await supabase
        .from("workers")
        .update({ employer_id: employerId })
        .in("worker_id", batch);
      if (res.error) throw res.error;
      updated += batch.length;
    }
  }
  return updated;
}

/**
 * Re-reads saved campaign employers and current members, then applies the
 * organiser's no-employer choices. Wrong-employer members are removed.
 */
export async function applyUniverseRefresh(
  supabase: Supa,
  input: {
    campaignId: number;
    noEmployerChoices: readonly NoEmployerChoice[];
  }
): Promise<ApplyUniverseRefreshResult> {
  const review = await loadUniverseRefreshReview(supabase, input.campaignId);
  const plan = planUniverseRefresh(review, input.noEmployerChoices);

  const employersSet = await setWorkerEmployers(supabase, plan.setEmployer);
  const removed = await removeMembers(supabase, input.campaignId, plan.removeWorkerIds);
  return { removed, employersSet };
}
