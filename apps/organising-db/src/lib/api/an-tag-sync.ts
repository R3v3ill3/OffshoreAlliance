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
 *
 * Two-step flow per worker, matching push-list/route.ts:
 *   1. Person Signup Helper for atomic upsert (email-dedup) + best-effort
 *      `add_tags` by name. The helper can silently drop `add_tags` when
 *      its tag-name index is stale, so we don't trust it alone.
 *   2. Explicit POST /tags/{id}/taggings using canonical URLs. Idempotent
 *      on (person, tag) — safe no-op if the helper already tagged them,
 *      and the guaranteed path when it didn't.
 *
 * createTag is called first so the tag id is materialised for our local
 * cache + log even before the workers loop runs.
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
  const tagId = (tagResponse as Record<string, Record<string, { href: string }>>)
    ?._links?.self?.href?.split("/").pop();

  if (!tagId) throw new Error("Failed to create tag in Action Network");

  // Fail-fast: confirm the tag is retrievable. If not, the API key is
  // almost certainly a personal key (Tags resource is group-only on AN).
  try {
    await anClient.getTag(tagId);
  } catch (err) {
    throw new Error(
      `Tag created (id: ${tagId}) but cannot be retrieved from Action Network. ` +
        `This usually means ACTION_NETWORK_API_KEY is a personal API key — Tags ` +
        `are only available with group-level keys. Detail: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
    );
  }

  const { data: workers, error } = await supabase
    .from("workers")
    .select("worker_id, action_network_id, email, phone, first_name, last_name")
    .in("worker_id", workerIds)
    .not("email", "is", null);

  if (error) throw new Error(`Failed to fetch workers: ${error.message}`);

  let synced = 0;
  const errors: string[] = [];

  for (const worker of workers || []) {
    try {
      if (!worker.email) {
        errors.push(`Worker ${worker.worker_id}: no email address on file`);
        continue;
      }

      const signupResult = await anClient.signupPerson(
        {
          given_name: worker.first_name ?? undefined,
          family_name: worker.last_name ?? undefined,
          email_addresses: [{ address: worker.email, primary: true }],
          phone_numbers: worker.phone
            ? [{ number: worker.phone, primary: true }]
            : undefined,
        },
        { add_tags: [tagName] }
      );

      const embeddedTaggings = ((signupResult as Record<string, Record<string, unknown[]>>)
        ?._embedded?.["osdi:taggings"] ?? []) as Array<Record<string, unknown>>;
      const helperAppliedTag = embeddedTaggings.some((t) => {
        const tagLinkHref =
          ((t as Record<string, Record<string, { href: string }>>)?._links?.["osdi:tag"]?.href) ?? "";
        return tagLinkHref.endsWith(`/tags/${tagId}`);
      });

      const personHref =
        (signupResult as Record<string, Record<string, { href: string }>>)?._links?.self?.href ?? "";
      let anId = personHref.split("/").pop() || "";
      if (!anId) {
        try {
          const found = await anClient.findPersonByEmail(worker.email);
          const fallbackHref =
            (found as Record<string, Record<string, { href: string }>> | null)?._links?.self?.href ?? "";
          anId = fallbackHref.split("/").pop() || "";
        } catch {
          // Fall through.
        }
      }

      if (!anId) {
        errors.push(`Worker ${worker.worker_id}: could not resolve AN id after signup`);
        continue;
      }

      if (anId !== worker.action_network_id) {
        await supabase
          .from("workers")
          .update({ action_network_id: anId })
          .eq("worker_id", worker.worker_id);
      }

      // Explicit tagging insurance — idempotent, URL-based, no name lookup.
      let explicitOk = false;
      try {
        await anClient.addTaggingByPersonId(tagId, anId);
        explicitOk = true;
      } catch (tagErr) {
        const msg = tagErr instanceof Error ? tagErr.message : "Unknown error";
        console.error(
          `[an-tag-sync] explicit tagging failed worker=${worker.worker_id}:`,
          msg
        );
        if (!helperAppliedTag) {
          errors.push(
            `Worker ${worker.worker_id} (${worker.email}): person upserted (${anId}) but tagging failed: ${msg}`
          );
        }
      }

      if (!helperAppliedTag && !explicitOk) {
        // Skip the local cache write — we don't believe the tag is on AN.
        continue;
      }

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
