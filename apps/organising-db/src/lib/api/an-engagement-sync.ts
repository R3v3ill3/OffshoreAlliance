import { SupabaseClient } from "@supabase/supabase-js";
import { ActionNetworkClient } from "./action-network";

/**
 * Poll AN for message stats and update campaign_comms_drafts.
 * Called after sending an email via AN to track engagement.
 */
export async function pollMessageStats(
  supabase: SupabaseClient,
  anClient: ActionNetworkClient,
  draftId: number
): Promise<{ total_targeted: number; verified_opened: number } | null> {
  const { data: draft, error } = await supabase
    .from("campaign_comms_drafts")
    .select("draft_id, external_message_id, send_stats")
    .eq("draft_id", draftId)
    .single();

  if (error || !draft?.external_message_id) return null;

  const message = await anClient.getMessage(draft.external_message_id);

  const stats = {
    total_targeted: (message as any).total_targeted || 0,
    verified_opened: (message as any).verified_opened || 0,
    status: (message as any).status || "unknown",
    sent_start_date: (message as any).sent_start_date || null,
    polled_at: new Date().toISOString(),
  };

  await supabase
    .from("campaign_comms_drafts")
    .update({ send_stats: stats })
    .eq("draft_id", draftId);

  return {
    total_targeted: stats.total_targeted,
    verified_opened: stats.verified_opened,
  };
}

/**
 * Get all distinct AN tags cached for workers in a campaign.
 * Used by the list builder to show available tag filters.
 */
export async function getCampaignAnTags(
  supabase: SupabaseClient,
  campaignId: number
): Promise<
  { an_tag_id: string; an_tag_name: string; worker_count: number }[]
> {
  const { data: memberRows } = await supabase
    .from("campaign_worker_membership")
    .select("worker_id")
    .eq("campaign_id", campaignId);

  if (!memberRows?.length) return [];

  const workerIds = memberRows.map((r) => r.worker_id);

  const { data: tagRows, error } = await supabase
    .from("worker_an_tags")
    .select("an_tag_id, an_tag_name")
    .in("worker_id", workerIds);

  if (error || !tagRows?.length) return [];

  const tagMap = new Map<
    string,
    { an_tag_id: string; an_tag_name: string; worker_count: number }
  >();
  for (const row of tagRows) {
    const existing = tagMap.get(row.an_tag_id);
    if (existing) {
      existing.worker_count++;
    } else {
      tagMap.set(row.an_tag_id, {
        an_tag_id: row.an_tag_id,
        an_tag_name: row.an_tag_name,
        worker_count: 1,
      });
    }
  }

  return Array.from(tagMap.values()).sort(
    (a, b) => b.worker_count - a.worker_count
  );
}

/**
 * Build a filtered list of workers combining DB criteria and AN tags.
 * This is the core cross-platform query builder.
 */
export async function buildCrossplatformWorkerList(
  supabase: SupabaseClient,
  campaignId: number,
  filters: {
    occupation?: string;
    employer_id?: number;
    worksite_id?: number;
    membership_statuses?: string[];
    oa_roles?: string[];
    include_an_tags?: string[];
    exclude_an_tags?: string[];
  }
): Promise<any[]> {
  const query = supabase
    .from("campaign_worker_membership")
    .select(
      `
      worker_id,
      oa_leader_role,
      workers!inner (
        worker_id,
        first_name,
        last_name,
        email,
        phone,
        occupation,
        action_network_id,
        employer_id,
        worksite_id,
        member_role_type_id,
        employers ( employer_name ),
        worksites ( worksite_name )
      )
    `
    )
    .eq("campaign_id", campaignId);

  const { data: rawWorkers, error } = await query;
  if (error) throw new Error(`Query failed: ${error.message}`);
  if (!rawWorkers?.length) return [];

  let workers = rawWorkers.map((row: any) => ({
    worker_id: row.worker_id,
    first_name: row.workers.first_name,
    last_name: row.workers.last_name,
    email: row.workers.email,
    phone: row.workers.phone,
    occupation: row.workers.occupation,
    action_network_id: row.workers.action_network_id,
    employer_name: row.workers.employers?.employer_name,
    worksite_name: row.workers.worksites?.worksite_name,
    employer_id: row.workers.employer_id,
    worksite_id: row.workers.worksite_id,
    oa_leader_role: row.oa_leader_role,
    is_member: row.workers.member_role_type_id != null,
  }));

  if (filters.occupation) {
    const occ = filters.occupation.toLowerCase();
    workers = workers.filter((w: any) =>
      w.occupation?.toLowerCase().includes(occ)
    );
  }
  if (filters.employer_id) {
    workers = workers.filter(
      (w: any) => w.employer_id === filters.employer_id
    );
  }
  if (filters.worksite_id) {
    workers = workers.filter(
      (w: any) => w.worksite_id === filters.worksite_id
    );
  }
  if (filters.oa_roles?.length) {
    workers = workers.filter((w: any) =>
      filters.oa_roles!.includes(w.oa_leader_role || "none")
    );
  }

  if (filters.include_an_tags?.length || filters.exclude_an_tags?.length) {
    const workerIds = workers.map((w: any) => w.worker_id);

    const { data: tagRows } = await supabase
      .from("worker_an_tags")
      .select("worker_id, an_tag_id")
      .in("worker_id", workerIds);

    const workerTagMap = new Map<number, Set<string>>();
    for (const row of tagRows || []) {
      if (!workerTagMap.has(row.worker_id)) {
        workerTagMap.set(row.worker_id, new Set());
      }
      workerTagMap.get(row.worker_id)!.add(row.an_tag_id);
    }

    if (filters.include_an_tags?.length) {
      workers = workers.filter((w: any) => {
        const tags = workerTagMap.get(w.worker_id);
        return tags && filters.include_an_tags!.some((t) => tags.has(t));
      });
    }

    if (filters.exclude_an_tags?.length) {
      workers = workers.filter((w: any) => {
        const tags = workerTagMap.get(w.worker_id);
        return (
          !tags || !filters.exclude_an_tags!.some((t) => tags.has(t))
        );
      });
    }
  }

  return workers;
}
