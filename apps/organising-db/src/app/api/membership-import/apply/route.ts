import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MembershipImportType, ParsedMembershipRow } from "../parse/route";

interface ApplyRow extends ParsedMembershipRow {
  resolvedEmployerId: number | null;
  resolvedWorksiteId: number | null;
  resolvedOccupationId: number | null;
  resolvedMembershipTypeId: number | null;
  dedupAction: "create" | "update" | "skip";
  existingWorkerId: number | null;
}

interface ApplyRequest {
  rows: ApplyRow[];
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const importType = searchParams.get("type") as MembershipImportType | null;
  if (!importType) {
    return NextResponse.json({ success: false, error: "Missing ?type= param" }, { status: 400 });
  }

  let body: ApplyRequest;
  try {
    body = await request.json() as ApplyRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { rows } = body;
  if (!rows || !Array.isArray(rows)) {
    return NextResponse.json({ success: false, error: "rows array is required" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Pre-load resigned member type id (for resignations import)
  const { data: membershipTypes } = await supabase
    .from("union_membership_types")
    .select("union_membership_type_id, type_name");
  const resignedTypeId =
    membershipTypes?.find((t) => t.type_name === "resigned_member")?.union_membership_type_id ?? null;
  const financialMemberTypeId =
    membershipTypes?.find((t) => t.type_name === "financial_member")?.union_membership_type_id ?? null;

  for (const row of rows) {
    if (row.dedupAction === "skip") {
      skipped++;
      continue;
    }

    const fullName = `${row.firstName} ${row.lastName}`;

    try {
      if (row.dedupAction === "update" && row.existingWorkerId) {
        // ── UPDATE existing worker ─────────────────────────────────────────
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        // Always update identifying fields
        if (row.referenceId) patch.reference_id = row.referenceId;
        if (row.resolvedEmployerId) patch.employer_id = row.resolvedEmployerId;
        if (row.resolvedWorksiteId) patch.worksite_id = row.resolvedWorksiteId;
        if (row.resolvedOccupationId) patch.canonical_occupation_id = row.resolvedOccupationId;
        if (row.email) patch.email = row.email;
        if (row.phone) patch.phone = row.phone;

        if (importType === "new_joins") {
          if (row.joinDate) patch.join_date = row.joinDate;
          // Only update rejoin_date if the new value is more recent
          if (row.rejoinDate) {
            const { data: existing } = await supabase
              .from("workers")
              .select("rejoin_date")
              .eq("worker_id", row.existingWorkerId)
              .single();
            const existingRejoin = existing?.rejoin_date;
            if (!existingRejoin || row.rejoinDate > existingRejoin) {
              patch.rejoin_date = row.rejoinDate;
            }
          }
          patch.is_active = true;
          if (financialMemberTypeId) patch.union_membership_type_id = financialMemberTypeId;
        }

        if (importType === "resignations") {
          patch.resignation_date = row.resignationDate;
          if (row.resignationReason) patch.resignation_reason = row.resignationReason;
          patch.is_active = false;
          if (resignedTypeId) patch.union_membership_type_id = resignedTypeId;
          // Only set join_date if currently null
          if (row.joinDate) {
            const { data: existing } = await supabase
              .from("workers")
              .select("join_date")
              .eq("worker_id", row.existingWorkerId)
              .single();
            if (!existing?.join_date) {
              patch.join_date = row.joinDate;
            }
          }
        }

        if (importType === "recommencing") {
          // Only update rejoin_date if more recent
          if (row.rejoinDate) {
            const { data: existing } = await supabase
              .from("workers")
              .select("rejoin_date")
              .eq("worker_id", row.existingWorkerId)
              .single();
            const existingRejoin = existing?.rejoin_date;
            if (!existingRejoin || row.rejoinDate > existingRejoin) {
              patch.rejoin_date = row.rejoinDate;
            }
          }
          patch.is_active = true;
          if (row.resolvedMembershipTypeId) {
            patch.union_membership_type_id = row.resolvedMembershipTypeId;
          }
        }

        const { error } = await supabase
          .from("workers")
          .update(patch)
          .eq("worker_id", row.existingWorkerId);

        if (error) {
          errors.push(`Row ${row.rowIndex}: Failed to update ${fullName} — ${error.message}`);
        } else {
          updated++;
        }
      } else if (row.dedupAction === "create") {
        // ── CREATE new worker ──────────────────────────────────────────────
        if (importType === "resignations") {
          // For resignations, only create if we have enough info (name + reference_id or email)
          if (!row.referenceId && !row.email) {
            errors.push(
              `Row ${row.rowIndex}: Skipped ${fullName} — no reference_id or email to identify resigned member`
            );
            skipped++;
            continue;
          }
        }

        const workerData: Record<string, unknown> = {
          first_name: row.firstName.trim(),
          last_name: row.lastName.trim(),
          email: row.email || null,
          phone: row.phone || null,
          reference_id: row.referenceId || null,
          employer_id: row.resolvedEmployerId || null,
          worksite_id: row.resolvedWorksiteId || null,
          canonical_occupation_id: row.resolvedOccupationId || null,
          updated_at: new Date().toISOString(),
        };

        if (importType === "new_joins") {
          workerData.join_date = row.joinDate || null;
          workerData.rejoin_date = row.rejoinDate || null;
          workerData.is_active = true;
          workerData.union_membership_type_id = financialMemberTypeId;
        }

        if (importType === "resignations") {
          workerData.join_date = row.joinDate || null;
          workerData.resignation_date = row.resignationDate || null;
          workerData.resignation_reason = row.resignationReason || null;
          workerData.is_active = false;
          workerData.union_membership_type_id = resignedTypeId;
        }

        if (importType === "recommencing") {
          workerData.rejoin_date = row.rejoinDate || null;
          workerData.is_active = true;
          workerData.union_membership_type_id = row.resolvedMembershipTypeId || financialMemberTypeId;
        }

        const { error } = await supabase.from("workers").insert(workerData);

        if (error) {
          errors.push(`Row ${row.rowIndex}: Failed to create ${fullName} — ${error.message}`);
        } else {
          created++;
        }
      }
    } catch (err) {
      errors.push(
        `Row ${row.rowIndex}: Exception for ${fullName} — ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  // Log to import_logs
  await supabase.from("import_logs").insert({
    file_name: `membership_${importType}`,
    import_type: `membership_${importType}`,
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
  });
}
