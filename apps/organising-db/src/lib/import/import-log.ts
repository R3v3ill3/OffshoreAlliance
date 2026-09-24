/**
 * DA0.3: one `import_logs` row per file. The resolve-names route creates the
 * row (persist call) and every apply batch accumulates its counts into it,
 * replacing the one-row-per-batch inserts (plan §2.4.4, input 9). The raw
 * employer / worksite strings travel with each row and are written on the
 * worker as provenance, outside the campaign-protected strip.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ImportLogTotals {
  records_created: number;
  records_updated: number;
  errors: string | null;
}

export interface ImportLogDelta {
  created: number;
  updated: number;
  /** The batch's error / note text, or null. */
  errorsText: string | null;
}

/** Pure: existing totals + this batch (errors concatenated with a newline). */
export function mergeImportLogTotals(existing: ImportLogTotals, delta: ImportLogDelta): ImportLogTotals {
  const parts = [existing.errors, delta.errorsText].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );
  return {
    records_created: (existing.records_created ?? 0) + delta.created,
    records_updated: (existing.records_updated ?? 0) + delta.updated,
    errors: parts.length > 0 ? parts.join("\n") : null,
  };
}

export interface RawNameColumns {
  employer_name_raw?: string | null;
  worksite_name_raw?: string | null;
  names_import_id?: number | null;
}

/**
 * Pure: the provenance columns for one worker write.
 *
 * - create: both raw columns are written (null when the file had no value)
 *   and `names_import_id` when the import is known.
 * - update: only the raw strings the file carries are written — an absent
 *   column must not clear the provenance a previous import recorded — and
 *   `names_import_id` only when at least one raw string is written.
 *
 * Never returns `employer_id` / `worksite_id`: those are decided by the
 * resolver and, on an update, by the campaign-protected strip.
 */
export function rawNameColumns(
  input: { employerRaw: string | null | undefined; worksiteRaw: string | null | undefined; importId: number | null | undefined },
  mode: "create" | "update"
): RawNameColumns {
  const employer = typeof input.employerRaw === "string" && input.employerRaw.trim() ? input.employerRaw.trim() : null;
  const worksite = typeof input.worksiteRaw === "string" && input.worksiteRaw.trim() ? input.worksiteRaw.trim() : null;
  const importId = typeof input.importId === "number" && Number.isFinite(input.importId) ? input.importId : null;
  if (mode === "create") {
    return {
      employer_name_raw: employer,
      worksite_name_raw: worksite,
      names_import_id: importId,
    };
  }
  const out: RawNameColumns = {};
  if (employer != null) out.employer_name_raw = employer;
  if (worksite != null) out.worksite_name_raw = worksite;
  if (importId != null && (employer != null || worksite != null)) out.names_import_id = importId;
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any>;

/**
 * Read-merge-write of the file's `import_logs` row. Batches arrive one at a
 * time from one wizard, so a read-then-write is race-free in practice;
 * returns an error message (never throws) so an apply never fails on its log.
 */
export async function accumulateImportLog(
  supabase: Supa,
  importId: number,
  delta: ImportLogDelta
): Promise<string | null> {
  const { data: existing, error: readError } = await supabase
    .from("import_logs")
    .select("records_created, records_updated, errors")
    .eq("import_id", importId)
    .maybeSingle();
  if (readError) return `Could not read import log ${importId}: ${readError.message}`;
  if (!existing) return `Import log ${importId} not found`;
  const merged = mergeImportLogTotals(existing as ImportLogTotals, delta);
  const { error } = await supabase.from("import_logs").update(merged).eq("import_id", importId);
  if (error) return `Could not update import log ${importId}: ${error.message}`;
  return null;
}
