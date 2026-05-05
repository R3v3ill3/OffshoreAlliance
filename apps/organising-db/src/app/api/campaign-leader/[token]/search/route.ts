/**
 * POST /api/campaign-leader/[token]/search
 *
 * Phase 4 — Search the campaign universe (workers in
 * `campaign_worker_membership` for the token's campaign) by name / phone /
 * email substring. Used by the leader webform's "Search campaign universe"
 * tab to add an existing-but-not-yet-on-the-list worker to the leader's task
 * list.
 *
 * Auth: leader session cookie (issued by `/auth`). Same gate as the GET on
 * the parent route; see `verifyLeaderSession` from Phase 2.
 *
 * Request:  { q: string (>= 2 chars) }
 * Success:  200 { results: Array<{ worker_id, first_name, last_name, email,
 *                                  phone, occupation }> }
 *           Caps at 25 results. Excludes workers already on this token's task
 *           list so the UI can show only addable candidates.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLeaderToken } from "@/lib/campaign/token-crypto";
import {
  cookieNameFromToken,
  verifyLeaderSession,
} from "@/lib/campaign/leader-session";
import { leaderSearchRequestSchema } from "@/lib/validation/campaign-leader";

const MAX_RESULTS = 25;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = leaderSearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const admin = createAdminClient();
    const tokenHash = hashLeaderToken(rawToken);
    const { data: tokenRow, error: tErr } = await admin
      .from("campaign_leader_tokens")
      .select("token_id, task_list_id, expires_at, revoked_at, locked_until")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (tErr || !tokenRow) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 });
    }
    if (tokenRow.revoked_at) {
      return NextResponse.json({ error: "Link revoked" }, { status: 410 });
    }
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link expired" }, { status: 410 });
    }
    if (tokenRow.locked_until && new Date(tokenRow.locked_until) > new Date()) {
      return NextResponse.json(
        { error: "Locked", locked_until: tokenRow.locked_until },
        { status: 423 },
      );
    }

    const cookie = request.cookies.get(cookieNameFromToken(rawToken));
    const session = verifyLeaderSession(rawToken, cookie?.value);
    if (!session || session.tokenId !== tokenRow.token_id) {
      return NextResponse.json({ requires_password: true }, { status: 401 });
    }

    // Resolve token -> task list -> campaign id, plus the existing items so we
    // can exclude them from results.
    const { data: taskList, error: tlErr } = await admin
      .from("campaign_task_lists")
      .select("task_list_id, campaign_id")
      .eq("task_list_id", tokenRow.task_list_id)
      .maybeSingle();

    if (tlErr || !taskList?.campaign_id) {
      return NextResponse.json({ error: "Task list not found" }, { status: 404 });
    }

    const campaignId = taskList.campaign_id as number;

    const { data: existingItems } = await admin
      .from("campaign_task_list_items")
      .select("worker_id")
      .eq("task_list_id", tokenRow.task_list_id);

    const excludeIds = new Set<number>();
    for (const it of existingItems ?? []) {
      if (it.worker_id != null) excludeIds.add(it.worker_id as number);
    }

    // Pull all worker_ids in this campaign's membership, then filter against
    // the workers table by the search predicate. Two-step query because
    // PostgREST `or()` filters do not compose easily with cross-table `in`s.
    const { data: membershipRows, error: cmErr } = await admin
      .from("campaign_worker_membership")
      .select("worker_id")
      .eq("campaign_id", campaignId);

    if (cmErr) throw cmErr;

    const candidateIds = (membershipRows ?? [])
      .map((r) => r.worker_id as number | null)
      .filter((id): id is number => id != null && !excludeIds.has(id));

    if (candidateIds.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const escaped = parsed.data.q.replace(/[\\%_,]/g, (c) => `\\${c}`);
    const pattern = `%${escaped}%`;

    const { data: workers, error: wErr } = await admin
      .from("workers")
      .select("worker_id, first_name, last_name, email, phone, occupation")
      .in("worker_id", candidateIds)
      .or(
        [
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
          `email.ilike.${pattern}`,
          `phone.ilike.${pattern}`,
        ].join(","),
      )
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(MAX_RESULTS);

    if (wErr) throw wErr;

    return NextResponse.json({ results: workers ?? [] });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Missing NEXT_PUBLIC_SUPABASE_URL")) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
