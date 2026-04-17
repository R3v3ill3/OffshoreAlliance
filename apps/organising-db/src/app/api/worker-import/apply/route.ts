import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  // Dedup decision
  action: "create" | "update" | "skip";
  existingWorkerId?: number;
}

export interface WorkerImportApplyRequest {
  fileName: string;
  rows: WorkerImportRow[];
}

export interface WorkerImportApplyResponse {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

async function maybeInsertOccupationAlias(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  row: WorkerImportRow,
  userId: string
): Promise<void> {
  if (!row.canonicalOccupationId || !row.rawOccupation) return;

  // Fetch the canonical name to avoid storing it as its own alias
  const { data: occ } = await supabase
    .from("occupations")
    .select("canonical_name")
    .eq("occupation_id", row.canonicalOccupationId)
    .single();

  const canonicalName: string | null = occ?.canonical_name ?? null;
  if (canonicalName && canonicalName.toLowerCase().trim() === row.rawOccupation.toLowerCase().trim()) {
    return; // Raw text is already the canonical name — no alias needed
  }

  const { error } = await supabase.from("occupation_aliases").insert({
    occupation_id: row.canonicalOccupationId,
    alias_name: row.rawOccupation.trim(),
    source: "import",
    created_by: userId,
  });

  // Unique constraint violation (alias already exists) is safe to ignore
  if (error && error.code !== "23505") {
    console.error("Failed to insert occupation alias:", error.message);
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

  const { fileName, rows } = body;
  if (!rows || !Array.isArray(rows)) {
    return NextResponse.json({ success: false, error: "rows array is required" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

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

  for (const row of rows) {
    if (row.action === "skip") {
      skipped++;
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
      canonical_occupation_id: row.canonicalOccupationId ?? null,
      notes: row.notes || null,
      is_active: !isResigned,
      updated_at: new Date().toISOString(),
    };

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
        .eq("worker_id", row.existingWorkerId);

      if (error) {
        errors.push(
          `Row ${row.rowIndex}: Failed to update ${row.firstName} ${row.lastName} — ${error.message}`
        );
      } else {
        updated++;
        await maybeInsertOccupationAlias(supabase, row, user.id);
      }
    } else if (row.action === "create") {
      // For creates, set rejoin_date directly with no guard needed
      if (row.rejoinDate) workerData.rejoin_date = row.rejoinDate;

      const { error } = await supabase.from("workers").insert({
        ...workerData,
      });

      if (error) {
        errors.push(
          `Row ${row.rowIndex}: Failed to create ${row.firstName} ${row.lastName} — ${error.message}`
        );
      } else {
        created++;
        await maybeInsertOccupationAlias(supabase, row, user.id);
      }
    }
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
    success: true,
    created,
    updated,
    skipped,
    errors,
  } satisfies WorkerImportApplyResponse);
}
