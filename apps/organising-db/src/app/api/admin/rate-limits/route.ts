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

    // Get all rate limit configs with user emails
    const { data: configs, error } = await supabase
      .from("rate_limit_config")
      .select("*");

    if (error) {
      console.error("Error fetching rate limit configs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ configs });
  } catch (error) {
    console.error("Error in rate-limits route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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

    const body = await req.json();
    const { user_id, requests_per_minute, requests_per_hour, requests_per_day, is_exempt, cost_per_request, notes } = body;

    if (!user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("rate_limit_config")
      .upsert({
        user_id,
        requests_per_minute: requests_per_minute ?? null,
        requests_per_hour: requests_per_hour ?? null,
        requests_per_day: requests_per_day ?? null,
        is_exempt: is_exempt ?? false,
        cost_per_request: cost_per_request ?? 0,
        notes: notes ?? null,
        configured_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error upserting rate limit config:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data });
  } catch (error) {
    console.error("Error in rate-limits POST route:", error);
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

    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("rate_limit_config")
      .delete()
      .eq("user_id", user_id);

    if (error) {
      console.error("Error deleting rate limit config:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in rate-limits DELETE route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
