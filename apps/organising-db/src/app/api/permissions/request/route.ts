import { createServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { campaign_id, reason } = body;

    if (!campaign_id) {
      return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    }

    // Request permission using the function
    const { data, error } = await supabase
      .rpc("request_campaign_edit_permission", {
        p_campaign_id: campaign_id,
        p_reason: reason || null
      });

    if (error) {
      console.error("Error requesting permission:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in request-permission route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
