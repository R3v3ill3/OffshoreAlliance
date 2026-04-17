import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLeaderToken } from "@/lib/campaign/token-crypto";
import { leaderSubmitBodySchema } from "@/lib/validation/campaign-leader";

async function resolveTokenRow(admin: ReturnType<typeof createAdminClient>, rawToken: string) {
  const token_hash = hashLeaderToken(rawToken);
  const { data: row, error } = await admin
    .from("campaign_leader_tokens")
    .select("token_id, task_list_id, expires_at, revoked_at")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (error || !row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return row;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const admin = createAdminClient();
    const tokenRow = await resolveTokenRow(admin, rawToken);
    if (!tokenRow) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
    }

    const { data: taskList, error: tlErr } = await admin
      .from("campaign_task_lists")
      .select(
        `task_list_id, title, campaign_id, activity_id,
         campaign:campaigns(campaign_id, name),
         activity:campaign_activities(activity_id, title, is_binary, supporter_outcome_value)`
      )
      .eq("task_list_id", tokenRow.task_list_id)
      .single();

    if (tlErr || !taskList) {
      return NextResponse.json({ error: "Task list not found" }, { status: 404 });
    }

    const activityId = taskList.activity_id as number;

    const { data: items, error: itemsErr } = await admin
      .from("campaign_task_list_items")
      .select("worker_id, sort_order")
      .eq("task_list_id", tokenRow.task_list_id)
      .order("sort_order", { ascending: true });

    if (itemsErr) throw itemsErr;

    const workerIds = (items ?? [])
      .map((i) => i.worker_id)
      .filter((id): id is number => id != null);

    let workers: {
      worker_id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
    }[] = [];

    if (workerIds.length > 0) {
      const { data: wRows, error: wErr } = await admin
        .from("workers")
        .select("worker_id, first_name, last_name, email, phone")
        .in("worker_id", workerIds);
      if (wErr) throw wErr;
      workers = wRows ?? [];
    }

    const { data: ratings, error: rErr } = await admin
      .from("campaign_activity_ratings")
      .select("worker_id, rating, binary_value, notes")
      .eq("activity_id", activityId)
      .in("worker_id", workerIds.length ? workerIds : [-1]);

    if (rErr) throw rErr;

    const ratingByWorker = new Map(
      (ratings ?? []).map((r) => [
        r.worker_id,
        { rating: r.rating, binary_value: r.binary_value, notes: r.notes },
      ])
    );

    const ordered = workerIds
      .map((wid) => {
        const w = workers.find((x) => x.worker_id === wid);
        if (!w) return null;
        const r = ratingByWorker.get(wid);
        return {
          worker_id: w.worker_id,
          first_name: w.first_name,
          last_name: w.last_name,
          email: w.email,
          phone: w.phone,
          existing_rating: r?.rating ?? null,
          binary_value: r?.binary_value ?? null,
          notes: r?.notes ?? null,
        };
      })
      .filter(Boolean);

    await admin
      .from("campaign_leader_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_id", tokenRow.token_id);

    const rawAct = taskList.activity;
    const activityRow = Array.isArray(rawAct) ? rawAct[0] : rawAct;
    const activity = activityRow as {
      activity_id: number;
      title: string;
      is_binary: boolean;
      supporter_outcome_value: string | null;
    } | null;
    const rawCamp = taskList.campaign;
    const campaignRow = Array.isArray(rawCamp) ? rawCamp[0] : rawCamp;
    const campaign = campaignRow as { campaign_id: number; name: string } | null;

    return NextResponse.json({
      campaign: campaign ?? { campaign_id: taskList.campaign_id, name: "" },
      task_list: {
        task_list_id: taskList.task_list_id,
        title: taskList.title,
      },
      activity: activity ?? {
        activity_id: activityId,
        title: "",
        is_binary: false,
        supporter_outcome_value: null,
      },
      workers: ordered,
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Missing NEXT_PUBLIC_SUPABASE_URL")) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to load task list" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
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
    const tokenRow = await resolveTokenRow(admin, rawToken);
    if (!tokenRow) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
    }

    const { data: taskList, error: tlErr } = await admin
      .from("campaign_task_lists")
      .select("task_list_id, campaign_id, activity_id")
      .eq("task_list_id", tokenRow.task_list_id)
      .single();

    if (tlErr || !taskList) {
      return NextResponse.json({ error: "Task list not found" }, { status: 404 });
    }

    const activityId = taskList.activity_id as number;
    const campaignId = taskList.campaign_id as number;

    const allowedIds = new Set<number>();
    const { data: items } = await admin
      .from("campaign_task_list_items")
      .select("worker_id")
      .eq("task_list_id", tokenRow.task_list_id);
    for (const i of items ?? []) {
      if (i.worker_id != null) allowedIds.add(i.worker_id);
    }

    const now = new Date().toISOString();

    for (const row of parsed.data.ratings) {
      if (!allowedIds.has(row.worker_id)) {
        return NextResponse.json({ error: "Worker not on this task list" }, { status: 400 });
      }
      const { error: upErr } = await admin.from("campaign_activity_ratings").upsert(
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
        },
        { onConflict: "activity_id,worker_id,rating_phase,event_id" }
      );
      if (upErr) throw upErr;
    }

    for (const p of parsed.data.prospective) {
      const { error: pErr } = await admin.from("campaign_prospective_workers").insert({
        campaign_id: campaignId,
        task_list_id: tokenRow.task_list_id,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email && p.email.length > 0 ? p.email : null,
        phone: p.phone ?? null,
        notes: p.notes ?? null,
        rating: p.rating ?? null,
      });
      if (pErr) throw pErr;
    }

    await admin
      .from("campaign_leader_tokens")
      .update({ last_used_at: now })
      .eq("token_id", tokenRow.token_id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Missing NEXT_PUBLIC_SUPABASE_URL")) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
