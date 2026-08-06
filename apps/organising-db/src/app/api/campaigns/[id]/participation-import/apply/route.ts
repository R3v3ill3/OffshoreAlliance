import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type {
  AssessmentPreview,
  AssessmentResult,
  ParticipationApplyPreview,
  ParticipationApplyResult,
  ParticipationConflict,
} from "@/lib/import/participation-import-shared";

const rowValueSchema = z.object({
  ref: z.string().min(1).max(40),
  rating: z.number().int().min(1).max(5).nullable(),
  binary_value: z.string().trim().min(1).max(30).nullable(),
  notes: z.string().max(2000).nullish(),
});

const applyRowSchema = z.discriminatedUnion("action", [
  z.object({
    key: z.string().min(1),
    action: z.literal("existing"),
    worker_id: z.number().int().positive(),
    add_to_campaign: z.boolean(),
    values: z.array(rowValueSchema).max(20),
    an_person_id: z.string().max(100).nullish(),
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
    add_to_campaign: z.boolean(),
    values: z.array(rowValueSchema).max(20),
    an_person_id: z.string().max(100).nullish(),
  }),
  z.object({ key: z.string().min(1), action: z.literal("skip") }),
]);

const assessmentSpecSchema = z.object({
  ref: z.string().min(1).max(40),
  target: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), activity_id: z.number().int().positive() }),
    z.object({
      mode: z.literal("new"),
      title: z.string().trim().min(1).max(300),
      is_binary: z.boolean(),
      supporter_outcome_value: z.string().trim().max(30).nullable(),
      rating_labels: z.record(z.string(), z.string().max(80)).nullish(),
      is_perception: z.boolean().optional(),
      description: z.string().max(2000).nullish(),
    }),
  ]),
  non_responders: z
    .object({
      rating: z.number().int().min(1).max(5).nullable(),
      binary_value: z.string().trim().min(1).max(30).nullable(),
    })
    .nullish(),
});

const applySchema = z.object({
  assessments: z.array(assessmentSpecSchema).min(1).max(20),
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
  mapping: z.unknown().optional(),
  rows: z.array(applyRowSchema).min(1).max(5000),
  dry_run: z.boolean().optional(),
});

type ApplyBody = z.infer<typeof applySchema>;
type ValueRow = Extract<ApplyBody["rows"][number], { action: "existing" | "create" }>;
type AssessmentSpec = ApplyBody["assessments"][number];

const RPC_CHUNK = 1000;

interface ResolvedAssessment {
  spec: AssessmentSpec;
  activityId: number | null; // null until created (new mode, real run)
  title: string;
  /** worker_id → existing rating on this assessment (actual phase, no event). */
  existing: Map<number, { rating: number | null; binary_value: string | null }>;
}

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
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }

  const refs = new Set(body.assessments.map((a) => a.ref));
  if (refs.size !== body.assessments.length) {
    return NextResponse.json(
      { success: false, error: "Duplicate assessment refs" },
      { status: 400 }
    );
  }
  for (const spec of body.assessments) {
    const nr = spec.non_responders;
    if (nr && nr.rating == null && nr.binary_value == null) {
      return NextResponse.json(
        { success: false, error: `Assessment ${spec.ref}: non-responder value required` },
        { status: 400 }
      );
    }
  }

  const valueRows = body.rows.filter(
    (r): r is ValueRow => r.action === "existing" || r.action === "create"
  );
  for (const row of valueRows) {
    for (const v of row.values) {
      if (!refs.has(v.ref)) {
        return NextResponse.json(
          { success: false, error: `Row ${row.key}: unknown assessment ref ${v.ref}` },
          { status: 400 }
        );
      }
      if (v.rating == null && v.binary_value == null) {
        return NextResponse.json(
          { success: false, error: `Row ${row.key}/${v.ref}: needs a rating or a binary value` },
          { status: 400 }
        );
      }
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

  // ── Resolve existing assessments + their current ratings ──────────────────
  const resolved: ResolvedAssessment[] = [];
  for (const spec of body.assessments) {
    if (spec.target.mode === "existing") {
      const { data: activity, error: actErr } = await supabase
        .from("campaign_activities")
        .select("activity_id, campaign_id, title")
        .eq("activity_id", spec.target.activity_id)
        .maybeSingle();
      if (actErr || !activity || activity.campaign_id !== campaignId) {
        return NextResponse.json(
          { success: false, error: `Assessment not found for this campaign (ref ${spec.ref})` },
          { status: 400 }
        );
      }
      const existing = new Map<number, { rating: number | null; binary_value: string | null }>();
      const { data: ratings, error: ratErr } = await supabase
        .from("campaign_activity_ratings")
        .select("worker_id, rating, binary_value")
        .eq("activity_id", activity.activity_id)
        .eq("rating_phase", "actual")
        .is("event_id", null);
      if (ratErr) {
        return NextResponse.json(
          { success: false, error: `Rating lookup failed: ${ratErr.message}` },
          { status: 500 }
        );
      }
      for (const r of ratings ?? []) {
        existing.set(r.worker_id, { rating: r.rating, binary_value: r.binary_value });
      }
      resolved.push({ spec, activityId: activity.activity_id, title: activity.title, existing });
    } else {
      resolved.push({
        spec,
        activityId: null,
        title: spec.target.title,
        existing: new Map(),
      });
    }
  }

  // ── Per-assessment row partitioning (conflicts vs fresh) ───────────────────
  const valueByRefAndKey = new Map<string, Map<string, ValueRow["values"][number]>>();
  for (const spec of body.assessments) valueByRefAndKey.set(spec.ref, new Map());
  for (const row of existingActionRows) {
    for (const v of row.values) valueByRefAndKey.get(v.ref)?.set(row.key, v);
  }

  const rowsSkipped = body.rows.filter((r) => r.action === "skip").length;

  // ── Campaign membership (needed for non-responders) ───────────────────────
  let memberIds: number[] | null = null;
  if (resolved.some((ra) => ra.spec.non_responders)) {
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
    memberIds = (members ?? []).map((m) => m.worker_id);
  }

  const nonRespondersFor = (ra: ResolvedAssessment): number[] => {
    if (!ra.spec.non_responders || !memberIds) return [];
    const targeted = new Set(
      existingActionRows
        .filter((r) => r.values.some((v) => v.ref === ra.spec.ref))
        .map((r) => r.worker_id)
    );
    return memberIds.filter((wid) => !targeted.has(wid) && !ra.existing.has(wid));
  };

  // ── Dry run ────────────────────────────────────────────────────────────────
  if (body.dry_run) {
    const conflictWorkerIds = new Set<number>();
    for (const ra of resolved) {
      for (const row of existingActionRows) {
        if (
          row.values.some((v) => v.ref === ra.spec.ref) &&
          ra.existing.has(row.worker_id)
        ) {
          conflictWorkerIds.add(row.worker_id);
        }
      }
    }
    const nameById = new Map<number, string>();
    if (conflictWorkerIds.size > 0) {
      const { data: names } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name")
        .in("worker_id", Array.from(conflictWorkerIds));
      for (const w of names ?? []) {
        nameById.set(w.worker_id, `${w.first_name} ${w.last_name}`);
      }
    }

    const perAssessment: AssessmentPreview[] = resolved.map((ra) => {
      const targetedRows = existingActionRows
        .map((row) => ({ row, value: row.values.find((v) => v.ref === ra.spec.ref) }))
        .filter((x): x is { row: (typeof existingActionRows)[number]; value: NonNullable<typeof x.value> } => x.value != null);
      const conflicts: ParticipationConflict[] = targetedRows
        .filter(({ row }) => ra.existing.has(row.worker_id))
        .map(({ row, value }) => {
          const existing = ra.existing.get(row.worker_id);
          return {
            key: row.key,
            worker_id: row.worker_id,
            worker_name: nameById.get(row.worker_id) ?? `Worker #${row.worker_id}`,
            existing_rating: existing?.rating ?? null,
            existing_binary_value: existing?.binary_value ?? null,
            new_rating: value.rating,
            new_binary_value: value.binary_value,
          };
        });
      const createCount = createActionRows.filter((r) =>
        r.values.some((v) => v.ref === ra.spec.ref)
      ).length;
      return {
        ref: ra.spec.ref,
        title: ra.title,
        to_create: targetedRows.length - conflicts.length + createCount,
        to_update: body.conflict_policy === "overwrite" ? conflicts.length : 0,
        conflicts_kept: body.conflict_policy === "fill_blanks" ? conflicts.length : 0,
        non_responder_count: nonRespondersFor(ra).length,
        conflicts,
      };
    });

    const preview: ParticipationApplyPreview = {
      success: true,
      dry_run: true,
      rows_skipped: rowsSkipped,
      workers_to_create: createActionRows.length,
      memberships_to_add: valueRows.filter((r) => r.add_to_campaign).length,
      per_assessment: perAssessment,
    };
    return NextResponse.json(preview);
  }

  // ── Real run ────────────────────────────────────────────────────────────────

  // 1. Create new assessments.
  for (const ra of resolved) {
    if (ra.activityId != null || ra.spec.target.mode !== "new") continue;
    const t = ra.spec.target;
    const { data: inserted, error: insErr } = await supabase
      .from("campaign_activities")
      .insert({
        campaign_id: campaignId,
        title: t.title,
        activity_kind: "assessment",
        is_binary: t.is_binary,
        is_custom: true,
        is_perception: t.is_perception ?? false,
        description: t.description ?? null,
        supporter_outcome_value: t.is_binary ? (t.supporter_outcome_value ?? "yes") : null,
        rating_labels: !t.is_binary && t.rating_labels ? t.rating_labels : null,
      })
      .select("activity_id")
      .single();
    if (insErr || !inserted) {
      return NextResponse.json(
        { success: false, error: `Assessment create failed (${ra.title}): ${insErr?.message ?? "no row"}` },
        { status: 500 }
      );
    }
    ra.activityId = inserted.activity_id;
  }

  // 2. Stamp AN linkage for re-syncs (AN mode is single-assessment).
  if (body.an_resource) {
    for (const ra of resolved) {
      if (ra.activityId == null) continue;
      await supabase
        .from("campaign_activities")
        .update({
          an_resource_type: body.an_resource.type,
          an_resource_id: body.an_resource.id,
          an_browser_url: body.an_resource.browser_url ?? null,
          an_last_synced_at: new Date().toISOString(),
        })
        .eq("activity_id", ra.activityId);
    }
  }

  // 3. Create new workers.
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
  const createdIdByKey = new Map(createActionRows.map((r, i) => [r.key, createdWorkerIds[i]]));

  // 3b. Backfill action_network_id on matched workers (never overwrites).
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

  // 4. Campaign membership.
  const membershipIds = [
    ...existingActionRows.filter((r) => r.add_to_campaign).map((r) => r.worker_id),
    ...createActionRows
      .filter((r) => r.add_to_campaign)
      .map((r) => createdIdByKey.get(r.key))
      .filter((v): v is number => v != null),
  ];
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

  // 5. Per assessment: batch row + ratings via the set-based RPC.
  const source = body.source_kind === "an_api" ? "an_sync" : "an_report_import";
  const perAssessment: AssessmentResult[] = [];

  for (const ra of resolved) {
    if (ra.activityId == null) continue;

    const { data: batch, error: batchErr } = await supabase
      .from("participation_import_batches")
      .insert({
        campaign_id: campaignId,
        activity_id: ra.activityId,
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
        { success: false, error: `Batch create failed (${ra.title}): ${batchErr?.message ?? "no row"}` },
        { status: 500 }
      );
    }

    // Rows targeting this assessment, minus fill-blanks conflicts.
    const targeted = existingActionRows
      .map((row) => ({ workerId: row.worker_id, value: row.values.find((v) => v.ref === ra.spec.ref) }))
      .filter((x): x is { workerId: number; value: NonNullable<typeof x.value> } => x.value != null);
    const conflicts = targeted.filter((t) => ra.existing.has(t.workerId));
    const applied =
      body.conflict_policy === "fill_blanks"
        ? targeted.filter((t) => !ra.existing.has(t.workerId))
        : targeted;

    const createdTargeted = createActionRows
      .map((row) => ({
        workerId: createdIdByKey.get(row.key),
        value: row.values.find((v) => v.ref === ra.spec.ref),
      }))
      .filter(
        (x): x is { workerId: number; value: NonNullable<typeof x.value> } =>
          x.workerId != null && x.value != null
      );

    const nonResponderIds = nonRespondersFor(ra);
    const nr = ra.spec.non_responders;

    const ratingRows = [
      ...applied.map((t) => ({
        worker_id: t.workerId,
        rating: t.value.rating,
        binary_value: t.value.binary_value,
        notes: t.value.notes ?? null,
      })),
      ...createdTargeted.map((t) => ({
        worker_id: t.workerId,
        rating: t.value.rating,
        binary_value: t.value.binary_value,
        notes: t.value.notes ?? null,
      })),
      ...nonResponderIds.map((worker_id) => ({
        worker_id,
        rating: nr?.rating ?? null,
        binary_value: nr?.binary_value ?? null,
        notes: null,
      })),
    ];

    let ratingsApplied = 0;
    for (let i = 0; i < ratingRows.length; i += RPC_CHUNK) {
      const chunk = ratingRows.slice(i, i + RPC_CHUNK);
      const { data: appliedCount, error: rpcErr } = await supabase.rpc(
        "apply_participation_import",
        {
          p_activity_id: ra.activityId,
          p_rows: chunk as never,
          p_source: source,
          p_rating_phase: "actual",
          p_actor_id: user.id,
          p_import_batch_id: batch.batch_id,
        }
      );
      if (rpcErr) {
        return NextResponse.json(
          {
            success: false,
            error: `Rating write failed on "${ra.title}" after ${ratingsApplied} rows: ${rpcErr.message}`,
            batch_id: batch.batch_id,
          },
          { status: 500 }
        );
      }
      ratingsApplied += appliedCount ?? chunk.length;
    }

    const rowsUpdated = body.conflict_policy === "overwrite" ? conflicts.length : 0;
    const conflictsKept = body.conflict_policy === "fill_blanks" ? conflicts.length : 0;
    const rowsCreatedCount = ratingsApplied - rowsUpdated - nonResponderIds.length;

    await supabase
      .from("participation_import_batches")
      .update({
        rows_matched: targeted.length,
        rows_created: Math.max(rowsCreatedCount, 0),
        rows_updated: rowsUpdated,
        rows_skipped: rowsSkipped + conflictsKept,
        workers_created: createdWorkerIds.length,
      })
      .eq("batch_id", batch.batch_id);

    perAssessment.push({
      ref: ra.spec.ref,
      activity_id: ra.activityId,
      title: ra.title,
      batch_id: batch.batch_id,
      ratings_applied: ratingsApplied,
      rows_created: Math.max(rowsCreatedCount, 0),
      rows_updated: rowsUpdated,
      conflicts_kept: conflictsKept,
      non_responders_marked: nonResponderIds.length,
    });
  }

  const result: ParticipationApplyResult = {
    success: true,
    dry_run: false,
    rows_skipped: rowsSkipped,
    workers_created: createdWorkerIds.length,
    memberships_added: membershipIds.length,
    per_assessment: perAssessment,
  };
  return NextResponse.json(result);
}
