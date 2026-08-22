import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api/fetch-api";
import type {
  CampaignDataField,
  CampaignDataFieldset,
  WorkerCampaignFact,
} from "@/lib/campaign-facts/types";

export function useCampaignDataFields(campaignId: string | number | null) {
  return useQuery({
    queryKey: ["campaign-data-fields", campaignId],
    enabled: campaignId != null && Number(campaignId) > 0,
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/data-fields`);
      if (!res.ok) throw new Error("Failed to load data fields");
      return (await res.json()) as {
        fields: CampaignDataField[];
        fieldsets: CampaignDataFieldset[];
      };
    },
  });
}

export function useCampaignFacts(
  campaignId: string | number | null,
  opts?: { workerId?: number | null }
) {
  return useQuery({
    queryKey: ["campaign-facts", campaignId, opts?.workerId ?? "all"],
    enabled: campaignId != null && Number(campaignId) > 0,
    queryFn: async () => {
      const qs =
        opts?.workerId != null ? `?worker_id=${opts.workerId}` : "";
      const res = await fetchApi(`/api/campaigns/${campaignId}/facts${qs}`);
      if (!res.ok) throw new Error("Failed to load facts");
      const json = (await res.json()) as { facts: WorkerCampaignFact[] };
      return json.facts;
    },
  });
}

export function factsByWorkerField(
  facts: WorkerCampaignFact[] | undefined
): Map<number, Map<number, WorkerCampaignFact>> {
  const map = new Map<number, Map<number, WorkerCampaignFact>>();
  for (const fact of facts ?? []) {
    let inner = map.get(fact.worker_id);
    if (!inner) {
      inner = new Map();
      map.set(fact.worker_id, inner);
    }
    inner.set(fact.field_id, fact);
  }
  return map;
}
