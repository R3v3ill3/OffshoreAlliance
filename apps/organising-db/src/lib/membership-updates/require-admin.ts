import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requireMembershipUpdateAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Unauthorized" as const, status: 401 as const, user: null, admin: null };
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { error: "Forbidden" as const, status: 403 as const, user: null, admin: null };
  }
  return { error: null, status: 200 as const, user, admin: createAdminClient() };
}
