import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupNonOaUnionOptionId } from "@/lib/workers/other-union-display";

export interface WorkerImportAssessmentColumn {
  columnHeader: string;
  activityId: number | null;
  title: string;
  isBinary: boolean;
}

export interface WorkerImportAssessmentEvent {
  columnHeader: string;
  rawValue: string;
  rating: number | null;
  binaryValue: string | null;
}

export interface WorkerImportRow {
  rowIndex: number;
  /** External reference / member number from source system */
  referenceId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  /** Resolved FK; preferred when set */
  unionMembershipTypeId: number | null;
  /** Fallback when id not sent (matches union_membership_types.type_name) */
  unionMembershipTypeKey?: string | null;
  memberRoleTypeId?: number | null;
  unionId: number | null;
  resignationDate: string | null;
  /** Original join date */
  joinDate: string | null;
  /** Latest re-join date — only advanced if more recent than existing */
  rejoinDate: string | null;
  worksiteId: number | null;
  employerId: number | null;
  rawMembershipStatus: string;
  notes: string | null;
  /** Resolved FK into occupations table */
  canonicalOccupationId: number | null;
  /** Raw occupation string from the import file (used to create an alias) */
  rawOccupation: string | null;
  /** Import-time primary occupation creation when no existing occupation fits */
  createOccupationName?: string | null;
  /** Secondary occupations for dual-trade workers */
  additionalOccupationIds?: number[];
  /** Existing cross-cutting specialisations such as Rope Access */
  specialisationIds?: number[];
  /** Import-time specialisation creation */
  createSpecialisationNames?: string[];
  /** Assessment values derived from mapped spreadsheet columns */
  assessmentEvents?: WorkerImportAssessmentEvent[];
  /** When membership resolves to non_oa_member, matched to non_oa_union_options.badge_initials */
  nonOaUnionBadgeInitials?: string | null;
  // Dedup decision
  action: "create" | "update" | "skip";
  existingWorkerId?: number;
}

export interface WorkerImportApplyRequest {
  fileName: string;
  campaignId?: number | null;
  assessmentColumns?: WorkerImportAssessmentColumn[];
  rows: WorkerImportRow[];
}

export interface WorkerImportRowResult {
  rowIndex: number;
  action: WorkerImportRow["action"];
  workerId: number | null;
  status: "created" | "updated" | "skipped" | "error";
  errors: string[];
}

export interface WorkerImportApplyResponse {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  rowResults: WorkerImportRowResult[];
}

async function maybeInsertOccupationAlias(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  occupationId: number | null,
  rawOccupation: string | null,
  userId: string
): Promise<void> {
  if (!occupationId || !rawOccupation) return;

  // Fetch the canonical name to avoid storing it as its own alias
  const { data: occ } = await supabase
    .from("occupations")
    .select("canonical_name")
    .eq("occupation_id", occupationId)
    .single();

  const canonicalName: string | null = occ?.canonical_name ?? null;
  if (canonicalName && canonicalName.toLowerCase().trim() === rawOccupation.toLowerCase().trim()) {
    return; // Raw text is already the canonical name — no alias needed
  }

  const { error } = await supabase.from("occupation_aliases").insert({
    occupation_id: occupationId,
    alias_name: rawOccupation.trim(),
    source: "import",
    created_by: userId,
  });

  // Unique constraint violation (alias already exists) is safe to ignore
  if (error && error.code !== "23505") {
    console.error("Failed to insert occupation alias:", error.message);
  }
}

async function ensureOccupation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  name: string
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Occupation name is required");

  const { data: existing, error: existingError } = await supabase
    .from("occupations")
    .select("occupation_id")
    .ilike("canonical_name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.occupation_id) return existing.occupation_id;

  const { data: inserted, error } = await supabase
    .from("occupations")
    .insert({ canonical_name: trimmed, is_active: true })
    .select("occupation_id")
    .single();
  if (error) throw error;
  return inserted.occupation_id;
}

async function ensureSpecialisation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  name: string
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Specialisation name is required");

  const { data: existing, error: existingError } = await supabase
    .from("specialisations")
    .select("specialisation_id")
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.specialisation_id) return existing.specialisation_id;

  const { data: inserted, error } = await supabase
    .from("specialisations")
    .insert({ name: trimmed, is_active: true })
    .select("specialisation_id")
    .single();
  if (error) throw error;
  return inserted.specialisation_id;
}

async function ensureAssessmentActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  column: WorkerImportAssessmentColumn,
  campaignId: number | null | undefined
): Promise<number | null> {
  if (column.activityId) return column.activityId;
  if (!campaignId) return null;

  const { data, error } = await supabase
    .from("campaign_activities")
    .insert({
      campaign_id: campaignId,
      title: column.title.trim() || column.columnHeader,
      activity_kind: "assessment",
      is_binary: column.isBinary,
      is_custom: true,
    })
    .select("activity_id")
    .single();
  if (error) throw error;
  return data.activity_id;
}

async function syncWorkerExtras(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workerId: number,
  additionalOccupationIds: number[],
  specialisationIds: number[]
): Promise<void> {
  if (additionalOccupationIds.length > 0) {
    const { error } = await supabase.from("worker_additional_occupations").upsert(
      [...new Set(additionalOccupationIds)].map((occupation_id) => ({
        worker_id: workerId,
        occupation_id,
      })),
      { onConflict: "worker_id,occupation_id", ignoreDuplicates: true }
    );
    if (error) throw error;
  }

  if (specialisationIds.length > 0) {
    const { error } = await supabase.from("worker_specialisations").upsert(
      [...new Set(specialisationIds)].map((specialisation_id) => ({
        worker_id: workerId,
        specialisation_id,
      })),
      { onConflict: "worker_id,specialisation_id", ignoreDuplicates: true }
    );
    if (error) throw error;
  }
}

async function maybeAddWorkerToCampaign(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  campaignId: number | null | undefined,
  workerId: number
): Promise<void> {
  if (!campaignId) return;
  const { error } = await supabase
    .from("campaign_worker_membership")
    .upsert(
      { campaign_id: campaignId, worker_id: workerId },
      { onConflict: "campaign_id,worker_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

async function recordAssessmentEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workerId: number,
  row: WorkerImportRow,
  activityIdByColumn: Map<string, number>,
  userId: string
): Promise<void> {
  for (const event of row.assessmentEvents ?? []) {
    const activityId = activityIdByColumn.get(event.columnHeader);
    if (!activityId) continue;
    if (event.rating == null && event.binaryValue == null) continue;

    const { error } = await supabase.rpc("record_assessment_event", {
      p_activity_id: activityId,
      p_worker_id: workerId,
      p_rating: event.rating,
      p_binary_value: event.binaryValue,
      p_rating_phase: "actual",
      p_event_id: null,
      p_source: "staff",
      p_notes: `Imported from ${event.columnHeader}: ${event.rawValue}`,
      p_actor_id: userId,
    });
    if (error) throw error;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify authenticated session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: WorkerImportApplyRequest;
  try {
    body = await request.json() as WorkerImportApplyRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { fileName, rows, campaignId, assessmentColumns = [] } = body;
  if (!rows || !Array.isArray(rows)) {
    return NextResponse.json({ success: false, error: "rows array is required" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const rowResults: WorkerImportRowResult[] = [];

  const { data: unionTypes, error: unionTypesError } = await supabase
    .from("union_membership_types")
    .select("union_membership_type_id, type_name");

  if (unionTypesError) {
    return NextResponse.json(
      { success: false, error: `Could not load union membership types: ${unionTypesError.message}` },
      { status: 500 }
    );
  }

  const membershipIdByTypeName = new Map(
    (unionTypes ?? []).map((r) => [r.type_name, r.union_membership_type_id])
  );
  const resignedMembershipId = membershipIdByTypeName.get("resigned_member") ?? null;
  const activityIdByColumn = new Map<string, number>();

  for (const column of assessmentColumns) {
    try {
      const activityId = await ensureAssessmentActivity(supabase, column, campaignId);
      if (activityId) activityIdByColumn.set(column.columnHeader, activityId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Failed to prepare assessment ${column.columnHeader}`;
      errors.push(`Assessment column ${column.columnHeader}: ${message}`);
    }
  }

  const { data: nonOaUnionCatalog, error: nonOaCatError } = await supabase
    .from("non_oa_union_options")
    .select("non_oa_union_option_id, badge_initials");

  if (nonOaCatError) {
    return NextResponse.json(
      {
        success: false,
        error: `Could not load non-OA union options: ${nonOaCatError.message}`,
      },
      { status: 500 }
    );
  }

  const nonOaCatalogRows = nonOaUnionCatalog ?? [];

  if (errors.length > 0) {
    return NextResponse.json(
      {
        success: false,
        created,
        updated,
        skipped,
        errors,
        rowResults,
      } satisfies WorkerImportApplyResponse,
      { status: 400 }
    );
  }

  for (const row of rows) {
    const rowErrors: string[] = [];

    if (row.action === "skip") {
      skipped++;
      rowResults.push({
        rowIndex: row.rowIndex,
        action: row.action,
        workerId: row.existingWorkerId ?? null,
        status: "skipped",
        errors: [],
      });
      continue;
    }

    const unionMembershipTypeId =
      row.unionMembershipTypeId ??
      (row.unionMembershipTypeKey
        ? membershipIdByTypeName.get(row.unionMembershipTypeKey) ?? null
        : null);

    const isResigned =
      row.unionMembershipTypeKey === "resigned_member" ||
      (resignedMembershipId != null && unionMembershipTypeId === resignedMembershipId);

    let canonicalOccupationId = row.canonicalOccupationId ?? null;
    if (!canonicalOccupationId && row.createOccupationName?.trim()) {
      try {
        canonicalOccupationId = await ensureOccupation(supabase, row.createOccupationName);
      } catch (error) {
        rowErrors.push(
          `Failed to create occupation "${row.createOccupationName}": ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    if (rowErrors.length > 0) {
      for (const error of rowErrors) {
        errors.push(`Row ${row.rowIndex}: ${error}`);
      }
      rowResults.push({
        rowIndex: row.rowIndex,
        action: row.action,
        workerId: null,
        status: "error",
        errors: rowErrors,
      });
      continue;
    }

    const nonOaMembershipId = membershipIdByTypeName.get("non_oa_member") ?? null;
    const isNonOa =
      nonOaMembershipId != null &&
      unionMembershipTypeId != null &&
      unionMembershipTypeId === nonOaMembershipId;

    let non_oa_union_option_id: number | null = null;
    if (isNonOa && row.nonOaUnionBadgeInitials?.trim()) {
      const rid = lookupNonOaUnionOptionId(row.nonOaUnionBadgeInitials, nonOaCatalogRows);
      if (rid == null) {
        rowErrors.push(
          `Unknown other-union initials "${row.nonOaUnionBadgeInitials.trim()}" — add it in Administration or correct the badge text`
        );
      } else {
        non_oa_union_option_id = rid;
      }
    }

    if (rowErrors.length > 0) {
      for (const error of rowErrors) {
        errors.push(`Row ${row.rowIndex}: ${error}`);
      }
      rowResults.push({
        rowIndex: row.rowIndex,
        action: row.action,
        workerId: null,
        status: "error",
        errors: rowErrors,
      });
      continue;
    }

    const workerData: Record<string, unknown> = {
      first_name: row.firstName.trim(),
      last_name: row.lastName.trim(),
      preferred_name: row.preferredName || null,
      reference_id: row.referenceId || null,
      email: row.email || null,
      phone: row.phone || null,
      union_membership_type_id: unionMembershipTypeId,
      member_role_type_id: row.memberRoleTypeId ?? null,
      union_id: row.unionId,
      resignation_date: row.resignationDate,
      join_date: row.joinDate || null,
      worksite_id: row.worksiteId,
      employer_id: row.employerId ?? null,
      canonical_occupation_id: canonicalOccupationId,
      notes: row.notes || null,
      is_active: !isResigned,
      updated_at: new Date().toISOString(),
      non_oa_union_option_id: isNonOa ? non_oa_union_option_id : null,
    };

    let workerId: number | null = null;

    if (row.action === "update" && row.existingWorkerId) {
      // Apply rejoin_date recency guard: only advance if incoming date is more recent
      if (row.rejoinDate) {
        const { data: existing } = await supabase
          .from("workers")
          .select("rejoin_date")
          .eq("worker_id", row.existingWorkerId)
          .single();
        const existingRejoin = existing?.rejoin_date as string | null;
        if (!existingRejoin || row.rejoinDate > existingRejoin) {
          workerData.rejoin_date = row.rejoinDate;
        }
      }

      const { error } = await supabase
        .from("workers")
        .update(workerData)
        .eq("worker_id", row.existingWorkerId)
        .select("worker_id")
        .single();

      if (error) {
        rowErrors.push(`Failed to update ${row.firstName} ${row.lastName} — ${error.message}`);
      } else {
        updated++;
        workerId = row.existingWorkerId;
      }
    } else if (row.action === "create") {
      // For creates, set rejoin_date directly with no guard needed
      if (row.rejoinDate) workerData.rejoin_date = row.rejoinDate;

      const { data: inserted, error } = await supabase
        .from("workers")
        .insert({
          ...workerData,
        })
        .select("worker_id")
        .single();

      if (error) {
        rowErrors.push(`Failed to create ${row.firstName} ${row.lastName} — ${error.message}`);
      } else {
        created++;
        workerId = inserted.worker_id;
      }
    }

    if (workerId) {
      try {
        const additionalOccupationIds = [...(row.additionalOccupationIds ?? [])];
        const specialisationIds = [...(row.specialisationIds ?? [])];

        for (const name of row.createSpecialisationNames ?? []) {
          if (name.trim()) {
            specialisationIds.push(await ensureSpecialisation(supabase, name));
          }
        }

        await maybeInsertOccupationAlias(supabase, canonicalOccupationId, row.rawOccupation, user.id);
        await syncWorkerExtras(supabase, workerId, additionalOccupationIds, specialisationIds);
        await maybeAddWorkerToCampaign(supabase, campaignId, workerId);
        await recordAssessmentEvents(supabase, workerId, row, activityIdByColumn, user.id);
      } catch (error) {
        rowErrors.push(error instanceof Error ? error.message : String(error));
      }
    }

    for (const error of rowErrors) {
      errors.push(`Row ${row.rowIndex}: ${error}`);
    }
    rowResults.push({
      rowIndex: row.rowIndex,
      action: row.action,
      workerId,
      status: rowErrors.length > 0 ? "error" : row.action === "update" ? "updated" : "created",
      errors: rowErrors,
    });
  }

  // Log to import_logs
  await supabase.from("import_logs").insert({
    file_name: fileName,
    import_type: "workers_wizard",
    records_created: created,
    records_updated: updated,
    errors: errors.length > 0 ? errors.join("\n") : null,
    imported_by: user.id,
  });

  return NextResponse.json({
    success: errors.length === 0,
    created,
    updated,
    skipped,
    errors,
    rowResults,
  } satisfies WorkerImportApplyResponse);
}
