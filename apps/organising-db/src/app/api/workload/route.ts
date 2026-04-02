import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const filterOrganiser = searchParams.get("filterOrganiser"); // "me" or "team"
    const filterStatus = searchParams.get("filterStatus"); // "active", "planning", "paused", "completed"
    const filterTimePeriod = searchParams.get("filterTimePeriod"); // "30", "90", "all"

    // Build the filter parameters for the RPC function
    let organiserId: string | null = null;
    if (filterOrganiser === "me") {
      organiserId = user.id;
    }
    // If "team", we pass null to get all campaigns

    let statusFilter: string | null = null;
    if (filterStatus && filterStatus !== "all") {
      statusFilter = filterStatus;
    }

    let daysFilter: number | null = null;
    if (filterTimePeriod && filterTimePeriod !== "all") {
      daysFilter = parseInt(filterTimePeriod, 10);
    }

    // Call the RPC function to get filtered data
    const { data: workloadData, error } = await supabase.rpc(
      "get_workload_dashboard_data",
      {
        p_filter_organiser: organiserId,
        p_filter_status: statusFilter,
        p_filter_days: daysFilter,
      }
    );

    if (error) {
      console.error("Error fetching workload data:", error);
      return NextResponse.json(
        { error: "Failed to fetch workload data" },
        { status: 500 }
      );
    }

    const rows = workloadData ?? [];

    // Get aggregated metrics
    const campaignsByStage: Record<string, number> = {};
    let totalProgress = 0;
    let totalCampaigns = 0;
    let totalActivitiesUnderway = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;

    rows.forEach((campaign: any) => {
      // Count campaigns by stage
      const stageName = campaign.current_stage_name || "Not Started";
      campaignsByStage[stageName] = (campaignsByStage[stageName] || 0) + 1;

      // Aggregate progress
      if (campaign.overall_progress_percentage !== null) {
        totalProgress += parseFloat(campaign.overall_progress_percentage);
        totalCampaigns++;
      }

      // Aggregate activities
      totalActivitiesUnderway += campaign.total_activities_underway || 0;

      // Count overdue and due soon
      if (campaign.is_overdue) {
        overdueCount++;
      }
      if (campaign.is_due_soon) {
        dueSoonCount++;
      }
    });

    const averageProgress =
      totalCampaigns > 0 ? Math.round(totalProgress / totalCampaigns) : 0;

    // Transform campaigns by stage into chart format
    const campaignsByStageChart = Object.entries(campaignsByStage).map(
      ([name, value]) => ({ name, value })
    );

    return NextResponse.json({
      campaigns: rows,
      metrics: {
        campaignsByStage: campaignsByStageChart,
        totalCampaigns: rows.length,
        averageProgress,
        totalActivitiesUnderway,
        overdueCount,
        dueSoonCount,
      },
    });
  } catch (error) {
    console.error("Error in workload API route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
