import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ParticipationApplyPreview,
  ParticipationApplyResult,
  ParticipationConflict,
} from "@/lib/import/participation-import-shared";
import { isLeadershipRoleName } from "@/lib/import/participation-import-shared";
import { toE164 } from "@/lib/phone/normalise-phone";
import { parseFactRawValue } from "@/lib/campaign-facts/values";
import { recordCampaignFactRpc } from "@/lib/campaign-facts/record-fact";

const extraHitSchema = z.object({
  activity_key: z.string().min(1).max(80),
  rating: z.number().int().min(1).max(5).nullable(),
  binary_value: z.string().trim().min(1).max(30).nullable(),
  notes: z.string().max(2000).nullish(),
});

const activitySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), activity_id: z.number().int().positive() }),
  z.object({
    mode: z.literal("new"),
    title: z.string().trim().min(1).max(300),
    is_binary: z.boolean(),
    supporter_outcome_value: z.string().trim().max(30).nullable(),
    description: z.string().max(2000).nullish(),
  }),
]);

const valueFields = {
  rating: z.number().int().min(1).max(5).nullable(),
  binary_value: z.string().trim().min(1).max(30).nullable(),
  notes: z.string().max(2000).nullish(),
  add_to_campaign: z.boolean(),
  an_person_id: z.string().max(100).nullish(),
  extra: z.array(extraHitSchema).max(10).optional(),
  facts: z
    .array(
      z.object({
        field_key: z.string().min(1).max(80),
        raw: z.string().max(4000),
      })
    )
    .max(20)
    .optional(),
  promote_contact: z.boolean().optional(),
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
  activity: activitySchema,
  extra_activities: z
    .array(z.object({ key: z.string().min(1).max(80), activity: activitySchema }))
    .max(10)
    .optional(),
  extra_fields: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        field_id: z.number().int().positive(),
      })
    )
    .max(20)
    .optional(),
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
type ActivitySpec = ApplyBody["activity"];
type RatingValue = { rating: number | null; binary_value: string | null };

const RPC_CHUNK = 1000;

function hasRatingValue(r: RatingValue): boolean {
  return r.rating != null || r.binary_value != null;
}

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

async function loadRatingMap(
  supabase: SupabaseClient,
  activityId: number
): Promise<{ map: Map<number, RatingValue>; error: string | null }> {
  const { data: ratings, error } = await supabase
    .from("campaign_activity_ratings")
    .select("worker_id, rating, binary_value")
    .eq("activity_id", activityId)
    .eq("rating_phase", "actual")
    .is("event_id", null);
  if (error) return { map: new Map(), error: error.message };
  const map = new Map<number, RatingValue>();
  for (const r of ratings ?? []) {
    map.set(r.worker_id, { rating: r.rating, binary_value: r.binary_value });
  }
  return { map, error: null };
}

async function loadLeadershipRoles(supabase: SupabaseClient): Promise<{
  contactId: number | null;
  leadershipIds: Set<number>;
  error: string | null;
}> {
  const { data, error } = await supabase.from("member_role_types").select("role_type_id, role_name");
  if (error) return { contactId: null, leadershipIds: new Set(), error: error.message };
  let contactId: number | null = null;
  const leadershipIds = new Set<number>();
  for (const row of data ?? []) {
    const name = (row.role_name ?? "").trim().toLowerCase();
    if (name === "contact") contactId = row.role_type_id;
    if (isLeadershipRoleName(row.role_name)) leadershipIds.add(row.role_type_id);
  }
  return { contactId, leadershipIds, error: null };
}

async function createAssessment(
  supabase: SupabaseClient,
  campaignId: number,
  spec: Extract<ActivitySpec, { mode: "new" }>
): Promise<{ id: number | null; error: string | null }> {
  const { data: inserted, error } = await supabase
    .from("campaign_activities")
    .insert({
      campaign_id: campaignId,
      title: spec.title,
      activity_kind: "assessment",
      is_binary: spec.is_binary,
      is_custom: true,
      description: spec.description ?? null,
      supporter_outcome_value: spec.is_binary ? (spec.supporter_outcome_value ?? "yes") : null,
    })
    .select("activity_id")
    .single();
  if (error || !inserted) return { id: null, error: error?.message ?? "no row" };
  return { id: inserted.activity_id, error: null };
}

async function writeRatingChunk(
  supabase: SupabaseClient,
  args: {
    activityId: number;
    rows: { worker_id: number; rating: number | null; binary_value: string | null; notes: string | null }[];
    source: string;
    actorId: string;
    batchId: number;
  }
): Promise<{ applied: number; error: string | null }> {
  const writable = args.rows.filter(hasRatingValue);
  let applied = 0;
  for (let i = 0; i < writable.length; i += RPC_CHUNK) {
    const chunk = writable.slice(i, i + RPC_CHUNK);
    const { data, error } = await supabase.rpc("apply_participation_import", {
      p_activity_id: args.activityId,
      p_rows: chunk as never,
      p_source: args.source,
      p_rating_phase: "actual",
      p_actor_id: args.actorId,
      p_import_batch_id: args.batchId,
    });
    if (error) return { applied, error: error.message };
    applied += data ?? chunk.length;
  }
  return { applied, error: null };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return jsonError("Invalid campaign ID", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonError("Unauthorized", 401);
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role === "viewer") {
    return jsonError("Insufficient permissions", 403);
  }

  let body: ApplyBody;
  try {
    body = applySchema.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid request body";
    return jsonError(message, 400);
  }

  const extraActivities = body.extra_activities ?? [];
  const extraFields = body.extra_fields ?? [];
  const extraKeys = new Set(extraActivities.map((e) => e.key));
  if (extraKeys.size !== extraActivities.length) {
    return jsonError("Duplicate extra mapping keys", 400);
  }
  const extraFieldKeys = new Set(extraFields.map((e) => e.key));
  if (extraFieldKeys.size !== extraFields.length) {
    return jsonError("Duplicate extra field keys", 400);
  }

  const valueRows = body.rows.filter(
    (r): r is ValueRow => r.action === "existing" || r.action === "create"
  );

  const wantsCsvExtras =
    extraActivities.length > 0 ||
    extraFields.length > 0 ||
    valueRows.some((r) => (r.extra?.length ?? 0) > 0 || (r.facts?.length ?? 0) > 0 || r.promote_contact);
  if (body.source_kind === "an_api" && wantsCsvExtras) {
    return jsonError(
      "Extra column mappings and Contact promotion are only available on CSV report import",
      400
    );
  }

  for (const row of valueRows) {
    const extras = row.extra ?? [];
    for (const hit of extras) {
      if (!extraKeys.has(hit.activity_key)) {
        return jsonError(`Row ${row.key}: unknown extra mapping ${hit.activity_key}`, 400);
      }
      if (!hasRatingValue(hit)) {
        return jsonError(`Row ${row.key}: extra mapping ${hit.activity_key} needs a rating or binary value`, 400);
      }
    }
    for (const hit of row.facts ?? []) {
      if (!extraFieldKeys.has(hit.field_key)) {
        return jsonError(`Row ${row.key}: unknown extra field mapping ${hit.field_key}`, 400);
      }
    }
    if (!hasRatingValue(row) && extras.length === 0 && !row.promote_contact && (row.facts?.length ?? 0) === 0) {
      return jsonError(
        `Row ${row.key}: needs a rating, a binary value, an extra mapping, a data field, or Contact promotion`,
        400
      );
    }
  }

  const nonResponders = body.non_responders?.enabled ? body.non_responders : null;
  if (nonResponders && !hasRatingValue(nonResponders)) {
    return jsonError("Non-responder marking needs a rating or a binary value", 400);
  }

  // ── Resolve the primary activity (never creates during dry runs) ───────────
  let activityId: number | null = null;
  if (body.activity.mode === "existing") {
    const { data: activity, error: actErr } = await supabase
      .from("campaign_activities")
      .select("activity_id, campaign_id, title")
      .eq("activity_id", body.activity.activity_id)
      .maybeSingle();
    if (actErr || !activity || activity.campaign_id !== campaignId) {
      return jsonError("Assessment not found for this campaign", 400);
    }
    activityId = activity.activity_id;
  }

  type ExtraResolved = {
    key: string;
    spec: ActivitySpec;
    activityId: number | null;
    title: string;
    existingByWorker: Map<number, RatingValue>;
  };
  const extraResolved: ExtraResolved[] = [];
  const extraExistingIds = new Set<number>();
  for (const extra of extraActivities) {
    if (extra.activity.mode === "existing") {
      if (activityId != null && extra.activity.activity_id === activityId) {
        return jsonError("Extra mappings cannot target the same assessment as the participation import", 400);
      }
      if (extraExistingIds.has(extra.activity.activity_id)) {
        return jsonError("Two extra mappings target the same assessment", 400);
      }
      extraExistingIds.add(extra.activity.activity_id);
      const { data: activity, error: actErr } = await supabase
        .from("campaign_activities")
        .select("activity_id, campaign_id, title")
        .eq("activity_id", extra.activity.activity_id)
        .maybeSingle();
      if (actErr || !activity || activity.campaign_id !== campaignId) {
        return jsonError(`Extra assessment not found for this campaign (${extra.key})`, 400);
      }
      const { map, error: mapErr } = await loadRatingMap(supabase, activity.activity_id);
      if (mapErr) return jsonError(`Rating lookup failed: ${mapErr}`, 500);
      extraResolved.push({
        key: extra.key,
        spec: extra.activity,
        activityId: activity.activity_id,
        title: activity.title,
        existingByWorker: map,
      });
    } else {
      extraResolved.push({
        key: extra.key,
        spec: extra.activity,
        activityId: null,
        title: extra.activity.title,
        existingByWorker: new Map(),
      });
    }
  }

  const { map: existingByWorker, error: primaryMapErr } =
    activityId != null
      ? await loadRatingMap(supabase, activityId)
      : { map: new Map<number, RatingValue>(), error: null };
  if (primaryMapErr) return jsonError(`Rating lookup failed: ${primaryMapErr}`, 500);

  const existingActionRows = valueRows.filter((r) => r.action === "existing") as Extract<
    ValueRow,
    { action: "existing" }
  >[];
  const createActionRows = valueRows.filter((r) => r.action === "create") as Extract<
    ValueRow,
    { action: "create" }
  >[];

  const primaryWriteExisting = existingActionRows.filter(hasRatingValue);
  const conflictRows = primaryWriteExisting.filter((r) => existingByWorker.has(r.worker_id));
  const skippedConflicts = body.conflict_policy === "fill_blanks" ? conflictRows : [];
  const skippedConflictKeys = new Set(skippedConflicts.map((r) => r.key));
  const appliedExistingRows = primaryWriteExisting.filter((r) => !skippedConflictKeys.has(r.key));

  let nonResponderIds: number[] = [];
  if (nonResponders) {
    const { data: members, error: memErr } = await supabase
      .from("campaign_worker_membership")
      .select("worker_id")
      .eq("campaign_id", campaignId);
    if (memErr) return jsonError(`Membership lookup failed: ${memErr.message}`, 500);
    const targeted = new Set(existingActionRows.map((r) => r.worker_id));
    nonResponderIds = (members ?? [])
      .map((m) => m.worker_id)
      .filter((wid) => !targeted.has(wid) && !existingByWorker.has(wid));
  }

  const wantsContact = valueRows.some((r) => r.promote_contact);
  let contactId: number | null = null;
  let leadershipIds = new Set<number>();
  if (wantsContact) {
    const roles = await loadLeadershipRoles(supabase);
    if (roles.error) return jsonError(`Role lookup failed: ${roles.error}`, 500);
    if (roles.contactId == null) {
      return jsonError("Contact union role is not configured (member_role_types.contact is missing)", 400);
    }
    contactId = roles.contactId;
    leadershipIds = roles.leadershipIds;
  }

  const promoteExistingIds = existingActionRows
    .filter((r) => r.promote_contact)
    .map((r) => r.worker_id);
  let contactsAlreadyLeader = 0;
  let contactsToPromote = createActionRows.filter((r) => r.promote_contact).length;
  if (promoteExistingIds.length > 0) {
    const { data: currentRoles, error: roleErr } = await supabase
      .from("workers")
      .select("worker_id, member_role_type_id")
      .in("worker_id", promoteExistingIds);
    if (roleErr) return jsonError(`Worker role lookup failed: ${roleErr.message}`, 500);
    for (const w of currentRoles ?? []) {
      if (w.member_role_type_id != null && leadershipIds.has(w.member_role_type_id)) {
        contactsAlreadyLeader += 1;
      } else {
        contactsToPromote += 1;
      }
    }
  }

  // Extra rating preview counts (existing workers only; creates always count as new).
  let extraToCreate = 0;
  let extraToUpdate = 0;
  const extraConflicts: ParticipationConflict[] = [];
  const extraConflictWorkerIds: number[] = [];
  for (const extra of extraResolved) {
    for (const row of existingActionRows) {
      const hit = (row.extra ?? []).find((e) => e.activity_key === extra.key);
      if (!hit) continue;
      const existing = extra.existingByWorker.get(row.worker_id);
      if (existing) {
        extraConflicts.push({
          key: `${row.key}:${extra.key}`,
          worker_id: row.worker_id,
          worker_name: "",
          existing_rating: existing.rating,
          existing_binary_value: existing.binary_value,
          new_rating: hit.rating,
          new_binary_value: hit.binary_value,
          activity_label: extra.title,
        });
        extraConflictWorkerIds.push(row.worker_id);
        if (body.conflict_policy === "overwrite") extraToUpdate += 1;
      } else {
        extraToCreate += 1;
      }
    }
    extraToCreate += createActionRows.filter((r) =>
      (r.extra ?? []).some((e) => e.activity_key === extra.key)
    ).length;
  }

  if (body.dry_run) {
    let conflicts: ParticipationConflict[] = [];
    const nameIds = [...new Set([...conflictRows.map((r) => r.worker_id), ...extraConflictWorkerIds])];
    const nameById = new Map<number, string>();
    if (nameIds.length > 0) {
      const { data: names } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name")
        .in("worker_id", nameIds);
      for (const w of names ?? []) {
        nameById.set(w.worker_id, `${w.first_name} ${w.last_name}`);
      }
    }
    if (conflictRows.length > 0) {
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
    for (const c of extraConflicts) {
      c.worker_name = nameById.get(c.worker_id) ?? `Worker #${c.worker_id}`;
    }

    const preview: ParticipationApplyPreview = {
      success: true,
      dry_run: true,
      to_create:
        appliedExistingRows.filter((r) => !existingByWorker.has(r.worker_id)).length +
        createActionRows.filter(hasRatingValue).length,
      to_update: body.conflict_policy === "overwrite" ? conflictRows.length : 0,
      to_skip: body.rows.filter((r) => r.action === "skip").length + skippedConflicts.length,
      workers_to_create: createActionRows.length,
      memberships_to_add: valueRows.filter((r) => r.add_to_campaign).length,
      non_responder_count: nonResponderIds.length,
      conflicts,
      extra_ratings_to_create: extraToCreate,
      extra_ratings_to_update: extraToUpdate,
      extra_conflicts: extraConflicts,
      extra_facts_to_write: valueRows.reduce((n, r) => n + (r.facts?.length ?? 0), 0),
      contacts_to_promote: contactsToPromote,
      contacts_already_leader: contactsAlreadyLeader,
    };
    return NextResponse.json(preview);
  }

  // ── Real run ────────────────────────────────────────────────────────────────

  if (body.activity.mode === "new") {
    const created = await createAssessment(supabase, campaignId, body.activity);
    if (created.id == null) return jsonError(`Assessment create failed: ${created.error}`, 500);
    activityId = created.id;
  }
  if (activityId == null) return jsonError("No target assessment", 500);

  const extraActivityIds: number[] = [];
  for (const extra of extraResolved) {
    if (extra.activityId == null) {
      if (extra.spec.mode !== "new") return jsonError("Extra assessment missing id", 500);
      const created = await createAssessment(supabase, campaignId, extra.spec);
      if (created.id == null) {
        return jsonError(`Extra assessment create failed (${extra.key}): ${created.error}`, 500);
      }
      extra.activityId = created.id;
    }
    extraActivityIds.push(extra.activityId);
  }

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
    return jsonError(`Batch create failed: ${batchErr?.message ?? "no row"}`, 500);
  }
  const batchId = batch.batch_id;

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
          phone_e164: toE164(r.new_worker.phone),
          sms_consent_source: r.new_worker.phone ? "import" : null,
          action_network_id: r.an_person_id ?? null,
          is_active: true,
        }))
      )
      .select("worker_id");
    if (createErr || !created || created.length !== createActionRows.length) {
      return jsonError(`Worker create failed: ${createErr?.message ?? "row count mismatch"}`, 500);
    }
    for (const w of created) createdWorkerIds.push(w.worker_id);
  }

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

  const membershipIds = [
    ...existingActionRows.filter((r) => r.add_to_campaign).map((r) => r.worker_id),
    ...createActionRows.map((r, i) => (r.add_to_campaign ? createdWorkerIds[i] : null)),
  ].filter((v): v is number => v != null);
  if (membershipIds.length > 0) {
    const { error: memErr } = await supabase.from("campaign_worker_membership").upsert(
      membershipIds.map((worker_id) => ({ campaign_id: campaignId, worker_id })),
      { onConflict: "campaign_id,worker_id", ignoreDuplicates: true }
    );
    if (memErr) return jsonError(`Membership insert failed: ${memErr.message}`, 500);
  }

  const source = body.source_kind === "an_api" ? "an_sync" : "an_report_import";
  const primaryFromCreates = createActionRows.flatMap((r, i) =>
    hasRatingValue(r)
      ? [
          {
            worker_id: createdWorkerIds[i],
            rating: r.rating,
            binary_value: r.binary_value,
            notes: r.notes ?? null,
          },
        ]
      : []
  );
  const primaryRatingRows = [
    ...appliedExistingRows.map((r) => ({
      worker_id: r.worker_id,
      rating: r.rating,
      binary_value: r.binary_value,
      notes: r.notes ?? null,
    })),
    ...primaryFromCreates,
    ...nonResponderIds.map((worker_id) => ({
      worker_id,
      rating: nonResponders?.rating ?? null,
      binary_value: nonResponders?.binary_value ?? null,
      notes: null,
    })),
  ];

  const written = await writeRatingChunk(supabase, {
    activityId,
    rows: primaryRatingRows,
    source,
    actorId: user.id,
    batchId,
  });
  if (written.error) {
    return jsonError(`Rating write failed after ${written.applied} rows: ${written.error}`, 500, {
      batch_id: batchId,
    });
  }
  const ratingsApplied = written.applied;

  let extraRatingsApplied = 0;
  for (const extra of extraResolved) {
    if (extra.activityId == null) continue;
    const extraRows: {
      worker_id: number;
      rating: number | null;
      binary_value: string | null;
      notes: string | null;
    }[] = [];
    for (const row of existingActionRows) {
      const hit = (row.extra ?? []).find((e) => e.activity_key === extra.key);
      if (!hit) continue;
      if (body.conflict_policy === "fill_blanks" && extra.existingByWorker.has(row.worker_id)) {
        continue;
      }
      extraRows.push({
        worker_id: row.worker_id,
        rating: hit.rating,
        binary_value: hit.binary_value,
        notes: hit.notes ?? null,
      });
    }
    for (let i = 0; i < createActionRows.length; i++) {
      const hit = (createActionRows[i].extra ?? []).find((e) => e.activity_key === extra.key);
      if (!hit) continue;
      extraRows.push({
        worker_id: createdWorkerIds[i],
        rating: hit.rating,
        binary_value: hit.binary_value,
        notes: hit.notes ?? null,
      });
    }
    const extraWritten = await writeRatingChunk(supabase, {
      activityId: extra.activityId,
      rows: extraRows,
      source,
      actorId: user.id,
      batchId,
    });
    if (extraWritten.error) {
      return jsonError(
        `Extra rating write failed (${extra.title}) after ${extraRatingsApplied} rows: ${extraWritten.error}`,
        500,
        { batch_id: batchId }
      );
    }
    extraRatingsApplied += extraWritten.applied;
  }

  let extraFactsApplied = 0;
  if (extraFields.length > 0) {
    const { data: fieldRows, error: fieldErr } = await supabase
      .from("campaign_data_fields")
      .select("*")
      .eq("campaign_id", campaignId)
      .in(
        "field_id",
        extraFields.map((f) => f.field_id)
      );
    if (fieldErr) {
      return jsonError(`Data field lookup failed: ${fieldErr.message}`, 500, { batch_id: batchId });
    }
    const fieldById = new Map((fieldRows ?? []).map((f) => [f.field_id, f]));
    for (const extra of extraFields) {
      if (!fieldById.has(extra.field_id)) {
        return jsonError(
          `Data field ${extra.field_id} is missing or not on this campaign`,
          400,
          { batch_id: batchId }
        );
      }
    }
    const fieldIdByKey = new Map(extraFields.map((f) => [f.key, f.field_id]));
    const writeFactsFor = async (workerId: number, hits: { field_key: string; raw: string }[]) => {
      for (const hit of hits) {
        const fieldId = fieldIdByKey.get(hit.field_key);
        if (fieldId == null) continue;
        const field = fieldById.get(fieldId);
        if (!field) continue;
        const parsed = parseFactRawValue(field, hit.raw);
        if (parsed.kind === "empty" || parsed.kind === "invalid") continue;
        try {
          await recordCampaignFactRpc(supabase, {
            fieldId,
            workerId,
            campaignId,
            parsed,
            source: "an_csv",
            sourceRef: `participation_import:${batchId}`,
            actorId: user.id,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Data field write failed (${field.label}): ${message}`);
        }
        extraFactsApplied += 1;
      }
    };
    try {
      for (const row of existingActionRows) {
        await writeFactsFor(row.worker_id, row.facts ?? []);
      }
      for (let i = 0; i < createActionRows.length; i++) {
        await writeFactsFor(createdWorkerIds[i], createActionRows[i].facts ?? []);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonError(message, 500, { batch_id: batchId });
    }
  }

  let contactsPromoted = 0;
  if (wantsContact && contactId != null) {
    const promoteIds = [
      ...existingActionRows.filter((r) => r.promote_contact).map((r) => r.worker_id),
      ...createActionRows.flatMap((r, i) => (r.promote_contact ? [createdWorkerIds[i]] : [])),
    ];
    if (promoteIds.length > 0) {
      const { data: currentRoles, error: roleErr } = await supabase
        .from("workers")
        .select("worker_id, member_role_type_id")
        .in("worker_id", promoteIds);
      if (roleErr) {
        return jsonError(`Worker role lookup failed: ${roleErr.message}`, 500, { batch_id: batchId });
      }
      const eligible = (currentRoles ?? [])
        .filter((w) => w.member_role_type_id == null || !leadershipIds.has(w.member_role_type_id))
        .map((w) => w.worker_id);
      contactsAlreadyLeader = (currentRoles ?? []).length - eligible.length;
      if (eligible.length > 0) {
        const { data: updated, error: updErr } = await supabase
          .from("workers")
          .update({ member_role_type_id: contactId, updated_at: new Date().toISOString() })
          .in("worker_id", eligible)
          .select("worker_id");
        if (updErr) {
          return jsonError(`Contact promotion failed: ${updErr.message}`, 500, { batch_id: batchId });
        }
        contactsPromoted = updated?.length ?? 0;
      }
    }
  }

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
    extra_activity_ids: extraActivityIds,
    ratings_applied: ratingsApplied,
    extra_ratings_applied: extraRatingsApplied,
    extra_facts_applied: extraFactsApplied,
    rows_created: Math.max(rowsCreatedCount, 0),
    rows_updated: rowsUpdated,
    rows_skipped: rowsSkipped,
    workers_created: createdWorkerIds.length,
    memberships_added: membershipIds.length,
    non_responders_marked: nonResponderIds.length,
    contacts_promoted: contactsPromoted,
    contacts_already_leader: contactsAlreadyLeader,
  };
  return NextResponse.json(result);
}
