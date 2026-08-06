import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type {
  ParticipationApplyPreview,
  ParticipationApplyResult,
  ParticipationConflict,
} from "@/lib/import/participation-import-shared";

const valueFields = {
  rating: z.number().int().min(1).max(5).nullable(),
  binary_value: z.string().trim().min(1).max(30).nullable(),
  notes: z.string().max(2000).nullish(),
  add_to_campaign: z.boolean(),
  an_person_id: z.string().max(100).nullish(),
};

const applyRowSchema = z.discriminatedUnion("action", [
  z.object({
    key: z.string().min(1),
    action: z.literal("existing"),
    worker_id: z.number().int().positive(),
    ...valueFields,
  }),
  z.object({
    key: z.string().min(1),
    action: z.literal("create"),
    new_worker: z.object({
      first_name: z.string().trim().min(1).max(100),
      last_name: z.string().trim().min(1).max(100),
      email: z.string().trim().max(200).nullable(),
      phone: z.string().trim().max(30).nullable(),
    }),
    ...valueFields,
  }),
  z.object({ key: z.string().min(1), action: z.literal("skip") }),
]);

const applySchema = z.object({
  activity: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), activity_id: z.number().int().positive() }),
    z.object({
      mode: z.literal("new"),
      title: z.string().trim().min(1).max(300),
      is_binary: z.boolean(),
      supporter_outcome_value: z.string().trim().max(30).nullable(),
      description: z.string().max(2000).nullish(),
    }),
  ]),
  source_kind: z.enum(["an_api", "an_report_csv"]),
  file_name: z.string().max(300).nullish(),
  an_resource: z
    .object({
      type: z.enum(["form", "survey", "petition", "event"]),
      id: z.string().min(1).max(100),
      browser_url: z.string().max(1000).nullish(),
    })
    .nullish(),
  conflict_policy: z.enum(["overwrite", "fill_blanks"]),
  non_responders: z
    .object({
      enabled: z.boolean(),
      rating: z.number().int().min(1).max(5).nullable(),
      binary_value: z.string().trim().min(1).max(30).nullable(),
    })
    .nullish(),
  mapping: z.unknown().optional(),
  rows: z.array(applyRowSchema).min(1).max(5000),
  dry_run: z.boolean().optional(),
});

type ApplyBody = z.infer<typeof applySchema>;
type ValueRow = Extract<ApplyBody["rows"][number], { action: "existing" | "create" }>;

const RPC_CHUNK = 1000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ success: false, error: "Invalid campaign ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role === "viewer") {
    return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
  }

  let body: ApplyBody;
  try {
    body = applySchema.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid request body";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  const valueRows = body.rows.filter(
    (r): r is ValueRow => r.action === "existing" || r.action === "create"
  );
  const invalid = valueRows.find((r) => r.rating == null && r.binary_value == null);
  if (invalid) {
    return NextResponse.json(
      { success: false, error: `Row ${invalid.key}: needs a rating or a binary value` },
      { status: 400 }
    );
  }
  const nonResponders = body.non_responders?.enabled ? body.non_responders : null;
  if (nonResponders && nonResponders.rating == null && nonResponders.binary_value == null) {
    return NextResponse.json(
      { success: false, error: "Non-responder marking needs a rating or a binary value" },
      { status: 400 }
    );
  }

  // ── Resolve the target activity (never creates during dry runs) ────────────
  let activityId: number | null = null;
  if (body.activity.mode === "existing") {
    const { data: activity, error: actErr } = await supabase
      .from("campaign_activities")
      .select("activity_id, campaign_id")
      .eq("activity_id", body.activity.activity_id)
      .maybeSingle();
    if (actErr || !activity || activity.campaign_id !== campaignId) {
      return NextResponse.json(
        { success: false, error: "Assessment not found for this campaign" },
        { status: 400 }
      );
    }
    activityId = activity.activity_id;
  }

  // ── Existing ratings on the assessment (conflicts + non-responder guard) ──
  const existingByWorker = new Map<number, { rating: number | null; binary_value: string | null }>();
  if (activityId != null) {
    const { data: ratings, error: ratErr } = await supabase
      .from("campaign_activity_ratings")
      .select("worker_id, rating, binary_value")
      .eq("activity_id", activityId)
      .eq("rating_phase", "actual")
      .is("event_id", null);
    if (ratErr) {
      return NextResponse.json(
        { success: false, error: `Rating lookup failed: ${ratErr.message}` },
        { status: 500 }
      );
    }
    for (const r of ratings ?? []) {
      existingByWorker.set(r.worker_id, { rating: r.rating, binary_value: r.binary_value });
    }
  }

  const existingActionRows = valueRows.filter((r) => r.action === "existing") as Extract<
    ValueRow,
    { action: "existing" }
  >[];
  const createActionRows = valueRows.filter((r) => r.action === "create") as Extract<
    ValueRow,
    { action: "create" }
  >[];

  const conflictRows = existingActionRows.filter((r) => existingByWorker.has(r.worker_id));
  const skippedConflicts = body.conflict_policy === "fill_blanks" ? conflictRows : [];
  const skippedConflictKeys = new Set(skippedConflicts.map((r) => r.key));
  const appliedExistingRows = existingActionRows.filter((r) => !skippedConflictKeys.has(r.key));

  // ── Non-responders: workforce members not targeted by this import and
  //    not already rated on the assessment (never overwrites).
  let nonResponderIds: number[] = [];
  if (nonResponders) {
    const { data: members, error: memErr } = await supabase
      .from("campaign_worker_membership")
      .select("worker_id")
      .eq("campaign_id", campaignId);
    if (memErr) {
      return NextResponse.json(
        { success: false, error: `Membership lookup failed: ${memErr.message}` },
        { status: 500 }
      );
    }
    const targeted = new Set(existingActionRows.map((r) => r.worker_id));
    nonResponderIds = (members ?? [])
      .map((m) => m.worker_id)
      .filter((wid) => !targeted.has(wid) && !existingByWorker.has(wid));
  }

  // ── Dry run: preview counts + conflict detail ──────────────────────────────
  if (body.dry_run) {
    let conflicts: ParticipationConflict[] = [];
    if (conflictRows.length > 0) {
      const { data: names } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name")
        .in(
          "worker_id",
          conflictRows.map((r) => r.worker_id)
        );
      const nameById = new Map(
        (names ?? []).map((w) => [w.worker_id, `${w.first_name} ${w.last_name}`])
      );
      conflicts = conflictRows.map((r) => {
        const existing = existingByWorker.get(r.worker_id);
        return {
          key: r.key,
          worker_id: r.worker_id,
          worker_name: nameById.get(r.worker_id) ?? `Worker #${r.worker_id}`,
          existing_rating: existing?.rating ?? null,
          existing_binary_value: existing?.binary_value ?? null,
          new_rating: r.rating,
          new_binary_value: r.binary_value,
        };
      });
    }

    const preview: ParticipationApplyPreview = {
      success: true,
      dry_run: true,
      to_create:
        appliedExistingRows.filter((r) => !existingByWorker.has(r.worker_id)).length +
        createActionRows.length,
      to_update: body.conflict_policy === "overwrite" ? conflictRows.length : 0,
      to_skip:
        body.rows.filter((r) => r.action === "skip").length + skippedConflicts.length,
      workers_to_create: createActionRows.length,
      memberships_to_add: valueRows.filter((r) => r.add_to_campaign).length,
      non_responder_count: nonResponderIds.length,
      conflicts,
    };
    return NextResponse.json(preview);
  }

  // ── Real run ────────────────────────────────────────────────────────────────

  // 1. Create the assessment if needed.
  if (body.activity.mode === "new") {
    const { data: inserted, error: insErr } = await supabase
      .from("campaign_activities")
      .insert({
        campaign_id: campaignId,
        title: body.activity.title,
        activity_kind: "assessment",
        is_binary: body.activity.is_binary,
        is_custom: true,
        description: body.activity.description ?? null,
        supporter_outcome_value: body.activity.is_binary
          ? (body.activity.supporter_outcome_value ?? "yes")
          : null,
      })
      .select("activity_id")
      .single();
    if (insErr || !inserted) {
      return NextResponse.json(
        { success: false, error: `Assessment create failed: ${insErr?.message ?? "no row"}` },
        { status: 500 }
      );
    }
    activityId = inserted.activity_id;
  }
  if (activityId == null) {
    return NextResponse.json({ success: false, error: "No target assessment" }, { status: 500 });
  }

  // 2. Stamp the AN linkage for future re-syncs.
  if (body.an_resource) {
    await supabase
      .from("campaign_activities")
      .update({
        an_resource_type: body.an_resource.type,
        an_resource_id: body.an_resource.id,
        an_browser_url: body.an_resource.browser_url ?? null,
        an_last_synced_at: new Date().toISOString(),
      })
      .eq("activity_id", activityId);
  }

  // 3. Batch audit row.
  const { data: batch, error: batchErr } = await supabase
    .from("participation_import_batches")
    .insert({
      campaign_id: campaignId,
      activity_id: activityId,
      source_kind: body.source_kind,
      an_resource_type: body.an_resource?.type ?? null,
      an_resource_id: body.an_resource?.id ?? null,
      file_name: body.file_name ?? null,
      mapping: (body.mapping ?? null) as never,
      rows_total: body.rows.length,
      created_by: user.id,
    })
    .select("batch_id")
    .single();
  if (batchErr || !batch) {
    return NextResponse.json(
      { success: false, error: `Batch create failed: ${batchErr?.message ?? "no row"}` },
      { status: 500 }
    );
  }
  const batchId = batch.batch_id;

  // 4. Create new workers.
  const createdWorkerIds: number[] = [];
  if (createActionRows.length > 0) {
    const { data: created, error: createErr } = await supabase
      .from("workers")
      .insert(
        createActionRows.map((r) => ({
          first_name: r.new_worker.first_name,
          last_name: r.new_worker.last_name,
          email: r.new_worker.email,
          phone: r.new_worker.phone,
          action_network_id: r.an_person_id ?? null,
        }))
      )
      .select("worker_id");
    if (createErr || !created || created.length !== createActionRows.length) {
      return NextResponse.json(
        { success: false, error: `Worker create failed: ${createErr?.message ?? "row count mismatch"}` },
        { status: 500 }
      );
    }
    for (const w of created) createdWorkerIds.push(w.worker_id);
  }

  // 4b. Backfill action_network_id on matched workers that don't have one
  //     yet (AN sync mode). Never overwrites an existing id.
  const backfillRows = existingActionRows.filter((r) => r.an_person_id);
  for (let i = 0; i < backfillRows.length; i += 20) {
    await Promise.all(
      backfillRows.slice(i, i + 20).map((r) =>
        supabase
          .from("workers")
          .update({ action_network_id: r.an_person_id as string })
          .eq("worker_id", r.worker_id)
          .is("action_network_id", null)
      )
    );
  }

  // 5. Campaign membership for matched workers flagged add_to_campaign and
  //    all created workers flagged add_to_campaign.
  const membershipIds = [
    ...appliedExistingRows.filter((r) => r.add_to_campaign).map((r) => r.worker_id),
    // Conflict-skipped rows may still need adding to the workforce.
    ...skippedConflicts.filter((r) => r.add_to_campaign).map((r) => r.worker_id),
    ...createActionRows.map((r, i) => (r.add_to_campaign ? createdWorkerIds[i] : null)),
  ].filter((v): v is number => v != null);
  if (membershipIds.length > 0) {
    const { error: memErr } = await supabase.from("campaign_worker_membership").upsert(
      membershipIds.map((worker_id) => ({ campaign_id: campaignId, worker_id })),
      { onConflict: "campaign_id,worker_id", ignoreDuplicates: true }
    );
    if (memErr) {
      return NextResponse.json(
        { success: false, error: `Membership insert failed: ${memErr.message}` },
        { status: 500 }
      );
    }
  }

  // 6. Ratings, all through the set-based RPC.
  const source = body.source_kind === "an_api" ? "an_sync" : "an_report_import";
  const ratingRows: { worker_id: number; rating: number | null; binary_value: string | null; notes: string | null }[] = [
    ...appliedExistingRows.map((r) => ({
      worker_id: r.worker_id,
      rating: r.rating,
      binary_value: r.binary_value,
      notes: r.notes ?? null,
    })),
    ...createActionRows.map((r, i) => ({
      worker_id: createdWorkerIds[i],
      rating: r.rating,
      binary_value: r.binary_value,
      notes: r.notes ?? null,
    })),
    ...nonResponderIds.map((worker_id) => ({
      worker_id,
      rating: nonResponders?.rating ?? null,
      binary_value: nonResponders?.binary_value ?? null,
      notes: null,
    })),
  ];

  let ratingsApplied = 0;
  for (let i = 0; i < ratingRows.length; i += RPC_CHUNK) {
    const chunk = ratingRows.slice(i, i + RPC_CHUNK);
    const { data: applied, error: rpcErr } = await supabase.rpc("apply_participation_import", {
      p_activity_id: activityId,
      p_rows: chunk as never,
      p_source: source,
      p_rating_phase: "actual",
      p_actor_id: user.id,
      p_import_batch_id: batchId,
    });
    if (rpcErr) {
      return NextResponse.json(
        {
          success: false,
          error: `Rating write failed after ${ratingsApplied} rows: ${rpcErr.message}`,
          batch_id: batchId,
        },
        { status: 500 }
      );
    }
    ratingsApplied += applied ?? chunk.length;
  }

  // 7. Final batch counts.
  const rowsUpdated = body.conflict_policy === "overwrite" ? conflictRows.length : 0;
  const rowsSkipped =
    body.rows.filter((r) => r.action === "skip").length + skippedConflicts.length;
  const rowsCreatedCount = ratingsApplied - rowsUpdated - nonResponderIds.length;
  await supabase
    .from("participation_import_batches")
    .update({
      rows_matched: existingActionRows.length,
      rows_created: Math.max(rowsCreatedCount, 0),
      rows_updated: rowsUpdated,
      rows_skipped: rowsSkipped,
      workers_created: createdWorkerIds.length,
    })
    .eq("batch_id", batchId);

  const result: ParticipationApplyResult = {
    success: true,
    dry_run: false,
    batch_id: batchId,
    activity_id: activityId,
    ratings_applied: ratingsApplied,
    rows_created: Math.max(rowsCreatedCount, 0),
    rows_updated: rowsUpdated,
    rows_skipped: rowsSkipped,
    workers_created: createdWorkerIds.length,
    memberships_added: membershipIds.length,
    non_responders_marked: nonResponderIds.length,
  };
  return NextResponse.json(result);
}
