import type { SupabaseClient } from "@supabase/supabase-js";

// Deactivate any active rows whose external_id is no longer present
// in the latest scrape. We do this by fetching active rows and diffing
// in-memory rather than sending a long NOT IN query, which would blow
// past PostgREST's URL length limits with hundreds of IDs.
export async function deactivateMissing(
  supa: SupabaseClient,
  source: string,
  seenExternalIds: string[]
): Promise<number> {
  const seen = new Set(seenExternalIds);

  const { data: active, error: fetchErr } = await supa
    .from("upcoming_projects")
    .select("id, external_id")
    .eq("source", source)
    .eq("is_active", true);
  if (fetchErr) throw fetchErr;

  const toDeactivate = (active ?? [])
    .filter((r) => !seen.has((r as { external_id: string }).external_id))
    .map((r) => (r as { id: number }).id);

  if (toDeactivate.length === 0) return 0;

  // Update in chunks to keep the .in() filter URL short.
  const CHUNK = 200;
  let total = 0;
  for (let i = 0; i < toDeactivate.length; i += CHUNK) {
    const ids = toDeactivate.slice(i, i + CHUNK);
    const { data, error } = await supa
      .from("upcoming_projects")
      .update({ is_active: false })
      .in("id", ids)
      .select("id");
    if (error) throw error;
    total += (data ?? []).length;
  }

  return total;
}
