import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { campaign_id } = body;

    // If campaign_id provided, refresh specific campaign
    // Otherwise, refresh all active campaigns
    const { data, error } = campaign_id
      ? await supabase.rpc("refresh_gate_criteria_for_campaign", { p_campaign_id: campaign_id })
      : await supabase.rpc("refresh_all_pending_gate_criteria");

    if (error) {
      console.error("Error refreshing gate criteria:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in refresh-gate-criteria route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get gate criteria with status from the view
    const { data: criteria, error } = await supabase
      .from("gate_criteria_with_status")
      .select("*")
      .order("gate_number", { ascending: true });

    if (error) {
      console.error("Error fetching gate criteria:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ criteria });
  } catch (error) {
    console.error("Error in gate-criteria route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
