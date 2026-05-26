import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";

/**
 * Live action snapshot for the coordinator dashboard.
 *
 * Returns a single JSON document describing the current state of every
 * active phone call action on the campaign:
 *
 *   {
 *     header: { total_contacts, completed, in_progress, deferred, abandoned_claims },
 *     lists: [{ list_id, name, status, total_items, completed_items }],
 *     callers: [{ id, label, source, attempts_15m, connect_rate_15m,
 *                 last_action_at, current_claim, idle_minutes }],
 *     tokens: [{ token_id, list_id, list_name, label, expires_at,
 *                attempts, unique_workers, active_claims, last_used_at }],
 *     activity: [{ kind: 'attempt'|'event', at, ... }],
 *     rollup: { outcome_counts, objection_clusters, issue_heat },
 *   }
 *
 * The route is poll-friendly (cheap, no streaming) and pairs with Supabase
 * Realtime subscriptions on `call_list_items` and `call_attempts`.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const campaignId = Number.parseInt(id, 10);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    const supabase = await createClient();
    const staff = await requireStaffUser(supabase);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const since15m = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: lists, error: listsErr } = await supabase
      .from("call_lists")
      .select("list_id, name, status, total_items, completed_items")
      .eq("campaign_id", campaignId)
      .neq("status", "archived");
    if (listsErr) throw listsErr;

    const listIds = (lists ?? []).map((l) => l.list_id);
    if (listIds.length === 0) {
      return NextResponse.json({
        header: {
          total_contacts: 0,
          completed: 0,
          in_progress: 0,
          deferred: 0,
          abandoned_claims: 0,
        },
        lists: [],
        callers: [],
        tokens: [],
        activity: [],
        rollup: { outcome_counts: {}, objection_clusters: [], issue_heat: [] },
      });
    }

    const { data: items, error: itemsErr } = await supabase
      .from("call_list_items")
      .select(
        "item_id, list_id, status, claimed_at, claimed_by_session_label, claimed_by_worker_id, claimed_by_share_token_id",
      )
      .in("list_id", listIds);
    if (itemsErr) throw itemsErr;

    const inProgressItems = (items ?? []).filter((i) => i.status === "in_progress");
    const abandonedClaimThreshold = Date.now() - 10 * 60 * 1000;
    const abandonedClaims = inProgressItems.filter(
      (i) => i.claimed_at && Date.parse(i.claimed_at) < abandonedClaimThreshold,
    ).length;

    const header = {
      total_contacts: items?.length ?? 0,
      completed: (items ?? []).filter((i) => i.status === "completed").length,
      in_progress: inProgressItems.length,
      deferred: (items ?? []).filter((i) => i.status === "deferred").length,
      abandoned_claims: abandonedClaims,
    };

    // Pull recent attempts for caller/connect-rate stats and activity feed.
    const { data: recentAttempts } = await supabase
      .from("call_attempts")
      .select(
        "attempt_id, list_item_id, started_at, dial_disposition, outcome_classification, caller_user_id, caller_session_label, caller_session_worker_id, share_token_id",
      )
      .gte("started_at", since24h)
      .order("started_at", { ascending: false })
      .limit(500);

    // Restrict by list (join client-side because attempts -> items -> lists).
    const itemList = new Map<number, number>();
    for (const it of items ?? []) itemList.set(it.item_id, it.list_id);
    const scopedAttempts = (recentAttempts ?? []).filter((a) =>
      itemList.has(a.list_item_id),
    );

    // Per-caller aggregation.
    interface CallerAgg {
      id: string;
      label: string | null;
      source: "staff" | "share";
      worker_id: number | null;
      attempts_15m: number;
      connected_15m: number;
      last_action_at: string | null;
      attempts_total: number;
    }
    const callerMap = new Map<string, CallerAgg>();
    for (const a of scopedAttempts) {
      const sessionLabel = a.caller_session_label ?? null;
      const userId = a.caller_user_id ?? null;
      const key = `${userId ?? "share"}:${sessionLabel ?? userId ?? "anonymous"}`;
      let agg = callerMap.get(key);
      if (!agg) {
        agg = {
          id: key,
          label: sessionLabel ?? (userId ? `Staff (${userId.slice(0, 8)})` : "Anonymous"),
          source: userId ? "staff" : "share",
          worker_id: a.caller_session_worker_id ?? null,
          attempts_15m: 0,
          connected_15m: 0,
          last_action_at: a.started_at,
          attempts_total: 0,
        };
        callerMap.set(key, agg);
      }
      agg.attempts_total += 1;
      if (a.started_at >= since15m) {
        agg.attempts_15m += 1;
        if (a.dial_disposition === "connected") agg.connected_15m += 1;
      }
      if (!agg.last_action_at || a.started_at > agg.last_action_at) {
        agg.last_action_at = a.started_at;
      }
    }

    // Annotate callers with their current claim (if any).
    const claimsByLabel = new Map<string, typeof inProgressItems[number]>();
    for (const item of inProgressItems) {
      if (item.claimed_by_session_label) claimsByLabel.set(item.claimed_by_session_label, item);
    }
    const callers = Array.from(callerMap.values()).map((c) => {
      const claim = c.label ? claimsByLabel.get(c.label) : undefined;
      const idleMs = c.last_action_at ? Date.now() - Date.parse(c.last_action_at) : null;
      return {
        ...c,
        connect_rate_15m:
          c.attempts_15m > 0 ? Math.round((c.connected_15m / c.attempts_15m) * 100) : null,
        current_claim_item_id: claim?.item_id ?? null,
        current_claim_age_min: claim?.claimed_at
          ? Math.round((Date.now() - Date.parse(claim.claimed_at)) / 60000)
          : null,
        idle_minutes: idleMs != null ? Math.round(idleMs / 60000) : null,
      };
    });

    // Per-share-token panel data.
    const { data: tokens } = await supabase
      .from("call_share_tokens")
      .select("token_id, list_id, expires_at, revoked_at, last_used_at, leader_worker_id")
      .in("list_id", listIds)
      .is("revoked_at", null)
      .order("expires_at", { ascending: true });
    const tokenSummaries = (tokens ?? []).map((t) => {
      const tokenAttempts = scopedAttempts.filter((a) => a.share_token_id === t.token_id);
      const uniqueWorkers = new Set(
        tokenAttempts
          .map((a) => itemList.get(a.list_item_id))
          .filter((v): v is number => v != null),
      ).size;
      const activeClaims = inProgressItems.filter(
        (i) => i.claimed_by_share_token_id === t.token_id,
      ).length;
      return {
        token_id: t.token_id,
        list_id: t.list_id,
        list_name: lists?.find((l) => l.list_id === t.list_id)?.name ?? "",
        attempts: tokenAttempts.length,
        unique_workers: uniqueWorkers,
        active_claims: activeClaims,
        last_used_at: t.last_used_at,
        expires_at: t.expires_at,
      };
    });

    // Live activity feed — attempts + share-form events, newest first.
    const { data: events } = await supabase
      .from("call_share_form_events")
      .select("event_id, token_id, event_type, payload, worker_id, created_at")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(100);
    const tokenById = new Map((tokens ?? []).map((t) => [t.token_id, t]));
    const activity: {
      kind: "attempt" | "event";
      at: string;
      label: string;
      detail: string;
    }[] = [];
    for (const a of scopedAttempts.slice(0, 50)) {
      activity.push({
        kind: "attempt",
        at: a.started_at,
        label: a.caller_session_label ?? "Staff",
        detail: `${a.dial_disposition}${a.outcome_classification ? ` · ${a.outcome_classification.replace(/_/g, " ")}` : ""}`,
      });
    }
    for (const e of events ?? []) {
      if (!tokenById.has(e.token_id)) continue;
      activity.push({
        kind: "event",
        at: e.created_at,
        label: `share:${e.token_id}`,
        detail: e.event_type,
      });
    }
    activity.sort((a, b) => (a.at < b.at ? 1 : -1));

    // Outcome rollups.
    const outcomeCounts: Record<string, number> = {};
    for (const a of scopedAttempts) {
      const key = a.outcome_classification ?? "unknown";
      outcomeCounts[key] = (outcomeCounts[key] ?? 0) + 1;
    }

    return NextResponse.json({
      header,
      lists,
      callers,
      tokens: tokenSummaries,
      activity: activity.slice(0, 100),
      rollup: {
        outcome_counts: outcomeCounts,
        objection_clusters: [],
        issue_heat: [],
      },
    });
  } catch (error) {
    console.error("/api/campaigns/[id]/phone/live error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load live data" },
      { status: 500 },
    );
  }
}
