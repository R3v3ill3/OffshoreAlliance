import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { foldName } from "@/lib/import/name-fold";
import { resolveAndQueue } from "@/lib/import/resolve-names";
import { isMembershipImportType } from "@/lib/import/membership-import-types";
import type {
  ResolveNameInput,
  ResolveNamesRequest,
  ResolveNamesResponse,
} from "@/lib/import/resolve-names-types";

/**
 * POST /api/import/resolve-names — the single resolution path for employer
 * and worksite strings (DA0.3 plan §2.4.3). Exact alias lookup first, then
 * @oa/employer-matching at its 0.92 / 0.65 thresholds, then the review
 * queue. Never creates an employer or worksite.
 *
 * `persist: false` (the wizards' matching steps): nothing is written,
 * `importId` is null; the outcomes are shown.
 * `persist: true` (once, at the start of apply): creates the file's
 * import_logs row, writes the auto aliases and the queue rows linked to it,
 * and returns `importId` for the apply batches to accumulate into.
 */
export const maxDuration = 300;

const MAX_NAMES = 5000;
/** name_match_reviews_raw_name_check and alias_name varchar(200). */
const MAX_NAME_LENGTH = 200;

/**
 * Strings whose trimmed length exceeds the column limit — what
 * `name_match_reviews_raw_name_check` (`char_length(btrim(raw_name))`) and
 * `alias_name varchar(200)` measure; the call fails closed before any write.
 */
function overlongNames(inputs: ResolveNameInput[]): string[] {
  return inputs.filter((i) => i.raw.trim().length > MAX_NAME_LENGTH).map((i) => i.raw);
}

function isImportType(value: unknown): value is ResolveNamesRequest["importType"] {
  if (typeof value !== "string") return false;
  if (value === "workers_wizard") return true;
  return value.startsWith("membership_") && isMembershipImportType(value.slice("membership_".length));
}

function cleanInputs(value: unknown, label: string): ResolveNameInput[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (value.length > MAX_NAMES) throw new Error(`${label}: at most ${MAX_NAMES} distinct names per call`);
  const out: ResolveNameInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = (item as { raw?: unknown }).raw;
    if (typeof raw !== "string" || raw.trim().length === 0) continue;
    const occurrences = Number((item as { occurrences?: unknown }).occurrences);
    const otherRaw = (item as { otherRaw?: unknown }).otherRaw;
    out.push({
      raw,
      occurrences: Number.isFinite(occurrences) && occurrences > 0 ? Math.floor(occurrences) : 1,
      otherRaw: typeof otherRaw === "string" && otherRaw.trim() ? otherRaw.trim() : null,
    });
  }
  return out;
}

function fold(inputs: ResolveNameInput[]) {
  const occurrences = new Map<string, number>();
  const otherRawByName = new Map<string, string | null>();
  for (const input of inputs) {
    const key = foldName(input.raw);
    if (!key) continue;
    occurrences.set(key, (occurrences.get(key) ?? 0) + input.occurrences);
    if (!otherRawByName.get(key) && input.otherRaw) otherRawByName.set(key, input.otherRaw);
  }
  return { rawNames: inputs.map((i) => i.raw), occurrences, otherRawByName };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  // The roles that may insert workers, aliases and import logs (baseline
  // policies); viewers may not run an import.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "admin" && profile?.role !== "user") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: ResolveNamesRequest;
  try {
    body = (await request.json()) as ResolveNamesRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isImportType(body?.importType)) {
    return NextResponse.json(
      { success: false, error: "importType must be workers_wizard or membership_<type>" },
      { status: 400 }
    );
  }
  const persist = body.persist === true;
  const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim().slice(0, 200) : null;
  if (persist && !fileName) {
    return NextResponse.json({ success: false, error: "fileName is required to persist" }, { status: 400 });
  }
  let employerInputs: ResolveNameInput[];
  let worksiteInputs: ResolveNameInput[];
  try {
    employerInputs = cleanInputs(body.employerNames, "employerNames");
    worksiteInputs = cleanInputs(body.worksiteNames, "worksiteNames");
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  // Fail closed on strings the queue and alias columns cannot hold (A5):
  // nothing has been written yet, and the wizard names the offending rows.
  const overlong = { employer: overlongNames(employerInputs), worksite: overlongNames(worksiteInputs) };
  if (overlong.employer.length > 0 || overlong.worksite.length > 0) {
    const parts = (["employer", "worksite"] as const)
      .filter((e) => overlong[e].length > 0)
      .map((e) => `${overlong[e].length} ${e} name${overlong[e].length === 1 ? "" : "s"} over ${MAX_NAME_LENGTH} characters (e.g. "${overlong[e][0].slice(0, 60)}…")`);
    return NextResponse.json(
      { success: false, error: `Cannot resolve: ${parts.join("; ")}. Shorten them in the file and try again.` },
      { status: 400 }
    );
  }

  const weeklyBatchId =
    body.sourceContext?.weeklyBatchId != null && Number.isFinite(Number(body.sourceContext.weeklyBatchId))
      ? Number(body.sourceContext.weeklyBatchId)
      : null;
  const sourceKinds = Array.isArray(body.sourceContext?.sourceKinds)
    ? [...new Set(body.sourceContext!.sourceKinds.filter((k): k is string => typeof k === "string"))].sort()
    : [];

  let importId: number | null = null;
  if (persist) {
    const { data: log, error: logError } = await supabase
      .from("import_logs")
      .insert({
        file_name: fileName,
        import_type: body.importType,
        records_created: 0,
        records_updated: 0,
        imported_by: user.id,
      })
      .select("import_id")
      .single();
    if (logError || !log) {
      return NextResponse.json(
        { success: false, error: `Could not create the import log: ${logError?.message ?? "no row"}` },
        { status: 500 }
      );
    }
    importId = Number(log.import_id);
  }

  const sourceContext: Record<string, unknown> = {
    import_type: body.importType,
    weekly_batch_id: weeklyBatchId,
    source_kinds: sourceKinds,
  };

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }

  try {
    const emp = fold(employerInputs);
    const ws = fold(worksiteInputs);
    const [employers, worksites] = await Promise.all([
      resolveAndQueue(admin, {
        entity: "employer",
        rawNames: emp.rawNames,
        importId,
        userId: user.id,
        persist,
        sourceContext,
        occurrences: emp.occurrences,
        otherRawByName: emp.otherRawByName,
      }),
      resolveAndQueue(admin, {
        entity: "worksite",
        rawNames: ws.rawNames,
        importId,
        userId: user.id,
        persist,
        sourceContext,
        occurrences: ws.occurrences,
        otherRawByName: ws.otherRawByName,
      }),
    ]);
    return NextResponse.json({
      success: true,
      importId,
      employers: employers.outcomes,
      worksites: worksites.outcomes,
      queued: employers.queued + worksites.queued,
      aliasesWritten: employers.aliasesWritten + worksites.aliasesWritten,
    } satisfies ResolveNamesResponse);
  } catch (error) {
    // Leave nothing behind: the queue rows of this import (upserted before
    // the aliases) and the import_logs row the call created. Aliases already
    // written are idempotent facts and stay.
    // Both deletes run as the service role: the user client's DELETE on
    // import_logs is admin-only (baseline policy), and a user-role importer
    // must be able to clean up too. A failed cleanup is reported, not hidden.
    const cleanupErrors: string[] = [];
    if (importId != null) {
      const queue = await admin.from("name_match_reviews").delete().eq("import_id", importId);
      if (queue.error) cleanupErrors.push(`queue rows of import ${importId} not removed: ${queue.error.message}`);
      const log = await admin.from("import_logs").delete().eq("import_id", importId);
      if (log.error) cleanupErrors.push(`import log ${importId} not removed: ${log.error.message}`);
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        importId: null,
        employers: [],
        worksites: [],
        queued: 0,
        aliasesWritten: 0,
        error: cleanupErrors.length > 0 ? `${message} (cleanup: ${cleanupErrors.join("; ")})` : message,
      } satisfies ResolveNamesResponse,
      { status: 500 }
    );
  }
}
