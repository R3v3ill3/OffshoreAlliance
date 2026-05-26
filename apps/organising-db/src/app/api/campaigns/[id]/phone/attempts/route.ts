import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";

/**
 * Attempt-level drill-down for the live action dashboard.
 *
 * Query params:
 *   - outcome_classification: filter to one outcome bucket
 *   - caller_session_label: filter to a specific caller
 *   - share_token_id: filter to a specific share-token source
 *   - list_id: filter to a specific list
 *   - since: ISO timestamp lower bound (default 24h)
 *   - limit: max rows (default 100, capped at 500)
 *
 * Returns rows shaped for the drawer: includes worker name, list name, and
 * relational payloads (notes, objections, issues, CTA + assessment ratings).
 */
export async function GET(
  request: NextRequest,
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

    const url = new URL(request.url);
    const outcomeClassification = url.searchParams.get("outcome_classification");
    const callerLabel = url.searchParams.get("caller_session_label");
    const shareTokenIdParam = url.searchParams.get("share_token_id");
    const listIdParam = url.searchParams.get("list_id");
    const sinceParam = url.searchParams.get("since");
    const limitParam = url.searchParams.get("limit");

    const since = sinceParam ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const limit = Math.min(500, Math.max(1, Number.parseInt(limitParam ?? "100", 10) || 100));

    const { data: lists } = await supabase
      .from("call_lists")
      .select("list_id, name")
      .eq("campaign_id", campaignId);
    const listIds = (lists ?? []).map((l) => l.list_id);
    if (listIds.length === 0) {
      return NextResponse.json({ attempts: [] });
    }

    const { data: scopedItems } = await supabase
      .from("call_list_items")
      .select("item_id, list_id, worker_id, workers!call_list_items_worker_id_fkey(worker_id, first_name, last_name)")
      .in(
        "list_id",
        listIdParam ? [Number.parseInt(listIdParam, 10)].filter((n) => listIds.includes(n)) : listIds,
      );
    const itemIds = (scopedItems ?? []).map((i) => i.item_id);
    if (itemIds.length === 0) {
      return NextResponse.json({ attempts: [] });
    }

    let query = supabase
      .from("call_attempts")
      .select(
        "attempt_id, list_item_id, started_at, dial_disposition, call_disposition, outcome_classification, support_level_assessed, overall_notes, callback_datetime, duration_seconds, caller_user_id, caller_session_label, share_token_id",
      )
      .in("list_item_id", itemIds)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (outcomeClassification) query = query.eq("outcome_classification", outcomeClassification);
    if (callerLabel) query = query.eq("caller_session_label", callerLabel);
    if (shareTokenIdParam) {
      const tokenId = Number.parseInt(shareTokenIdParam, 10);
      if (Number.isFinite(tokenId)) query = query.eq("share_token_id", tokenId);
    }

    const { data: attempts, error } = await query;
    if (error) throw error;

    const itemById = new Map(scopedItems?.map((i) => [i.item_id, i]) ?? []);
    const listById = new Map(lists?.map((l) => [l.list_id, l.name]) ?? []);

    const attemptIds = (attempts ?? []).map((a) => a.attempt_id);
    const [
      { data: objections },
      { data: issues },
      { data: ctaRatings },
      { data: assessmentRatings },
    ] = await Promise.all([
      supabase
        .from("call_attempt_objections")
        .select("attempt_id, objection_id, custom_label, outcome, notes")
        .in("attempt_id", attemptIds),
      supabase
        .from("call_attempt_issues")
        .select("attempt_id, issue_label, heat, source_top_issue_index, notes")
        .in("attempt_id", attemptIds),
      supabase
        .from("call_attempt_cta_ratings")
        .select("attempt_id, cta_ambition_id, rating, binary_value, notes")
        .in("attempt_id", attemptIds),
      supabase
        .from("call_attempt_assessment_ratings")
        .select("attempt_id, activity_id, rating, notes")
        .in("attempt_id", attemptIds),
    ]);

    const groupBy = <T extends { attempt_id: number }>(rows: T[] | null): Map<number, T[]> => {
      const map = new Map<number, T[]>();
      for (const r of rows ?? []) {
        const arr = map.get(r.attempt_id) ?? [];
        arr.push(r);
        map.set(r.attempt_id, arr);
      }
      return map;
    };
    const objectionsByAttempt = groupBy(objections);
    const issuesByAttempt = groupBy(issues);
    const ctaByAttempt = groupBy(ctaRatings);
    const assessmentByAttempt = groupBy(assessmentRatings);

    const rows = (attempts ?? []).map((a) => {
      const item = itemById.get(a.list_item_id);
      const workersRel = (item as { workers?: unknown } | undefined)?.workers;
      const worker = Array.isArray(workersRel) ? workersRel[0] : (workersRel as Record<string, unknown> | undefined);
      return {
        attempt_id: a.attempt_id,
        list_item_id: a.list_item_id,
        started_at: a.started_at,
        duration_seconds: a.duration_seconds,
        dial_disposition: a.dial_disposition,
        call_disposition: a.call_disposition,
        outcome_classification: a.outcome_classification,
        support_level_assessed: a.support_level_assessed,
        overall_notes: a.overall_notes,
        callback_datetime: a.callback_datetime,
        caller_user_id: a.caller_user_id,
        caller_session_label: a.caller_session_label,
        share_token_id: a.share_token_id,
        list_id: item?.list_id ?? null,
        list_name: item?.list_id ? listById.get(item.list_id) ?? null : null,
        worker_id: worker?.worker_id ?? null,
        worker_name: worker
          ? `${(worker.first_name as string) ?? ""} ${(worker.last_name as string) ?? ""}`.trim()
          : null,
        objections: objectionsByAttempt.get(a.attempt_id) ?? [],
        issues: issuesByAttempt.get(a.attempt_id) ?? [],
        cta_ratings: ctaByAttempt.get(a.attempt_id) ?? [],
        assessment_ratings: assessmentByAttempt.get(a.attempt_id) ?? [],
      };
    });

    return NextResponse.json({ attempts: rows });
  } catch (error) {
    console.error("/api/campaigns/[id]/phone/attempts error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load attempts" },
      { status: 500 },
    );
  }
}
