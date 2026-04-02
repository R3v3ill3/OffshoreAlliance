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

    // Check if user is admin or coordinator/lead
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, work_role")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const isAdmin = profile.role === "admin";
    const isCoordinator = ["lead_organiser", "coordinator", "industrial_coordinator"].includes(profile.work_role || "");

    if (!isAdmin && !isCoordinator) {
      return NextResponse.json({ error: "Forbidden - not authorized to approve permissions" }, { status: 403 });
    }

    // Get pending requests using the function
    const { data: requests, error } = await supabase
      .rpc("get_pending_permission_requests");

    if (error) {
      console.error("Error fetching pending requests:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Error in pending-permissions route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
