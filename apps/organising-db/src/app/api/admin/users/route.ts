import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
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

    const adminClient = createAdminClient();

    const { data: profiles, error: profilesError } = await adminClient
      .from("user_profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profilesError) {
      console.error("admin users profiles error:", profilesError);
      return NextResponse.json({ error: profilesError.message }, { status: 400 });
    }

    const emailByUserId = new Map<string, string>();
    let page = 1;
    const perPage = 1000;
    for (;;) {
      const { data: listData, error: listError } =
        await adminClient.auth.admin.listUsers({ page, perPage });
      if (listError) {
        console.error("admin listUsers error:", listError);
        return NextResponse.json({ error: listError.message }, { status: 400 });
      }
      const batch = listData.users;
      for (const u of batch) {
        emailByUserId.set(u.id, u.email ?? "");
      }
      if (batch.length < perPage) break;
      page += 1;
    }

    const users = (profiles ?? []).map((row) => ({
      ...row,
      email: emailByUserId.get(row.user_id) ?? "",
    }));

    return NextResponse.json({ users });
  } catch (err) {
    console.error("admin users GET error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
