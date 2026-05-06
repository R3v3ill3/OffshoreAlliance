import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalisedUpcomingProject } from "../sources/types";
import { logger } from "../logger";

const TRACKED_FIELDS: (keyof NormalisedUpcomingProject)[] = [
  "title",
  "activity_type",
  "lifecycle_classification",
  "project_name",
  "associated_project",
  "organisation",
  "region_code",
  "jurisdiction",
  "location_text",
  "start_date",
  "end_date",
  "status",
  "source_url",
];

export interface UpsertResult {
  id: number;
  was_insert: boolean;
  was_change: boolean;
}

export async function upsertProject(
  supa: SupabaseClient,
  record: NormalisedUpcomingProject
): Promise<UpsertResult> {
  const { data: existing, error: fetchErr } = await supa
    .from("upcoming_projects")
    .select("id, " + TRACKED_FIELDS.join(", "))
    .eq("source", record.source)
    .eq("external_id", record.external_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;

  const now = new Date().toISOString();

  if (!existing) {
    const { data: inserted, error: insertErr } = await supa
      .from("upcoming_projects")
      .insert({
        ...record,
        first_seen_at: now,
        last_seen_at: now,
        last_changed_at: now,
        is_active: true,
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;
    return { id: (inserted as { id: number }).id, was_insert: true, was_change: true };
  }

  const existingRow = existing as unknown as Record<string, unknown> & { id: number };
  const changed = TRACKED_FIELDS.some(
    (k) => (existingRow[k as string] ?? null) !== (record[k] ?? null)
  );

  const update: Record<string, unknown> = {
    ...record,
    last_seen_at: now,
    is_active: true,
  };
  if (changed) update.last_changed_at = now;

  const { error: updateErr } = await supa
    .from("upcoming_projects")
    .update(update)
    .eq("id", existingRow.id);
  if (updateErr) throw updateErr;

  if (changed) {
    logger.debug({ id: existingRow.id, ext: record.external_id }, "tracked fields changed");
  }
  return { id: existingRow.id, was_insert: false, was_change: changed };
}
