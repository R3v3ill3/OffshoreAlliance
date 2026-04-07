import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

function isAuthLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as Record<string, unknown>;
  const code = typeof rec.code === "string" ? rec.code.toUpperCase() : "";
  const msg = typeof rec.message === "string" ? rec.message.toLowerCase() : "";

  return (
    code === "PGRST301" ||
    code === "401" ||
    code === "403" ||
    msg.includes("jwt") ||
    msg.includes("not authenticated") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden")
  );
}

function withRequestId(
  requestId: string,
  body: unknown,
  status: number
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "x-request-id": requestId },
  });
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const clientRequestId = request.headers.get("x-client-request-id");

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error("[api/workload] Unauthorized", {
        requestId,
        clientRequestId,
      });
      return withRequestId(
        requestId,
        { error: "Unauthorized" },
        401
      );
    }

    const userIdShort = user.id.slice(0, 8);

    const searchParams = request.nextUrl.searchParams;
    const filterOrganiser = searchParams.get("filterOrganiser");
    const filterStatus = searchParams.get("filterStatus");
    const filterTimePeriod = searchParams.get("filterTimePeriod");

    let organiserId: string | null = null;
    if (filterOrganiser === "me") {
      organiserId = user.id;
    }

    let statusFilter: string | null = null;
    if (filterStatus && filterStatus !== "all") {
      statusFilter = filterStatus;
    }

    let daysFilter: number | null = null;
    if (filterTimePeriod && filterTimePeriod !== "all") {
      daysFilter = parseInt(filterTimePeriod, 10);
    }

    const rpcArgs = {
      p_filter_organiser: organiserId,
      p_filter_status: statusFilter,
      p_filter_days: daysFilter,
    };

    const { data: workloadData, error } = await supabase.rpc(
      "get_workload_dashboard_data",
      rpcArgs
    );

    if (error) {
      console.error("[api/workload] RPC get_workload_dashboard_data failed", {
        requestId,
        clientRequestId,
        userIdShort,
        filters: {
          filterOrganiser,
          filterStatus,
          filterTimePeriod,
        },
        rpcArgs,
        supabaseError: {
          code: error.code ?? null,
          message: error.message ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
        },
      });
      const status = isAuthLikeError(error) ? 401 : 500;
      return withRequestId(
        requestId,
        {
          error: "Failed to fetch workload data",
          status,
          code: error.code ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
          message: error.message ?? null,
        },
        status
      );
    }

    const rows = workloadData ?? [];

    const campaignsByStage: Record<string, number> = {};
    let totalProgress = 0;
    let totalCampaigns = 0;
    let totalActivitiesUnderway = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;

    rows.forEach((campaign: Record<string, unknown>) => {
      const stageName =
        (campaign.current_stage_name as string) || "Not Started";
      campaignsByStage[stageName] = (campaignsByStage[stageName] || 0) + 1;

      if (campaign.overall_progress_percentage !== null) {
        totalProgress += parseFloat(
          String(campaign.overall_progress_percentage)
        );
        totalCampaigns++;
      }

      totalActivitiesUnderway +=
        (campaign.total_activities_underway as number) || 0;

      if (campaign.is_overdue) {
        overdueCount++;
      }
      if (campaign.is_due_soon) {
        dueSoonCount++;
      }
    });

    const averageProgress =
      totalCampaigns > 0 ? Math.round(totalProgress / totalCampaigns) : 0;

    const campaignsByStageChart = Object.entries(campaignsByStage).map(
      ([name, value]) => ({ name, value })
    );

    return withRequestId(
      requestId,
      {
        campaigns: rows,
        metrics: {
          campaignsByStage: campaignsByStageChart,
          totalCampaigns: rows.length,
          averageProgress,
          totalActivitiesUnderway,
          overdueCount,
          dueSoonCount,
        },
      },
      200
    );
  } catch (error) {
    console.error("[api/workload] Unhandled route error", {
      requestId,
      clientRequestId,
      message: error instanceof Error ? error.message : String(error),
    });
    const message = error instanceof Error ? error.message : String(error);
    return withRequestId(
      requestId,
      { error: "Internal server error", message },
      500
    );
  }
}
