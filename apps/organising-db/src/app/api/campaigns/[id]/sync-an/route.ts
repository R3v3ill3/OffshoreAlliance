import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ActionNetworkClient } from "@/lib/api/action-network";
import { syncCampaignTagsFromAN } from "@/lib/api/an-tag-sync";
import {
  pollMessageStats,
  getCampaignAnTags,
} from "@/lib/api/an-engagement-sync";

function getAnClient(): ActionNetworkClient {
  const apiKey = process.env.ACTION_NETWORK_API_KEY;
  if (!apiKey || apiKey === "your-action-network-key-here") {
    throw new Error("Action Network API key not configured");
  }
  return new ActionNetworkClient({ apiKey });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json(
        { error: "Invalid campaign ID" },
        { status: 400 }
      );
    }

    const tags = await getCampaignAnTags(supabase, campaignId);
    return NextResponse.json({ success: true, data: tags });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json(
        { error: "Invalid campaign ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, draft_id } = body;

    switch (action) {
      case "sync_tags": {
        const anClient = getAnClient();
        const result = await syncCampaignTagsFromAN(
          supabase,
          anClient,
          campaignId,
          user.id
        );
        return NextResponse.json({ success: true, data: result });
      }

      case "poll_stats": {
        if (!draft_id || typeof draft_id !== "number") {
          return NextResponse.json(
            { error: "Missing or invalid draft_id" },
            { status: 400 }
          );
        }
        const anClient = getAnClient();
        const stats = await pollMessageStats(supabase, anClient, draft_id);
        return NextResponse.json({ success: true, data: stats });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
