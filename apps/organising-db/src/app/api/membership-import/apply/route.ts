import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MembershipImportType, ParsedMembershipRow } from "../parse/route";

interface ApplyRow extends ParsedMembershipRow {
  resolvedEmployerId: number | null;
  resolvedWorksiteId: number | null;
  resolvedOccupationId: number | null;
  resolvedMembershipTypeId: number | null;
  /** Resolved option ids for the new typed worker dimensions, when the
   *  mapping wizard chose to apply them. Null = leave the existing value
   *  alone; a number = upsert that FK on the worker. */
  resolvedShiftId?: number | null;
  resolvedWorkAreaId?: number | null;
  resolvedRosterPanelId?: number | null;
  dedupAction: "create" | "update" | "skip";
  existingWorkerId: number | null;
}

interface ApplyRequest {
  rows: ApplyRow[];
  /** Optional flag from the wizard: when true, any unrecognised shift / work
   *  area / roster panel string values are inserted into the corresponding
   *  worker_*_options table on the fly and their new id is used. */
  createMissingDimensionOptions?: boolean;
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

  const { rows, createMissingDimensionOptions } = body;
  if (!rows || !Array.isArray(rows)) {
    return NextResponse.json({ success: false, error: "rows array is required" }, { status: 400 });
  }

  // ── Resolve shift / work_area / roster_panel raw values to option ids. ──
  // We collect every unique non-null label across the batch, look them up in
  // their respective options table, and (when allowed) insert any missing
  // ones in a single upsert call so per-row apply stays cheap.
  type OptionTable =
    | "worker_shift_options"
    | "worker_work_area_options"
    | "worker_roster_panel_options";

  async function buildOptionMap(
    table: OptionTable,
    rawValues: (string | null | undefined)[]
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const distinct = Array.from(
      new Set(
        rawValues
          .map((v) => (v ?? "").trim())
          .filter((v) => v.length > 0)
          .map((v) => v.toLowerCase())
      )
    );
    if (distinct.length === 0) return out;

    const { data: existing, error } = await supabase
      .from(table)
      .select("id, name")
      .in(
        "name",
        distinct
          .map((v) => v) // case-insensitive match handled below
          .concat(distinct.map((v) => v.replace(/\b\w/g, (c) => c.toUpperCase())))
      );
    if (error) {
      // If the table doesn't exist on this environment yet, fall back to an
      // empty map and let row-level apply leave the FK null.
      return out;
    }
    for (const r of existing ?? []) {
      const key = String((r as { name: string }).name).trim().toLowerCase();
      if (!out.has(key)) out.set(key, (r as { id: number }).id);
    }

    if (createMissingDimensionOptions) {
      const missing = distinct.filter((v) => !out.has(v));
      if (missing.length > 0) {
        // Insert with the original casing where possible (using the first raw
        // string we saw in the batch).
        const firstByLower = new Map<string, string>();
        for (const v of rawValues) {
          const trimmed = (v ?? "").trim();
          if (!trimmed) continue;
          const k = trimmed.toLowerCase();
          if (!firstByLower.has(k)) firstByLower.set(k, trimmed);
        }
        const { data: inserted, error: insErr } = await supabase
          .from(table)
          .insert(
            missing.map((m) => ({
              name: firstByLower.get(m) ?? m,
              is_active: true,
            }))
          )
          .select("id, name");
        if (!insErr) {
          for (const r of inserted ?? []) {
            const key = String((r as { name: string }).name).trim().toLowerCase();
            out.set(key, (r as { id: number }).id);
          }
        }
      }
    }
    return out;
  }

  const shiftMap = await buildOptionMap(
    "worker_shift_options",
    rows.map((r) => r.shiftRaw)
  );
  const workAreaMap = await buildOptionMap(
    "worker_work_area_options",
    rows.map((r) => r.workAreaRaw)
  );
  const rosterPanelMap = await buildOptionMap(
    "worker_roster_panel_options",
    rows.map((r) => r.rosterPanelRaw)
  );

  function resolveOption(
    map: Map<string, number>,
    raw: string | null | undefined,
    explicit: number | null | undefined
  ): number | null {
    if (typeof explicit === "number") return explicit;
    if (!raw) return null;
    return map.get(raw.trim().toLowerCase()) ?? null;
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

        const resolvedShift = resolveOption(shiftMap, row.shiftRaw, row.resolvedShiftId);
        const resolvedWorkArea = resolveOption(workAreaMap, row.workAreaRaw, row.resolvedWorkAreaId);
        const resolvedRosterPanel = resolveOption(
          rosterPanelMap,
          row.rosterPanelRaw,
          row.resolvedRosterPanelId
        );
        if (resolvedShift != null) patch.shift_id = resolvedShift;
        if (resolvedWorkArea != null) patch.work_area_id = resolvedWorkArea;
        if (resolvedRosterPanel != null) patch.roster_panel_id = resolvedRosterPanel;

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
          shift_id:
            resolveOption(shiftMap, row.shiftRaw, row.resolvedShiftId) ?? null,
          work_area_id:
            resolveOption(workAreaMap, row.workAreaRaw, row.resolvedWorkAreaId) ??
            null,
          roster_panel_id:
            resolveOption(
              rosterPanelMap,
              row.rosterPanelRaw,
              row.resolvedRosterPanelId
            ) ?? null,
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
