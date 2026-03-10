import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

interface InviteUserBody {
  email: string;
  displayName: string;
  role: UserRole;
}

export async function POST(request: NextRequest) {
  try {
    // Verify the caller is an authenticated admin
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

    // Parse and validate the request body
    const body: InviteUserBody = await request.json();
    const { email, displayName, role } = body;

    if (!email || !displayName || !role) {
      return NextResponse.json(
        { error: "email, displayName, and role are required" },
        { status: 400 }
      );
    }

    if (!["admin", "user", "viewer"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Generate an invite link — this creates the user in auth.users and
    // triggers handle_new_user to create their user_profiles row (role=viewer),
    // without sending any email. The link is returned for manual distribution.
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });

    if (linkError) {
      return NextResponse.json(
        { error: linkError.message },
        { status: 400 }
      );
    }

    const newUserId = linkData.user.id;

    // The trigger creates user_profiles with role='viewer'. Update it to
    // the intended role if it's different.
    if (role !== "viewer") {
      const { error: updateError } = await adminClient
        .from("user_profiles")
        .update({ role, display_name: displayName })
        .eq("user_id", newUserId);

      if (updateError) {
        return NextResponse.json(
          { error: `User created but role update failed: ${updateError.message}` },
          { status: 500 }
        );
      }
    } else {
      // Still update display_name in case the trigger used email as fallback
      await adminClient
        .from("user_profiles")
        .update({ display_name: displayName })
        .eq("user_id", newUserId);
    }

    return NextResponse.json({
      inviteLink: linkData.properties.action_link,
      userId: newUserId,
    });
  } catch (err) {
    console.error("invite-user error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
