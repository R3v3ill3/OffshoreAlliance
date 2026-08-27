import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import type { FactFilter, WorkerCampaignFact } from "./types";
import { workerPassesFactFilters } from "./values";

export async function filterWorkerIdsByFacts(
  supabase: SupabaseClient,
  campaignId: number,
  workerIds: number[],
  filters: FactFilter[]
): Promise<number[]> {
  if (filters.length === 0 || workerIds.length === 0) return workerIds;
  const fieldIds = [...new Set(filters.map((f) => f.field_id))];
  const facts = await fetchAllRows<WorkerCampaignFact>((from, to) =>
    supabase
      .from("worker_campaign_facts")
      .select("*")
      .eq("campaign_id", campaignId)
      .in("field_id", fieldIds)
      .in("worker_id", workerIds)
      .range(from, to)
  );
  const byWorker = new Map<number, Map<number, WorkerCampaignFact>>();
  for (const fact of facts) {
    let inner = byWorker.get(fact.worker_id);
    if (!inner) {
      inner = new Map();
      byWorker.set(fact.worker_id, inner);
    }
    inner.set(fact.field_id, fact);
  }
  return workerIds.filter((id) =>
    workerPassesFactFilters(byWorker.get(id) ?? new Map(), filters)
  );
}
