import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { structureApi } from "@/lib/campaign/structure-api";
import { structureErrorMessage, structureErrorStatus } from "@/lib/campaign/structure-error-message";
import {
  stampEmployerWorksiteFromOu,
  syncWorkersToMatchingCampaigns,
} from "@/lib/workers/sync-campaign-universe";

const ouTypeSchema = z.enum([
  "shift",
  "department",
  "network",
  "job_type",
  "worksite",
  "ethnic_community",
  "crew_rotation",
  "accommodation",
  "work_area",
  "custom",
]);

const addWorkersSchema = z.discriminatedUnion("unitMode", [
  z.object({
    unitMode: z.literal("unallocated"),
    worker_ids: z.array(z.number().int().positive()).min(1).max(500),
  }),
  z.object({
    unitMode: z.literal("existing"),
    worker_ids: z.array(z.number().int().positive()).min(1).max(500),
    ou_id: z.number().int().positive(),
  }),
  z.object({
    unitMode: z.literal("new"),
    worker_ids: z.array(z.number().int().positive()).min(1).max(500),
    new_unit: z.object({
      name: z.string().trim().min(1).max(200),
      ou_type: ouTypeSchema,
    }),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json(
      { success: false, error: "Invalid campaign ID" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role === "viewer") {
    return NextResponse.json(
      { success: false, error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  let body: z.infer<typeof addWorkersSchema>;
  try {
    const raw = await request.json();
    body = addWorkersSchema.parse(raw);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid request body";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }

  // Step 1: ensure each worker has a campaign_worker_membership row.
  // Idempotent via UNIQUE(campaign_id, worker_id).
  const membershipRows = body.worker_ids.map((worker_id) => ({
    campaign_id: campaignId,
    worker_id,
  }));
  const { error: memErr } = await supabase
    .from("campaign_worker_membership")
    .upsert(membershipRows, {
      onConflict: "campaign_id,worker_id",
      ignoreDuplicates: true,
    });
  if (memErr) {
    return NextResponse.json(
      { success: false, error: `Membership insert failed: ${memErr.message}` },
      { status: 500 }
    );
  }

  // Step 2: resolve the target ou_id (if any), creating a new unit when asked.
  let targetOuId: number | null = null;
  let targetOuBasis: unknown = null;
  let createdOu: { ou_id: number; name: string } | null = null;

  if (body.unitMode === "existing") {
    const { data: ouRow, error: ouErr } = await supabase
      .from("campaign_organising_units")
      .select("ou_id, unit_basis")
      .eq("ou_id", body.ou_id)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (ouErr || !ouRow) {
      return NextResponse.json(
        { success: false, error: "Unit not found for this campaign" },
        { status: 400 }
      );
    }
    targetOuId = body.ou_id;
    targetOuBasis = (ouRow as { unit_basis: unknown }).unit_basis;
  } else if (body.unitMode === "new") {
    const { data: maxRow } = await supabase
      .from("campaign_organising_units")
      .select("display_order")
      .eq("campaign_id", campaignId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder =
      (maxRow?.display_order != null ? Number(maxRow.display_order) : -1) + 1;

    // WP2.2 Stage 6 (wp2.2.md §3.11 row 17): one `structure_units_create`
    // with the legacy insert's columns.
    try {
      const created = await structureApi(supabase).units.create({
        campaignId,
        units: [
          {
            name: body.new_unit.name,
            ou_type: body.new_unit.ou_type,
            display_order: nextOrder,
            source: "manual",
          },
        ],
      });
      const newOu = created.units[0];
      if (!newOu) throw new Error("no row returned");
      targetOuId = newOu.ou_id;
      createdOu = { ou_id: newOu.ou_id, name: body.new_unit.name };
    } catch (createErr) {
      return NextResponse.json(
        {
          success: false,
          error: `Unit create failed: ${structureErrorMessage(createErr, "no row returned")}`,
        },
        { status: structureErrorStatus(createErr) }
      );
    }
  }

  // Step 3: assign workers to the target unit if one is set.
  // WP2.2 Stage 6 (row 17): one `structure_placements_assign` for the whole
  // list; the legacy upsert ignored a duplicate `(ou_id, worker_id)`, so
  // `p_on_conflict: "skip"` — a worker already in a unit of that group is
  // skipped too (C-a) and counted in `ou_assignments_skipped`.
  let ouAssignmentsCount = 0;
  let ouAssignmentsSkipped = 0;
  if (targetOuId != null) {
    try {
      const res = await structureApi(supabase).placements.assign({
        campaignId,
        ouId: targetOuId,
        workerIds: body.worker_ids,
        source: "manual",
        isPrimary: false,
        onConflict: "skip",
      });
      ouAssignmentsCount = res.inserted;
      ouAssignmentsSkipped = res.skipped;
    } catch (ouAssignErr) {
      return NextResponse.json(
        {
          success: false,
          error: `OU assignment failed: ${structureErrorMessage(ouAssignErr, "unknown error")}`,
        },
        { status: structureErrorStatus(ouAssignErr) }
      );
    }
    if (targetOuBasis) {
      await stampEmployerWorksiteFromOu(supabase, body.worker_ids, targetOuBasis);
    }
  }

  await syncWorkersToMatchingCampaigns(supabase, body.worker_ids);

  return NextResponse.json({
    success: true,
    membership_count: membershipRows.length,
    ou_assignments_count: ouAssignmentsCount,
    ou_assignments_skipped: ouAssignmentsSkipped,
    created_ou: createdOu,
  });
}
