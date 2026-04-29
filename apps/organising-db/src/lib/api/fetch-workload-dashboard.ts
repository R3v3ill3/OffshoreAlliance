import { fetchApi } from "@/lib/api/fetch-api";

export interface WorkloadDashboardData {
  /** RPC row shape; kept loose until shared workload row type exists. */
  campaigns: any[];
  metrics: {
    campaignsByStage: { name: string; value: number }[];
    totalCampaigns: number;
    averageProgress: number;
    totalActivitiesUnderway: number;
    overdueCount: number;
    dueSoonCount: number;
  };
}

export interface WorkloadFetchFilters {
  filterOrganiser?: string;
  filterStatus?: string;
  filterTimePeriod?: string;
}

/**
 * Fetches workload dashboard JSON from /api/workload with correlation IDs for server logs.
 */
export async function fetchWorkloadDashboard(
  filters: WorkloadFetchFilters
): Promise<WorkloadDashboardData> {
  const clientRequestId = crypto.randomUUID();
  const params = new URLSearchParams();
  if (filters.filterOrganiser && filters.filterOrganiser !== "all") {
    params.set("filterOrganiser", filters.filterOrganiser);
  }
  if (filters.filterStatus && filters.filterStatus !== "all") {
    params.set("filterStatus", filters.filterStatus);
  }
  if (filters.filterTimePeriod && filters.filterTimePeriod !== "all") {
    params.set("filterTimePeriod", filters.filterTimePeriod);
  }

  const response = await fetchApi(`/api/workload?${params.toString()}`, {
    headers: { "X-Client-Request-Id": clientRequestId },
  });

  const serverRequestId = response.headers.get("x-request-id");

  if (!response.ok) {
    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    console.error("[fetchWorkloadDashboard] API error", {
      clientRequestId,
      serverRequestId,
      status: response.status,
      payload,
    });

    const detailMessage =
      typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.error === "string"
          ? payload.error
          : "Unknown API error";
    const code = typeof payload?.code === "string" ? payload.code : null;
    const err = new Error(
      `Failed to fetch workload data (status ${response.status}) - ${detailMessage}${code ? ` [${code}]` : ""}`
    ) as Error & { status?: number; code?: string };
    err.status = response.status;
    if (code) err.code = code;
    throw err;
  }

  return response.json() as Promise<WorkloadDashboardData>;
}
