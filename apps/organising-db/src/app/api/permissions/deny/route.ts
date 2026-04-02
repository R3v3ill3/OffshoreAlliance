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

    const body = await req.json();
    const { request_id, response_reason } = body;

    if (!request_id) {
      return NextResponse.json({ error: "request_id is required" }, { status: 400 });
    }

    // Deny permission using the function
    const { data, error } = await supabase
      .rpc("deny_campaign_edit_permission", {
        p_request_id: request_id,
        p_response_reason: response_reason || null
      });

    if (error) {
      console.error("Error denying permission:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in deny-permission route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
