import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkRole } from "@/types/database";

const VALID_WORK_ROLES: WorkRole[] = [
  "coordinator",
  "lead_organiser",
  "organiser",
  "industrial_officer",
  "industrial_coordinator",
  "specialist",
];

export async function PATCH(request: NextRequest) {
  try {
    const serverClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await serverClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: callerProfile, error: profileError } = await serverClient
      .from("user_profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profileError || callerProfile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, workRole, reportsTo } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (workRole !== undefined && workRole !== null && !VALID_WORK_ROLES.includes(workRole)) {
      return NextResponse.json({ error: "Invalid work_role" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const updates: Record<string, unknown> = {};
    if (workRole !== undefined) updates.work_role = workRole;
    // reportsTo can be null (clears the reporting line) or a valid UUID
    if (reportsTo !== undefined) updates.reports_to = reportsTo;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { error: updateError } = await adminClient
      .from("user_profiles")
      .update(updates)
      .eq("user_id", userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("update-user error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
