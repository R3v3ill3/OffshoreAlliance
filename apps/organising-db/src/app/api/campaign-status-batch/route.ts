import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/campaign-status-batch
 *
 * Returns campaign planning status for ALL agreements in a single query,
 * replacing the N+1 per-agreement pattern that caused 504 timeouts.
 *
 * Response: Record<agreementId, CampaignStatusResult>
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: timelines, error: tlErr } = await supabase
      .from("campaign_timelines")
      .select("agreement_id, campaign_id");

    if (tlErr) {
      console.error("campaign-status-batch: timeline error", tlErr);
      return NextResponse.json(
        { error: "Failed to fetch timelines" },
        { status: 500 }
      );
    }

    if (!timelines || timelines.length === 0) {
      return NextResponse.json({});
    }

    const campaignIds = [
      ...new Set(timelines.map((t) => t.campaign_id)),
    ];

    const { data: campaigns, error: campErr } = await supabase
      .from("campaigns")
      .select("campaign_id, status, name")
      .in("campaign_id", campaignIds);

    if (campErr) {
      console.error("campaign-status-batch: campaigns error", campErr);
      return NextResponse.json(
        { error: "Failed to fetch campaigns" },
        { status: 500 }
      );
    }

    const { data: activeStages, error: stageErr } = await supabase
      .from("campaign_stage_plans")
      .select("campaign_id, stage_number, stage_name")
      .in("campaign_id", campaignIds)
      .eq("status", "active");

    if (stageErr) {
      console.error("campaign-status-batch: stages error", stageErr);
      return NextResponse.json(
        { error: "Failed to fetch stages" },
        { status: 500 }
      );
    }

    const campaignMap = new Map(
      (campaigns ?? []).map((c) => [c.campaign_id, c])
    );
    const stageMap = new Map(
      (activeStages ?? []).map((s) => [s.campaign_id, s])
    );

    const result: Record<
      number,
      {
        exists: boolean;
        campaignId: number | null;
        status: string;
        stageNumber: number | null;
        stageName: string | null;
      }
    > = {};

    for (const tl of timelines) {
      const campaign = campaignMap.get(tl.campaign_id);
      if (!campaign) {
        result[tl.agreement_id] = {
          exists: false,
          campaignId: null,
          status: "no_campaign",
          stageNumber: null,
          stageName: null,
        };
        continue;
      }

      if (campaign.status === "completed") {
        result[tl.agreement_id] = {
          exists: true,
          campaignId: campaign.campaign_id,
          status: "completed",
          stageNumber: null,
          stageName: null,
        };
        continue;
      }

      if (campaign.status === "suspended") {
        result[tl.agreement_id] = {
          exists: true,
          campaignId: campaign.campaign_id,
          status: "blocked",
          stageNumber: null,
          stageName: null,
        };
        continue;
      }

      const activeStage = stageMap.get(campaign.campaign_id);
      if (activeStage) {
        result[tl.agreement_id] = {
          exists: true,
          campaignId: campaign.campaign_id,
          status: "active",
          stageNumber: activeStage.stage_number,
          stageName: activeStage.stage_name,
        };
      } else {
        result[tl.agreement_id] = {
          exists: true,
          campaignId: campaign.campaign_id,
          status: "blocked",
          stageNumber: null,
          stageName: null,
        };
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("campaign-status-batch: unexpected error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
