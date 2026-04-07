import { SupabaseClient } from "@supabase/supabase-js";
import { ActionNetworkClient } from "./action-network";

interface TagSyncResult {
  synced: number;
  errors: string[];
}

/**
 * Pull all tags from AN for workers in a campaign that have action_network_id set.
 * Upserts into worker_an_tags and logs to an_tag_sync_log.
 */
export async function syncCampaignTagsFromAN(
  supabase: SupabaseClient,
  anClient: ActionNetworkClient,
  campaignId: number,
  userId?: string
): Promise<TagSyncResult> {
  const { data: workers, error: wErr } = await supabase
    .from("campaign_worker_membership")
    .select("worker_id, workers!inner(worker_id, action_network_id)")
    .eq("campaign_id", campaignId);

  if (wErr) throw new Error(`Failed to fetch campaign workers: ${wErr.message}`);

  const workersWithAN = (workers || [])
    .filter((w: any) => w.workers?.action_network_id)
    .map((w: any) => ({
      worker_id: w.worker_id,
      an_id: w.workers.action_network_id as string,
    }));

  let synced = 0;
  const errors: string[] = [];

  for (const worker of workersWithAN) {
    try {
      const response = await anClient.getPersonTags(worker.an_id);
      const taggings = (response._embedded?.["osdi:taggings"] || []) as any[];

      for (const tagging of taggings) {
        const tagLink = tagging._links?.["osdi:tag"]?.href;
        if (!tagLink) continue;

        const anTagId = tagLink.split("/").pop() || "";
        const tagName = tagging.item_type || `tag-${anTagId}`;

        const { error: upsertErr } = await supabase
          .from("worker_an_tags")
          .upsert(
            {
              worker_id: worker.worker_id,
              an_tag_id: anTagId,
              an_tag_name: tagName,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: "worker_id,an_tag_id" }
          );

        if (upsertErr) {
          errors.push(`Worker ${worker.worker_id} tag ${anTagId}: ${upsertErr.message}`);
        } else {
          synced++;
        }
      }
    } catch (err) {
      errors.push(`Worker ${worker.worker_id}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  await supabase.from("an_tag_sync_log").insert({
    campaign_id: campaignId,
    sync_direction: "pull",
    workers_affected: synced,
    synced_by: userId || null,
  });

  return { synced, errors };
}

/**
 * Push a tag to AN for specified campaign workers.
 * Creates the tag in AN if needed, then adds taggings for each worker.
 */
export async function pushTagToCampaignWorkers(
  supabase: SupabaseClient,
  anClient: ActionNetworkClient,
  campaignId: number,
  tagName: string,
  workerIds: number[],
  userId?: string
): Promise<TagSyncResult> {
  const tagResponse = await anClient.createTag(tagName);
  const tagId = (tagResponse as any)?._links?.self?.href?.split("/").pop();

  if (!tagId) throw new Error("Failed to create tag in Action Network");

  const { data: workers, error } = await supabase
    .from("workers")
    .select("worker_id, action_network_id, email, first_name, last_name")
    .in("worker_id", workerIds)
    .not("action_network_id", "is", null);

  if (error) throw new Error(`Failed to fetch workers: ${error.message}`);

  let synced = 0;
  const errors: string[] = [];

  for (const worker of workers || []) {
    try {
      await anClient.addTagging(tagId, {
        email_addresses: worker.email ? [{ address: worker.email }] : undefined,
      });

      await supabase.from("worker_an_tags").upsert(
        {
          worker_id: worker.worker_id,
          an_tag_id: tagId,
          an_tag_name: tagName,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "worker_id,an_tag_id" }
      );

      synced++;
    } catch (err) {
      errors.push(`Worker ${worker.worker_id}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  await supabase.from("an_tag_sync_log").insert({
    campaign_id: campaignId,
    an_tag_id: tagId,
    an_tag_name: tagName,
    sync_direction: "push",
    workers_affected: synced,
    synced_by: userId || null,
  });

  return { synced, errors };
}

/**
 * Get cached AN tags for a worker from our DB.
 */
export async function getEngagementTagsForWorker(
  supabase: SupabaseClient,
  workerId: number
) {
  const { data, error } = await supabase
    .from("worker_an_tags")
    .select("*")
    .eq("worker_id", workerId)
    .order("last_synced_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch tags: ${error.message}`);
  return data || [];
}
