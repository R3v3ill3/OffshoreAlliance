import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  ListActivityChannel,
  WorkerListActivityRow,
} from "@/components/campaigns/wall-chart/types";

export type UseCampaignWorkerListActivityResult = {
  /** Raw rows for the campaign (one per worker × list). */
  rows: WorkerListActivityRow[];
  /** All list rows for a worker, used by the detail sheet "Activity" tab. */
  byWorker: Map<number, WorkerListActivityRow[]>;
  /** Distinct channels a worker belongs to, used for fast tile badge rendering. */
  channelsByWorker: Map<number, Set<ListActivityChannel>>;
  isLoading: boolean;
  isError: boolean;
};

/**
 * Campaign-scoped fetch of `vw_campaign_worker_list_activity`. Loaded once per
 * campaign and shared by the wall chart (batch tile badges) and the worker
 * detail sheet "Activity" tab (filtered per worker).
 */
export function useCampaignWorkerListActivity(
  campaignId: string | number | null | undefined
): UseCampaignWorkerListActivityResult {
  const supabase = createClient();
  const cid = campaignId != null ? Number(campaignId) : NaN;
  const enabled = Number.isFinite(cid);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["campaign-worker-list-activity", cid],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_campaign_worker_list_activity")
        .select(
          "channel, campaign_id, worker_id, list_id, list_name, list_status, item_status, added_at"
        )
        .eq("campaign_id", cid);
      if (error) throw error;
      return (data ?? []) as unknown as WorkerListActivityRow[];
    },
  });

  return useMemo(() => {
    const rows = data ?? [];
    const byWorker = new Map<number, WorkerListActivityRow[]>();
    const channelsByWorker = new Map<number, Set<ListActivityChannel>>();
    for (const row of rows) {
      const list = byWorker.get(row.worker_id);
      if (list) list.push(row);
      else byWorker.set(row.worker_id, [row]);

      const channels = channelsByWorker.get(row.worker_id);
      if (channels) channels.add(row.channel);
      else channelsByWorker.set(row.worker_id, new Set([row.channel]));
    }
    return { rows, byWorker, channelsByWorker, isLoading, isError };
  }, [data, isLoading, isError]);
}
