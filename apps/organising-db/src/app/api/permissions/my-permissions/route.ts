import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's permissions using the function
    const { data: permissions, error } = await supabase
      .rpc("get_my_campaign_permissions");

    if (error) {
      console.error("Error fetching permissions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ permissions });
  } catch (error) {
    console.error("Error in my-permissions route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
