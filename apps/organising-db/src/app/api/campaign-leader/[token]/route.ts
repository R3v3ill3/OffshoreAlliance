/**
 * GET / POST /api/campaign-leader/[token]
 *
 * The unauthenticated leader endpoint. Phase 2 added the password-gate
 * (`requireSession`); Phase 4 extends both the GET payload (worker editing,
 * membership, option pickers) and the POST handler (worker_edits,
 * membership_changes, existing_added, plus per-rating provenance override).
 *
 * The route still uses the service-role admin client and enforces auth via
 * the leader session cookie set by `/api/campaign-leader/[token]/auth`.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLeaderToken } from "@/lib/campaign/token-crypto";
import { leaderSubmitBodySchema } from "@/lib/validation/campaign-leader";
import {
  cookieNameFromToken,
  verifyLeaderSession,
} from "@/lib/campaign/leader-session";

type TokenRow = {
  token_id: number;
  task_list_id: number;
  expires_at: string | null;
  revoked_at: string | null;
  locked_until: string | null;
};

type ResolveTokenOutcome =
  | { kind: "ok"; row: TokenRow }
  | { kind: "not_found" }
  | { kind: "revoked" }
  | { kind: "expired" }
  | { kind: "locked"; locked_until: string };

async function resolveTokenRow(
  admin: ReturnType<typeof createAdminClient>,
  rawToken: string,
): Promise<ResolveTokenOutcome> {
  const token_hash = hashLeaderToken(rawToken);
  const { data: row, error } = await admin
    .from("campaign_leader_tokens")
    .select("token_id, task_list_id, expires_at, revoked_at, locked_until")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (error || !row) return { kind: "not_found" };
  if (row.revoked_at) return { kind: "revoked" };
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { kind: "expired" };
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    return { kind: "locked", locked_until: row.locked_until };
  }
  return { kind: "ok", row: row as TokenRow };
}

function tokenStatusResponse(outcome: ResolveTokenOutcome): NextResponse | null {
  if (outcome.kind === "ok") return null;
  if (outcome.kind === "not_found") {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }
  if (outcome.kind === "revoked") {
    return NextResponse.json({ error: "Link revoked" }, { status: 410 });
  }
  if (outcome.kind === "expired") {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }
  if (outcome.kind === "locked") {
    return NextResponse.json(
      { error: "Locked", locked_until: outcome.locked_until },
      { status: 423 },
    );
  }
  return NextResponse.json({ error: "Unknown" }, { status: 500 });
}

/**
 * Returns the verified session payload, or `null` if the cookie is missing /
 * invalid / not bound to this token.
 */
function requireSession(
  request: NextRequest,
  urlToken: string,
  tokenRow: TokenRow,
): { tokenId: number } | null {
  const cookieName = cookieNameFromToken(urlToken);
  const cookie = request.cookies.get(cookieName);
  const verified = verifyLeaderSession(urlToken, cookie?.value);
  if (!verified) return null;
  if (verified.tokenId !== tokenRow.token_id) return null;
  return verified;
}

/**
 * Membership transitions allowed via the leader form. Single source of truth
 * (the brief calls these out in section 10). Server-side re-validates the
 * worker's current `from_type` against this whitelist before applying.
 */
const ALLOWED_MEMBERSHIP_TRANSITIONS: Record<string, ReadonlyArray<"member_pending" | "non_oa_member">> = {
  non_member: ["member_pending", "non_oa_member"],
  non_oa_member: ["member_pending"],
};

// ──────────────────────────────────────────────────────────────────────
// GET — payload shape (Phase 4)
// ──────────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const admin = createAdminClient();
    const outcome = await resolveTokenRow(admin, rawToken);
    const errResp = tokenStatusResponse(outcome);
    if (errResp || outcome.kind !== "ok") return errResp!;
    const tokenRow = outcome.row;

    const session = requireSession(request, rawToken, tokenRow);
    if (!session) {
      // Minimal context for the password gate header.
      const { data: tl } = await admin
        .from("campaign_task_lists")
        .select(
          `task_list_id, title, leader_worker_id,
           campaign:campaigns(name),
           activity:campaign_activities(title)`,
        )
        .eq("task_list_id", tokenRow.task_list_id)
        .maybeSingle();

      let leader_name: string | null = null;
      if (tl?.leader_worker_id) {
        const { data: leaderRow } = await admin
          .from("workers")
          .select("first_name, last_name")
          .eq("worker_id", tl.leader_worker_id)
          .maybeSingle();
        if (leaderRow) {
          const parts = [leaderRow.first_name, leaderRow.last_name].filter(Boolean);
          leader_name = parts.length ? parts.join(" ") : null;
        }
      }

      const campaign_name = (() => {
        const c = tl?.campaign as unknown;
        const row = Array.isArray(c) ? c[0] : c;
        return (row as { name?: string } | null)?.name ?? null;
      })();
      const activity_title = (() => {
        const a = tl?.activity as unknown;
        const row = Array.isArray(a) ? a[0] : a;
        return (row as { title?: string } | null)?.title ?? null;
      })();

      return NextResponse.json(
        {
          requires_password: true,
          campaign_name,
          activity_title,
          leader_name,
          task_list_title: tl?.title ?? null,
        },
        { status: 401 },
      );
    }

    const { data: taskList, error: tlErr } = await admin
      .from("campaign_task_lists")
      .select(
        `task_list_id, title, campaign_id, activity_id, leader_worker_id,
         include_membership_ask, leader_instructions,
         campaign:campaigns(campaign_id, name),
         activity:campaign_activities(activity_id, title, is_binary, supporter_outcome_value, assessment_type, rating_labels)`,
      )
      .eq("task_list_id", tokenRow.task_list_id)
      .single();

    if (tlErr || !taskList) {
      return NextResponse.json({ error: "Task list not found" }, { status: 404 });
    }

    const activityId = taskList.activity_id as number | null;
    const campaignId = taskList.campaign_id as number;

    // Items + workers (including the editable dimension fields)
    const { data: items, error: itemsErr } = await admin
      .from("campaign_task_list_items")
      .select("worker_id, sort_order")
      .eq("task_list_id", tokenRow.task_list_id)
      .order("sort_order", { ascending: true });

    if (itemsErr) throw itemsErr;

    const workerIds = (items ?? [])
      .map((i) => i.worker_id)
      .filter((id): id is number => id != null);

    type WorkerRow = {
      worker_id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      occupation: string | null;
      worksite_id: number | null;
      shift_id: number | null;
      work_area_id: number | null;
      roster_panel_id: number | null;
      union_membership_type_id: number | null;
      employer_id: number | null;
      worksite: { worksite_name: string | null } | { worksite_name: string | null }[] | null;
      shift: { name: string | null } | { name: string | null }[] | null;
      work_area: { name: string | null } | { name: string | null }[] | null;
      roster_panel: { name: string | null } | { name: string | null }[] | null;
      union_membership_type: { type_name: string | null; display_name: string | null }
        | { type_name: string | null; display_name: string | null }[]
        | null;
    };

    let workers: WorkerRow[] = [];
    if (workerIds.length > 0) {
      const { data: wRows, error: wErr } = await admin
        .from("workers")
        .select(
          `worker_id, first_name, last_name, email, phone, occupation,
           worksite_id, shift_id, work_area_id, roster_panel_id,
           union_membership_type_id, employer_id,
           worksite:worksites(worksite_name),
           shift:worker_shift_options!shift_id(name),
           work_area:worker_work_area_options!work_area_id(name),
           roster_panel:worker_roster_panel_options!roster_panel_id(name),
           union_membership_type:union_membership_types(type_name, display_name)`,
        )
        .in("worker_id", workerIds);
      if (wErr) throw wErr;
      workers = (wRows ?? []) as unknown as WorkerRow[];
    }

    // Existing ratings (only when the activity is set)
    type ExistingRating = {
      rating: number | null;
      binary_value: string | null;
      notes: string | null;
    };
    const ratingByWorker = new Map<number, ExistingRating>();
    if (activityId != null && workerIds.length > 0) {
      const { data: ratings, error: rErr } = await admin
        .from("campaign_activity_ratings")
        .select("worker_id, rating, binary_value, notes, rating_phase")
        .eq("activity_id", activityId)
        .in("worker_id", workerIds);
      if (rErr) throw rErr;
      // If multiple rows exist (different phases), prefer 'actual' over 'expected'.
      for (const r of ratings ?? []) {
        const existing = ratingByWorker.get(r.worker_id);
        if (!existing || r.rating_phase === "actual") {
          ratingByWorker.set(r.worker_id, {
            rating: r.rating,
            binary_value: r.binary_value,
            notes: r.notes,
          });
        }
      }
    }

    function unwrap<T>(x: T | T[] | null): T | null {
      if (x == null) return null;
      if (Array.isArray(x)) return (x[0] as T) ?? null;
      return x;
    }

    const orderedWorkers = workerIds
      .map((wid) => {
        const w = workers.find((x) => x.worker_id === wid);
        if (!w) return null;
        const r = ratingByWorker.get(wid);
        const ws = unwrap(w.worksite);
        const sh = unwrap(w.shift);
        const wa = unwrap(w.work_area);
        const rp = unwrap(w.roster_panel);
        const um = unwrap(w.union_membership_type);
        return {
          worker_id: w.worker_id,
          first_name: w.first_name,
          last_name: w.last_name,
          email: w.email,
          phone: w.phone,
          occupation: w.occupation,
          worksite_id: w.worksite_id,
          worksite_name: ws?.worksite_name ?? null,
          shift_id: w.shift_id,
          shift_name: sh?.name ?? null,
          work_area_id: w.work_area_id,
          work_area_name: wa?.name ?? null,
          roster_panel_id: w.roster_panel_id,
          roster_panel_name: rp?.name ?? null,
          union_membership_type_id: w.union_membership_type_id,
          union_membership_type_name: um?.display_name ?? null,
          union_membership_type_key: um?.type_name ?? null,
          employer_id: w.employer_id,
          existing_rating: r?.rating ?? null,
          binary_value: r?.binary_value ?? null,
          notes: r?.notes ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    // Option pickers — return ALL options (UI may filter by employer/worksite
    // client-side using each option row's optional employer_id / worksite_id).
    // The leader webform doesn't have access to a campaign-scoped restriction
    // so showing the global list is the most flexible default.
    const [
      { data: shiftOpts },
      { data: workAreaOpts },
      { data: rosterPanelOpts },
      { data: worksiteOpts },
      { data: nonOaUnionOpts },
    ] = await Promise.all([
      admin
        .from("worker_shift_options")
        .select("id, name, employer_id, worksite_id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      admin
        .from("worker_work_area_options")
        .select("id, name, employer_id, worksite_id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      admin
        .from("worker_roster_panel_options")
        .select("id, name, employer_id, worksite_id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      admin
        .from("worksites")
        .select("worksite_id, worksite_name")
        .eq("is_active", true)
        .order("worksite_name", { ascending: true }),
      // For the membership "Member of another union" picker. Source list is
      // `non_oa_union_options` (catalog of badge initials + display names),
      // exposed via the FK column `workers.non_oa_union_option_id`. The brief
      // mentions `unions` table — that's a different (broader) entity; we use
      // the dedicated catalog because workers reference it directly.
      admin
        .from("non_oa_union_options")
        .select("non_oa_union_option_id, display_name, badge_initials")
        .order("sort_order", { ascending: true })
        .order("display_name", { ascending: true }),
    ]);

    await admin
      .from("campaign_leader_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_id", tokenRow.token_id);

    await admin.from("campaign_leader_form_events").insert({
      token_id: tokenRow.token_id,
      event_type: "opened",
    });

    const rawAct = taskList.activity;
    const activityRow = Array.isArray(rawAct) ? rawAct[0] : rawAct;
    const activity = activityRow as {
      activity_id: number;
      title: string;
      is_binary: boolean;
      supporter_outcome_value: string | null;
      assessment_type: string | null;
      rating_labels: Record<string, string> | null;
    } | null;
    const rawCamp = taskList.campaign;
    const campaignRow = Array.isArray(rawCamp) ? rawCamp[0] : rawCamp;
    const campaign = campaignRow as { campaign_id: number; name: string } | null;

    return NextResponse.json({
      campaign: campaign ?? { campaign_id: campaignId, name: "" },
      task_list: {
        task_list_id: taskList.task_list_id,
        title: taskList.title,
        include_membership_ask: !!taskList.include_membership_ask,
        leader_worker_id: taskList.leader_worker_id ?? null,
        leader_instructions: (taskList as { leader_instructions?: string | null }).leader_instructions ?? null,
      },
      activity: activity
        ? {
            activity_id: activity.activity_id,
            title: activity.title,
            is_binary: !!activity.is_binary,
            supporter_outcome_value: activity.supporter_outcome_value,
            assessment_type: activity.assessment_type,
            rating_labels: activity.rating_labels ?? null,
          }
        : null,
      workers: orderedWorkers,
      membership_options: {
        // The brief used "unions" as a label — this list is sourced from the
        // dedicated `non_oa_union_options` catalog (the same table that
        // backs `workers.non_oa_union_option_id`). Each entry's id is what
        // the client must send back as `non_oa_union_id`.
        unions: (nonOaUnionOpts ?? []).map((u) => ({
          union_id: u.non_oa_union_option_id,
          name: u.display_name,
          badge: u.badge_initials,
        })),
        allowed_transitions: ALLOWED_MEMBERSHIP_TRANSITIONS,
      },
      shift_options: shiftOpts ?? [],
      work_area_options: workAreaOpts ?? [],
      roster_panel_options: rosterPanelOpts ?? [],
      worksite_options: worksiteOpts ?? [],
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Missing NEXT_PUBLIC_SUPABASE_URL")) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to load task list" }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────────────
// POST — process ratings, edits, membership changes, additions
// ──────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const json = await request.json();
    const parsed = leaderSubmitBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createAdminClient();
    const outcome = await resolveTokenRow(admin, rawToken);
    const errResp = tokenStatusResponse(outcome);
    if (errResp || outcome.kind !== "ok") return errResp!;
    const tokenRow = outcome.row;

    const session = requireSession(request, rawToken, tokenRow);
    if (!session) {
      return NextResponse.json({ requires_password: true }, { status: 401 });
    }

    const { data: taskList, error: tlErr } = await admin
      .from("campaign_task_lists")
      .select("task_list_id, campaign_id, activity_id, leader_worker_id")
      .eq("task_list_id", tokenRow.task_list_id)
      .single();

    if (tlErr || !taskList) {
      return NextResponse.json({ error: "Task list not found" }, { status: 404 });
    }

    const activityId = taskList.activity_id as number | null;
    const campaignId = taskList.campaign_id as number;
    const leaderWorkerId = taskList.leader_worker_id as number | null;

    const { data: items } = await admin
      .from("campaign_task_list_items")
      .select("worker_id")
      .eq("task_list_id", tokenRow.task_list_id);

    const allowedIds = new Set<number>();
    for (const i of items ?? []) {
      if (i.worker_id != null) allowedIds.add(i.worker_id as number);
    }

    const now = new Date().toISOString();

    type SectionResult = { saved: number; errors: string[] };
    const result = {
      ratings: { saved: 0, errors: [] as string[] } as SectionResult,
      worker_edits: { saved: 0, errors: [] as string[] } as SectionResult,
      membership_changes: { saved: 0, errors: [] as string[] } as SectionResult,
      existing_added: { saved: 0, errors: [] as string[] } as SectionResult,
      prospective: { saved: 0, errors: [] as string[] } as SectionResult,
      removed_workers: { saved: 0, errors: [] as string[] } as SectionResult,
    };

    // ── Ratings ───────────────────────────────────────────────────────
    if (parsed.data.ratings.length > 0) {
      if (activityId == null) {
        result.ratings.errors.push(
          "task list has no activity — ratings cannot be saved",
        );
      } else {
        for (const row of parsed.data.ratings) {
          if (!allowedIds.has(row.worker_id)) {
            result.ratings.errors.push(
              `worker ${row.worker_id} not on this task list`,
            );
            continue;
          }
          try {
            // Try the central RPC first (preferred path — Phase 1 progress
            // notes call this out as the canonical writer). The RPC's
            // signature does NOT accept `assessment_type_override`, so we
            // patch it with a follow-up UPDATE.
            const { error: rpcErr } = await admin.rpc("record_assessment_event", {
              p_activity_id: activityId,
              p_worker_id: row.worker_id,
              p_rating: row.rating,
              p_binary_value: row.binary_value ?? null,
              p_rating_phase: "actual",
              p_event_id: null,
              p_source: "leader_form",
              p_notes: row.notes ?? null,
              p_actor_id: null,
            });
            if (rpcErr) {
              // Fall back to direct upsert for resilience (covers the case
              // where the RPC has been altered or temporarily unavailable).
              const { error: upErr } = await admin
                .from("campaign_activity_ratings")
                .upsert(
                  {
                    activity_id: activityId,
                    worker_id: row.worker_id,
                    rating: row.rating,
                    binary_value: row.binary_value ?? null,
                    notes: row.notes ?? null,
                    source: "leader_form",
                    rated_at: now,
                    rated_by_user_id: null,
                    rating_phase: "actual",
                    event_id: null,
                    assessment_type_override: "activist_assessed",
                  },
                  {
                    onConflict: "activity_id,worker_id,rating_phase,event_id",
                  },
                );
              if (upErr) throw upErr;
            } else {
              // RPC succeeded — patch the override column. Because the RPC
              // wrote with rating_phase='actual' / event_id=NULL we can use
              // those keys to find the row.
              const { error: ovErr } = await admin
                .from("campaign_activity_ratings")
                .update({ assessment_type_override: "activist_assessed" })
                .eq("activity_id", activityId)
                .eq("worker_id", row.worker_id)
                .eq("rating_phase", "actual")
                .is("event_id", null);
              if (ovErr) {
                console.warn("assessment_type_override patch failed", ovErr);
              }
            }
            await admin.from("campaign_leader_form_events").insert({
              token_id: tokenRow.token_id,
              event_type: "rating_saved",
              worker_id: row.worker_id,
              payload: {
                rating: row.rating,
                binary_value: row.binary_value ?? null,
              },
            });
            result.ratings.saved++;
          } catch (e) {
            result.ratings.errors.push(
              `worker ${row.worker_id}: ${e instanceof Error ? e.message : "unknown"}`,
            );
          }
        }
      }
    }

    // ── Worker edits ──────────────────────────────────────────────────
    for (const edit of parsed.data.worker_edits) {
      if (!allowedIds.has(edit.worker_id)) {
        result.worker_edits.errors.push(
          `worker ${edit.worker_id} not on this task list`,
        );
        continue;
      }
      try {
        // Build a clean patch: omit undefined keys, normalise empty email to null.
        const patch: Record<string, unknown> = {};
        const p = edit.patch;
        if (p.worksite_id !== undefined) patch.worksite_id = p.worksite_id;
        if (p.shift_id !== undefined) patch.shift_id = p.shift_id;
        if (p.work_area_id !== undefined) patch.work_area_id = p.work_area_id;
        if (p.roster_panel_id !== undefined) patch.roster_panel_id = p.roster_panel_id;
        if (p.occupation !== undefined) {
          const occ = p.occupation == null ? null : p.occupation.trim();
          patch.occupation = occ && occ.length > 0 ? occ : null;
        }
        if (p.phone !== undefined) {
          const ph = p.phone == null ? null : p.phone.trim();
          patch.phone = ph && ph.length > 0 ? ph : null;
        }
        if (p.email !== undefined) {
          const em = p.email == null ? null : p.email.trim();
          patch.email = em && em.length > 0 ? em : null;
        }

        if (Object.keys(patch).length === 0) {
          continue;
        }

        const { error: uErr } = await admin
          .from("workers")
          .update(patch)
          .eq("worker_id", edit.worker_id);
        if (uErr) throw uErr;

        await admin.from("campaign_leader_form_events").insert({
          token_id: tokenRow.token_id,
          event_type: "worker_edited",
          worker_id: edit.worker_id,
          payload: { patch },
        });
        result.worker_edits.saved++;
      } catch (e) {
        result.worker_edits.errors.push(
          `worker ${edit.worker_id}: ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    }

    // ── Membership changes ────────────────────────────────────────────
    if (parsed.data.membership_changes.length > 0) {
      // Resolve the union_membership_types lookup once.
      const { data: umtRows } = await admin
        .from("union_membership_types")
        .select("union_membership_type_id, type_name");
      const umtByName = new Map<string, number>();
      const umtById = new Map<number, string>();
      for (const r of umtRows ?? []) {
        if (r.type_name) {
          umtByName.set(r.type_name, r.union_membership_type_id);
          umtById.set(r.union_membership_type_id, r.type_name);
        }
      }

      for (const change of parsed.data.membership_changes) {
        if (!allowedIds.has(change.worker_id)) {
          result.membership_changes.errors.push(
            `worker ${change.worker_id} not on this task list`,
          );
          continue;
        }
        try {
          const { data: w, error: wErr } = await admin
            .from("workers")
            .select("worker_id, union_membership_type_id")
            .eq("worker_id", change.worker_id)
            .maybeSingle();
          if (wErr || !w) throw wErr ?? new Error("worker not found");

          const fromName = w.union_membership_type_id
            ? umtById.get(w.union_membership_type_id) ?? null
            : null;
          const fromKey = fromName ?? "non_member"; // NULL is treated as non-member.
          const allowed = ALLOWED_MEMBERSHIP_TRANSITIONS[fromKey];
          if (!allowed || !allowed.includes(change.to_type)) {
            result.membership_changes.errors.push(
              `worker ${change.worker_id}: transition ${fromKey} -> ${change.to_type} not allowed`,
            );
            continue;
          }

          const toId = umtByName.get(change.to_type);
          if (!toId) {
            result.membership_changes.errors.push(
              `worker ${change.worker_id}: union_membership_type ${change.to_type} missing`,
            );
            continue;
          }

          const updatePatch: Record<string, unknown> = {
            union_membership_type_id: toId,
          };
          if (change.to_type === "non_oa_member") {
            if (!change.non_oa_union_id) {
              result.membership_changes.errors.push(
                `worker ${change.worker_id}: non_oa_union_id required`,
              );
              continue;
            }
            updatePatch.non_oa_union_option_id = change.non_oa_union_id;
          } else {
            // Transitioning to member_pending — let the workers_normalize_non_oa_union_option
            // BEFORE trigger clear `non_oa_union_option_id` automatically.
          }

          const { error: uErr } = await admin
            .from("workers")
            .update(updatePatch)
            .eq("worker_id", change.worker_id);
          if (uErr) throw uErr;

          await admin.from("campaign_leader_form_events").insert({
            token_id: tokenRow.token_id,
            event_type: "membership_changed",
            worker_id: change.worker_id,
            payload: {
              from: fromKey,
              to: change.to_type,
              non_oa_union_id: change.non_oa_union_id ?? null,
            },
          });
          result.membership_changes.saved++;
        } catch (e) {
          result.membership_changes.errors.push(
            `worker ${change.worker_id}: ${e instanceof Error ? e.message : "unknown"}`,
          );
        }
      }
    }

    // ── Existing-worker additions ─────────────────────────────────────
    if (parsed.data.existing_added.length > 0) {
      // Restrict to workers in this campaign's universe; also skip dupes.
      const desiredIds = Array.from(new Set(parsed.data.existing_added));
      const { data: cmRows } = await admin
        .from("campaign_worker_membership")
        .select("worker_id")
        .eq("campaign_id", campaignId)
        .in("worker_id", desiredIds);
      const inCampaign = new Set<number>(
        (cmRows ?? []).map((r) => r.worker_id as number),
      );

      // Determine sort_order baseline.
      const { data: maxRow } = await admin
        .from("campaign_task_list_items")
        .select("sort_order")
        .eq("task_list_id", tokenRow.task_list_id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextSortOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 1;

      for (const wid of desiredIds) {
        if (allowedIds.has(wid)) {
          continue; // already on the list
        }
        if (!inCampaign.has(wid)) {
          result.existing_added.errors.push(
            `worker ${wid}: not in campaign universe`,
          );
          continue;
        }
        try {
          const { error: insErr } = await admin
            .from("campaign_task_list_items")
            .insert({
              task_list_id: tokenRow.task_list_id,
              worker_id: wid,
              sort_order: nextSortOrder++,
            });
          if (insErr) throw insErr;
          allowedIds.add(wid);

          await admin.from("campaign_leader_form_events").insert({
            token_id: tokenRow.token_id,
            event_type: "existing_added",
            worker_id: wid,
            payload: { task_list_id: tokenRow.task_list_id },
          });
          result.existing_added.saved++;
        } catch (e) {
          result.existing_added.errors.push(
            `worker ${wid}: ${e instanceof Error ? e.message : "unknown"}`,
          );
        }
      }
    }

    // ── Removed workers ───────────────────────────────────────────────
    if (parsed.data.removed_worker_ids.length > 0) {
      for (const wid of parsed.data.removed_worker_ids) {
        if (!allowedIds.has(wid)) {
          result.removed_workers.errors.push(`worker ${wid} not on this task list`);
          continue;
        }
        try {
          const { error: delErr } = await admin
            .from("campaign_task_list_items")
            .delete()
            .eq("task_list_id", tokenRow.task_list_id)
            .eq("worker_id", wid);
          if (delErr) throw delErr;
          allowedIds.delete(wid);
          await admin.from("campaign_leader_form_events").insert({
            token_id: tokenRow.token_id,
            event_type: "worker_removed",
            worker_id: wid,
            payload: { task_list_id: tokenRow.task_list_id, reason: "no_longer_in_campaign" },
          });
          result.removed_workers.saved++;
        } catch (e) {
          result.removed_workers.errors.push(
            `worker ${wid}: ${e instanceof Error ? e.message : "unknown"}`,
          );
        }
      }
    }

    // ── Prospective additions ─────────────────────────────────────────
    for (const p of parsed.data.prospective) {
      try {
        const { data: inserted, error: pErr } = await admin
          .from("campaign_prospective_workers")
          .insert({
            campaign_id: campaignId,
            task_list_id: tokenRow.task_list_id,
            first_name: p.first_name,
            last_name: p.last_name,
            email: p.email && p.email.length > 0 ? p.email : null,
            phone: p.phone ?? null,
            notes: p.notes ?? null,
            rating: p.rating ?? null,
            review_status: "pending",
            source_token_id: tokenRow.token_id,
            source_leader_worker_id: leaderWorkerId,
          })
          .select("prospective_id")
          .single();
        if (pErr) throw pErr;

        await admin.from("campaign_leader_form_events").insert({
          token_id: tokenRow.token_id,
          event_type: "prospective_added",
          payload: {
            prospective_id: inserted?.prospective_id ?? null,
            first_name: p.first_name,
            last_name: p.last_name,
          },
        });
        result.prospective.saved++;
      } catch (e) {
        result.prospective.errors.push(
          `${p.first_name} ${p.last_name}: ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    }

    await admin
      .from("campaign_leader_tokens")
      .update({ last_used_at: now })
      .eq("token_id", tokenRow.token_id);

    const anyErrors =
      result.ratings.errors.length +
        result.worker_edits.errors.length +
        result.membership_changes.errors.length +
        result.existing_added.errors.length +
        result.prospective.errors.length +
        result.removed_workers.errors.length >
      0;

    return NextResponse.json(
      {
        ok: !anyErrors,
        results: {
          ratings: result.ratings,
          worker_edits: result.worker_edits,
          membership_changes: result.membership_changes,
          existing_added: result.existing_added,
          prospective: result.prospective,
          removed_workers: result.removed_workers,
        },
      },
      { status: anyErrors ? 207 : 200 },
    );
  } catch (e) {
    if (e instanceof Error && e.message.includes("Missing NEXT_PUBLIC_SUPABASE_URL")) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
