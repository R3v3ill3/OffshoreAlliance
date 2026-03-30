import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireStaffUser(serverClient: SupabaseClient) {
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();
  if (authError || !user) return null;

  const { data: profile } = await serverClient
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profile?.role === "admin" || profile?.role === "user") {
    return { user, role: profile.role as "admin" | "user" };
  }
  return null;
}
