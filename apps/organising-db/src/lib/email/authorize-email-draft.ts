import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Confirm the caller can see this campaign email draft. Writes also require
 * campaign write permission — the same gate as the Outlook and platform
 * send routes.
 */
export async function authorizeEmailDraft(
  campaignId: number,
  draftId: number,
  mode: "read" | "write",
) {
  if (!Number.isFinite(campaignId) || !Number.isFinite(draftId) || campaignId <= 0 || draftId <= 0) {
    return {
      error: NextResponse.json(
        { success: false, error: "Bad route params" },
        { status: 400 },
      ),
    } as const;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }

  const { data: draft, error } = await supabase
    .from("campaign_comms_drafts")
    .select("draft_id, campaign_id, platform")
    .eq("draft_id", draftId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) {
    return {
      error: NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      ),
    } as const;
  }
  if (!draft || draft.platform !== "email") {
    return {
      error: NextResponse.json(
        { success: false, error: "Draft not found or not accessible" },
        { status: 404 },
      ),
    } as const;
  }

  if (mode === "write") {
    const { data: canWrite, error: permissionError } = await supabase.rpc(
      "can_write_to_campaign",
      { p_campaign_id: campaignId },
    );
    if (permissionError) {
      return {
        error: NextResponse.json(
          { success: false, error: "Could not verify campaign permissions" },
          { status: 500 },
        ),
      } as const;
    }
    if (!canWrite) {
      return {
        error: NextResponse.json(
          { success: false, error: "You do not have permission to edit this campaign" },
          { status: 403 },
        ),
      } as const;
    }
  }

  return { user, admin: createAdminClient() } as const;
}
