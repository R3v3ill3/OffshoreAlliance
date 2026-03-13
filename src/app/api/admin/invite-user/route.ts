import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole, WorkRole } from "@/types/database";

interface InviteUserBody {
  email: string;
  displayName: string;
  role: UserRole;
  workRole?: WorkRole | null;
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
    const { email, displayName, role, workRole } = body;

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
    //
    // redirectTo sends the user to /auth/callback after Supabase verifies the
    // token. The callback route exchanges the code for a session, then
    // redirects to /auth/set-password so the user can choose a password.
    // request.nextUrl.origin returns localhost in Vercel serverless functions.
    // Use x-forwarded-host (set by Vercel/proxies) to get the real public domain.
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto =
      request.headers.get("x-forwarded-proto") ?? "https";
    const derivedOrigin = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : request.nextUrl.origin;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? derivedOrigin;
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          data: {
            display_name: displayName,
          },
          redirectTo: `${siteUrl}/auth/callback`,
        },
      });

    if (linkError) {
      return NextResponse.json(
        { error: linkError.message },
        { status: 400 }
      );
    }

    const newUserId = linkData.user.id;

    // Confirm the email immediately so the user is not stuck in
    // "waiting for email confirmation" — the invite link itself is
    // proof the admin controls who gets access.
    await adminClient.auth.admin.updateUserById(newUserId, {
      email_confirm: true,
    });

    // The trigger creates user_profiles with role='viewer'. Update to the
    // intended role, display_name, and optional work_role.
    const profileUpdates: Record<string, unknown> = {
      role,
      display_name: displayName,
    };
    if (workRole) profileUpdates.work_role = workRole;

    const { error: updateError } = await adminClient
      .from("user_profiles")
      .update(profileUpdates)
      .eq("user_id", newUserId);

    if (updateError) {
      return NextResponse.json(
        { error: `User created but profile update failed: ${updateError.message}` },
        { status: 500 }
      );
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
