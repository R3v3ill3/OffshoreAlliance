// WP1.1 — org-wide workspace defaults per work role.
//
// Admin-only read/write of the single `app_settings` key
// `workspace_defaults`. Deliberately separate from `/api/admin/settings`:
// that route's PATCH stores free text with no validation, so a structured
// JSON document must not go through it. Every write here is validated with
// the strict zod schema against the module registry before it is stored.
//
// Non-admins never call this route; they read the document through the
// `get_workspace_defaults()` SECURITY DEFINER function instead.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { workspaceDefaultsSchema } from "@/lib/workspace/prefs-schema";

const SETTINGS_KEY = "workspace_defaults";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Unauthorized", status: 401, supabase: null, user: null };

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profileError || profile?.role !== "admin")
    return { error: "Forbidden", status: 403, supabase: null, user: null };

  return { error: null, status: 200, supabase, user };
}

export async function GET() {
  const { error, status, supabase } = await requireAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  const { data, error: dbError } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // The stored document is returned as-is (WP1.1 fix round 2): sanitising it
  // here made "nothing stored" and "stored but unparseable" indistinguishable
  // to the editor, which would then silently overwrite a malformed document on
  // the next save. Unparseable text is handed back as the raw string, which
  // `parseWorkspaceDefaults` rejects at the top level just as the caller needs.
  // `{}` therefore means, and only means, "no row stored".
  let raw: unknown = {};
  if (typeof data?.value === "string" && data.value.trim() !== "") {
    try {
      raw = JSON.parse(data.value);
    } catch {
      raw = data.value;
    }
  }

  return NextResponse.json(raw);
}

export async function PUT(request: NextRequest) {
  const { error, status, supabase, user } = await requireAdmin();
  if (error || !supabase || !user) return NextResponse.json({ error }, { status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = workspaceDefaultsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid workspace defaults", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { error: upsertError } = await supabase.from("app_settings").upsert({
    key: SETTINGS_KEY,
    value: JSON.stringify(parsed.data),
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  });

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json(parsed.data);
}
