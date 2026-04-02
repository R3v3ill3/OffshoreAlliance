import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
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

    // Get cache statistics
    const { data: stats, error } = await supabase.rpc("get_ai_cache_stats");

    if (error) {
      console.error("Error fetching AI cache stats:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error in ai-cache route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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
    const { action } = body; // 'expired' or 'all'

    let result;
    if (action === "expired") {
      result = await supabase.rpc("clear_expired_ai_cache");
    } else if (action === "all") {
      result = await supabase.rpc("clear_all_ai_cache");
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (result.error) {
      console.error("Error clearing AI cache:", result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ cleared: result.data });
  } catch (error) {
    console.error("Error in ai-cache DELETE route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
