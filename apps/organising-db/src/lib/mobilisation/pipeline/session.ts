import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function requireUser(): Promise<{ userId: string; role: string } | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("user_id", user.id).maybeSingle();
  return { userId: user.id, role: (profile?.role as string) ?? "viewer" };
}

export function isResponse(value: { userId: string; role: string } | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
