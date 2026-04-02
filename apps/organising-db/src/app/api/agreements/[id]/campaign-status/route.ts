import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/agreements/:id/campaign-status
 *
 * Returns the campaign planning status for a given agreement.
 *
 * Logic for determining status:
 *
 * 1. "no_campaign" - No campaign linked to this agreement via campaign_timelines
 *
 * 2. "completed" - Campaign status is 'completed'
 *
 * 3. "blocked" - Campaign exists but:
 *    - No active stage plan (status = 'active') exists
 *    - OR campaign status is 'planning' but no stage plans exist
 *    - OR campaign status is 'suspended'
 *
 * 4. "active" - Campaign has an active stage plan:
 *    - Returns stage_number and stage_name from the active stage plan
 *
 * @param id - Agreement ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const agreementId = parseInt(id, 10);

    if (isNaN(agreementId)) {
      return NextResponse.json(
        { error: "Invalid agreement ID" },
        { status: 400 }
      );
    }

    // First, find the campaign linked to this agreement via campaign_timelines
    const { data: timeline, error: timelineError } = await supabase
      .from("campaign_timelines")
      .select("campaign_id, agreement_id")
      .eq("agreement_id", agreementId)
      .maybeSingle();

    if (timelineError) {
      console.error("Error fetching campaign timeline:", timelineError);
      return NextResponse.json(
        { error: "Failed to fetch campaign status" },
        { status: 500 }
      );
    }

    // No campaign linked to this agreement
    if (!timeline) {
      return NextResponse.json({
        exists: false,
        campaignId: null,
        status: "no_campaign",
        stageNumber: null,
        stageName: null,
      });
    }

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("campaign_id, status, name")
      .eq("campaign_id", timeline.campaign_id)
      .single();

    if (campaignError || !campaign) {
      console.error("Error fetching campaign:", campaignError);
      return NextResponse.json(
        { error: "Failed to fetch campaign details" },
        { status: 500 }
      );
    }

    // Campaign completed
    if (campaign.status === "completed") {
      return NextResponse.json({
        exists: true,
        campaignId: campaign.campaign_id,
        status: "completed",
        stageNumber: null,
        stageName: null,
      });
    }

    // Campaign suspended - considered blocked
    if (campaign.status === "suspended") {
      return NextResponse.json({
        exists: true,
        campaignId: campaign.campaign_id,
        status: "blocked",
        stageNumber: null,
        stageName: null,
      });
    }

    // Get active stage plan
    const { data: activeStage, error: stageError } = await supabase
      .from("campaign_stage_plans")
      .select("stage_number, stage_name, status")
      .eq("campaign_id", campaign.campaign_id)
      .eq("status", "active")
      .maybeSingle();

    if (stageError) {
      console.error("Error fetching active stage:", stageError);
      return NextResponse.json(
        { error: "Failed to fetch stage plan" },
        { status: 500 }
      );
    }

    // No active stage plan - check if blocked or just planning
    if (!activeStage) {
      // Check if any stage plans exist at all
      const { data: anyStages, error: anyStagesError } = await supabase
        .from("campaign_stage_plans")
        .select("stage_number")
        .eq("campaign_id", campaign.campaign_id)
        .limit(1);

      if (anyStagesError) {
        console.error("Error checking for any stages:", anyStagesError);
      }

      // If campaign is active but no active stage, it's blocked
      // If campaign is planning but has some stages, it's blocked (stale)
      // If campaign is planning with no stages, it's blocked (not started)
      return NextResponse.json({
        exists: true,
        campaignId: campaign.campaign_id,
        status: "blocked",
        stageNumber: null,
        stageName: null,
      });
    }

    // Active stage found
    return NextResponse.json({
      exists: true,
      campaignId: campaign.campaign_id,
      status: "active",
      stageNumber: activeStage.stage_number,
      stageName: activeStage.stage_name,
    });
  } catch (error) {
    console.error("Unexpected error in campaign-status API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
