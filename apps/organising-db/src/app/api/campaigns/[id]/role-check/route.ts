import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Role-check queue (post-Phase-6 remediation).
 *
 * Returns campaign workers who have at least one rating of 1
 * (supportive_leader) on a campaign activity but whose global union role
 * (workers.member_role_type_id) is NULL or not contact / activist /
 * delegate. Surfaces a prompt for staff to confirm the union role.
 *
 * This is a UI prompt, not an auto-promotion: per product decision the
 * rating-1 signal is softer than task allocation, so role designation
 * stays an intentional human choice.
 *
 * Auth: any authenticated user; RLS scopes naturally to readable workers.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid campaign id" },
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
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Resolve canonical role_type_ids by name. We accept the membership-style
  // legacy "member" rows alongside leadership rows because membership status
  // ≠ leadership. Anything that is neither contact / activist / delegate
  // qualifies for a prompt.
  const { data: roles, error: rolesErr } = await supabase
    .from("member_role_types")
    .select("role_type_id, role_name")
    .ilike("role_name", "%");
  if (rolesErr) {
    return NextResponse.json(
      { ok: false, error: rolesErr.message },
      { status: 500 }
    );
  }
  const findId = (n: string) =>
    roles?.find((r) => r.role_name?.toLowerCase() === n.toLowerCase())
      ?.role_type_id ?? null;
  const leaderRoleIds = [findId("contact"), findId("activist"), findId("delegate")].filter(
    (x): x is number => Number.isFinite(x as number)
  );

  // 1. Collect activities for this campaign.
  const { data: activities, error: aErr } = await supabase
    .from("campaign_activities")
    .select("activity_id, title")
    .eq("campaign_id", campaignId);
  if (aErr) {
    return NextResponse.json(
      { ok: false, error: aErr.message },
      { status: 500 }
    );
  }
  if (!activities || activities.length === 0) {
    return NextResponse.json({ ok: true, rows: [], leader_role_ids: leaderRoleIds });
  }
  const activityIds = activities.map((a) => a.activity_id as number);
  const activityTitleById = new Map<number, string>(
    activities.map((a) => [a.activity_id as number, (a.title as string) ?? ""])
  );

  // 2. Pull rating=1 rows on those activities.
  const { data: ratings, error: rErr } = await supabase
    .from("campaign_activity_ratings")
    .select("activity_id, worker_id, rating, rated_at")
    .in("activity_id", activityIds)
    .eq("rating", 1)
    .order("rated_at", { ascending: false });
  if (rErr) {
    return NextResponse.json(
      { ok: false, error: rErr.message },
      { status: 500 }
    );
  }
  if (!ratings || ratings.length === 0) {
    return NextResponse.json({ ok: true, rows: [], leader_role_ids: leaderRoleIds });
  }

  // 3. Group by worker_id, take most recent rating context.
  type WorkerCtx = {
    worker_id: number;
    latest_rated_at: string;
    latest_activity_id: number;
    rating_1_count: number;
  };
  const ctxByWorker = new Map<number, WorkerCtx>();
  for (const r of ratings) {
    const wid = r.worker_id as number;
    const existing = ctxByWorker.get(wid);
    if (existing) {
      existing.rating_1_count += 1;
    } else {
      ctxByWorker.set(wid, {
        worker_id: wid,
        latest_rated_at: r.rated_at as string,
        latest_activity_id: r.activity_id as number,
        rating_1_count: 1,
      });
    }
  }
  const workerIds = Array.from(ctxByWorker.keys());

  // 4. Pull worker rows + current global role.
  const { data: workers, error: wErr } = await supabase
    .from("workers")
    .select(
      "worker_id, first_name, last_name, member_role_type_id, occupation, employer_id"
    )
    .in("worker_id", workerIds);
  if (wErr) {
    return NextResponse.json(
      { ok: false, error: wErr.message },
      { status: 500 }
    );
  }

  // 5. Filter to workers whose role is NOT contact/activist/delegate.
  const rows = (workers ?? [])
    .filter((w) => {
      const role = w.member_role_type_id as number | null;
      return role === null || !leaderRoleIds.includes(role);
    })
    .map((w) => {
      const ctx = ctxByWorker.get(w.worker_id as number)!;
      return {
        worker_id: w.worker_id as number,
        first_name: w.first_name as string | null,
        last_name: w.last_name as string | null,
        occupation: (w.occupation as string | null) ?? null,
        current_role_type_id: w.member_role_type_id as number | null,
        latest_activity_id: ctx.latest_activity_id,
        latest_activity_title: activityTitleById.get(ctx.latest_activity_id) ?? "",
        latest_rated_at: ctx.latest_rated_at,
        rating_1_count: ctx.rating_1_count,
      };
    })
    .sort((a, b) => b.rating_1_count - a.rating_1_count);

  return NextResponse.json({
    ok: true,
    rows,
    leader_role_ids: leaderRoleIds,
    leader_role_lookup: {
      contact: findId("contact"),
      activist: findId("activist"),
      delegate: findId("delegate"),
    },
  });
}
