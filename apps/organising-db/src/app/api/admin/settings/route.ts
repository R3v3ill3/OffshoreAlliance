import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_KEYS = [
  "action_network_api_key",
  "mobile_message_api_username",
  "mobile_message_api_password",
  "mobile_message_webhook_secret",
  "sms_provider",
  // Shared-secret fallback for /api/sms/webhook (?token=) — seeded by
  // the Phase 1 migration; listed here so admins can rotate it.
  "sms_webhook_token",
] as const;

type SettingKey = (typeof ALLOWED_KEYS)[number];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Unauthorized", status: 401, supabase: null };

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profileError || profile?.role !== "admin")
    return { error: "Forbidden", status: 403, supabase: null };

  return { error: null, status: 200, supabase };
}

export async function GET() {
  const { error, status, supabase } = await requireAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  const { data, error: dbError } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ALLOWED_KEYS);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const settings = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? ""]));
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const { error, status, supabase } = await requireAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  const body: Record<string, string> = await request.json();

  const entries = Object.entries(body).filter(([k]) =>
    (ALLOWED_KEYS as readonly string[]).includes(k)
  ) as [SettingKey, string][];

  if (entries.length === 0) {
    return NextResponse.json({ error: "No valid settings keys provided" }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  for (const [key, value] of entries) {
    const { error: upsertError } = await supabase
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: user!.id });

    if (upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
