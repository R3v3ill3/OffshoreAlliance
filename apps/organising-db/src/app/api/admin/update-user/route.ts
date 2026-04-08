import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole, WorkRole } from "@/types/database";

const VALID_WORK_ROLES: WorkRole[] = [
  "coordinator",
  "lead_organiser",
  "organiser",
  "industrial_officer",
  "industrial_coordinator",
  "specialist",
];

const VALID_USER_ROLES: UserRole[] = ["admin", "user", "viewer"];

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

    const body = await request.json();
    const {
      userId,
      workRole,
      reportsTo,
      role,
      displayName,
      email,
      phone,
    }: {
      userId?: string;
      workRole?: WorkRole | null;
      reportsTo?: string | null;
      role?: UserRole;
      displayName?: string;
      email?: string;
      phone?: string | null;
    } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (workRole !== undefined && workRole !== null && !VALID_WORK_ROLES.includes(workRole)) {
      return NextResponse.json({ error: `Invalid work_role: "${workRole}"` }, { status: 400 });
    }

    if (role !== undefined && !VALID_USER_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role: "${role}"` }, { status: 400 });
    }

    if (displayName !== undefined) {
      const trimmed = typeof displayName === "string" ? displayName.trim() : "";
      if (!trimmed) {
        return NextResponse.json({ error: "displayName cannot be empty" }, { status: 400 });
      }
    }

    if (email !== undefined) {
      const trimmed = typeof email === "string" ? email.trim() : "";
      if (!trimmed || !trimmed.includes("@")) {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }
    }

    const adminClient = createAdminClient();

    const { data: authData, error: authLookupError } =
      await adminClient.auth.admin.getUserById(userId);
    if (authLookupError || !authData?.user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const authUser = authData.user;

    if (role !== undefined && role !== "admin") {
      if (userId === user.id) {
        return NextResponse.json(
          { error: "You cannot remove your own admin access" },
          { status: 400 }
        );
      }

      const { data: targetRow } = await adminClient
        .from("user_profiles")
        .select("role")
        .eq("user_id", userId)
        .single();

      if (targetRow?.role === "admin") {
        const { count, error: countError } = await adminClient
          .from("user_profiles")
          .select("*", { count: "exact", head: true })
          .eq("role", "admin");

        if (countError) {
          console.error("update-user admin count error:", countError);
          return NextResponse.json({ error: countError.message }, { status: 400 });
        }
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: "Cannot remove the last admin" },
            { status: 400 }
          );
        }
      }
    }

    const updates: Record<string, unknown> = {};
    if (workRole !== undefined) updates.work_role = workRole;
    if (reportsTo !== undefined) updates.reports_to = reportsTo;
    if (role !== undefined) updates.role = role;
    if (displayName !== undefined) updates.display_name = displayName.trim();
    if (phone !== undefined) {
      if (phone === null) {
        updates.phone = null;
      } else if (typeof phone === "string") {
        const p = phone.trim();
        updates.phone = p === "" ? null : p;
      } else {
        return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
      }
    }

    const emailChanges =
      email !== undefined && email.trim() !== (authUser.email ?? "");

    const willUpdateProfile = Object.keys(updates).length > 0;
    const willSyncAuth =
      emailChanges ||
      (displayName !== undefined);

    if (!willUpdateProfile && !willSyncAuth) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    if (willUpdateProfile) {
      const { error: updateError } = await adminClient
        .from("user_profiles")
        .update(updates)
        .eq("user_id", userId);

      if (updateError) {
        console.error("update-user DB error:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
    }

    if (willSyncAuth) {
      const authPatch: {
        email?: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      } = {};
      if (emailChanges) {
        authPatch.email = email.trim();
        authPatch.email_confirm = true;
      }
      if (displayName !== undefined) {
        authPatch.user_metadata = {
          ...(authUser.user_metadata as Record<string, unknown>),
          display_name: displayName.trim(),
        };
      }
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
        userId,
        authPatch
      );
      if (authUpdateError) {
        console.error("update-user auth error:", authUpdateError);
        return NextResponse.json({ error: authUpdateError.message }, { status: 400 });
      }
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
