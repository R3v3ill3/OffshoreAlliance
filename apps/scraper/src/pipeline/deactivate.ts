import type { SupabaseClient } from "@supabase/supabase-js";

export async function deactivateMissing(
  supa: SupabaseClient,
  source: string,
  seenExternalIds: string[]
): Promise<number> {
  if (seenExternalIds.length === 0) return 0;

  const { data, error } = await supa
    .from("upcoming_projects")
    .update({ is_active: false })
    .eq("source", source)
    .eq("is_active", true)
    .not("external_id", "in", `(${seenExternalIds.map((s) => `"${s}"`).join(",")})`)
    .select("id");

  if (error) throw error;
  return (data ?? []).length;
}
