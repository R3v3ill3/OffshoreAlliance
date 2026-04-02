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
    const { permission_id } = body;

    if (!permission_id) {
      return NextResponse.json({ error: "permission_id is required" }, { status: 400 });
    }

    // Revoke permission using the function
    const { data, error } = await supabase
      .rpc("revoke_campaign_edit_permission", {
        p_permission_id: permission_id
      });

    if (error) {
      console.error("Error revoking permission:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in revoke-permission route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
