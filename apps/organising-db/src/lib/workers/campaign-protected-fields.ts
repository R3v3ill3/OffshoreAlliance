/**
 * Campaign-protected worker fields for imports.
 *
 * Campaign work (wall charts, unit placement, organiser edits) keeps a
 * worker's employer, worksite and job title more current than the union's
 * membership system does, while the membership system is authoritative for
 * membership status. Imports sourced from the membership system therefore
 * must not overwrite those three fields on a worker who is in a campaign.
 *
 * "In a campaign" means a `campaign_worker_membership` row on a campaign
 * that is not an SMS episode and is not completed — planning, active and
 * suspended campaigns all count. Workers with no campaign membership take
 * every field the import carries, as before.
 */

import { chunkArray, IN_FILTER_CHUNK } from "@/lib/supabase/chunk-in-filter";

export const CAMPAIGN_PROTECTED_WORKER_FIELDS = [
  "employer_id",
  "worksite_id",
  "canonical_occupation_id",
] as const;

export type CampaignProtectedWorkerField = (typeof CAMPAIGN_PROTECTED_WORKER_FIELDS)[number];

export const CAMPAIGN_PROTECTED_FIELD_LABELS: Record<CampaignProtectedWorkerField, string> = {
  employer_id: "employer",
  worksite_id: "worksite",
  canonical_occupation_id: "job title",
};

/**
 * Campaign statuses whose membership protects a worker's employer /
 * worksite / job title from import overwrite. `completed` is excluded: a
 * finished campaign's data is no longer being maintained.
 */
export const PROTECTING_CAMPAIGN_STATUSES = ["planning", "active", "suspended"] as const;

/**
 * Remove the protected keys from an update patch. Pure; returns the fields
 * that were dropped so callers can report them. A key whose value is
 * `undefined` is not reported (nothing was going to be written).
 */
export function stripCampaignProtectedFields<T extends Record<string, unknown>>(
  patch: T,
  isProtected: boolean
): { patch: T; protectedFields: CampaignProtectedWorkerField[] } {
  if (!isProtected) return { patch, protectedFields: [] };
  const out: Record<string, unknown> = { ...patch };
  const protectedFields: CampaignProtectedWorkerField[] = [];
  for (const key of CAMPAIGN_PROTECTED_WORKER_FIELDS) {
    if (key in out) {
      if (out[key] !== undefined) protectedFields.push(key);
      delete out[key];
    }
  }
  return { patch: out as T, protectedFields };
}

/**
 * Format the dropped fields for a row-level note, e.g.
 * "employer, worksite and job title kept from campaign".
 */
export function describeProtectedFields(fields: readonly CampaignProtectedWorkerField[]): string {
  const labels = fields.map((f) => CAMPAIGN_PROTECTED_FIELD_LABELS[f]);
  if (labels.length === 0) return "";
  if (labels.length === 1) return `${labels[0]} kept from campaign`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]} kept from campaign`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/**
 * The subset of `workerIds` that are members of a protecting campaign.
 * Reads `campaign_worker_membership` joined to `campaigns` in
 * `IN_FILTER_CHUNK` batches so a several-thousand-row import neither
 * exceeds the request URL limit nor trips PostgREST's max-rows cap
 * (each batch is small enough that a single page holds every match).
 * Throws on a read error rather than silently treating everyone as
 * unprotected.
 */
export async function loadCampaignProtectedWorkerIds(
  supabase: Supa,
  workerIds: readonly number[]
): Promise<Set<number>> {
  const uniqueIds = [...new Set(workerIds.filter((id) => Number.isFinite(id) && id > 0))];
  const out = new Set<number>();
  if (uniqueIds.length === 0) return out;

  for (const batch of chunkArray(uniqueIds, IN_FILTER_CHUNK)) {
    const { data, error } = await supabase
      .from("campaign_worker_membership")
      .select("worker_id, campaign:campaigns!inner(status, is_sms_episode)")
      .in("worker_id", batch)
      .eq("campaign.is_sms_episode", false)
      .in("campaign.status", [...PROTECTING_CAMPAIGN_STATUSES]);
    if (error) {
      throw new Error(`Could not load campaign membership for protection: ${error.message}`);
    }
    for (const row of data ?? []) {
      const id = Number((row as { worker_id: number }).worker_id);
      if (Number.isFinite(id)) out.add(id);
    }
  }
  return out;
}
