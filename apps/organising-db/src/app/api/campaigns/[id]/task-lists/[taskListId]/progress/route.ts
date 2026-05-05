import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import { getTaskListProgress } from "@/lib/campaign/task-list-progress";

/**
 * GET /api/campaigns/:id/task-lists/:taskListId/progress
 *
 * Phase 6 — staff-side progress monitoring for a leader task list.
 * Auth: admin|user.
 *
 * Returns the aggregate `TaskListProgressSummary` plus a paginated event
 * timeline (most-recent first). The timeline includes every audit event
 * tied to any token issued for this task list — `opened`, `auth_success`,
 * `auth_fail`, `rating_saved`, `worker_edited`, `membership_changed`,
 * `existing_added`, `prospective_added`.
 *
 * Query params:
 *   - cursor — last seen `event_id` (we paginate on event_id DESC because
 *              created_at + event_id are monotone for a single auditor).
 *   - limit  — page size (default 50, capped at 100).
 *
 * Response shape:
 *   {
 *     summary: TaskListProgressSummary,
 *     events: Array<{
 *       event_id: number;
 *       event_type: string;
 *       worker_id: number | null;
 *       worker_name: string | null;
 *       payload: any;
 *       created_at: string;
 *       ip_hash_tail: string | null;  // last 6 chars of the SHA-256 hash
 *     }>,
 *     next_cursor: number | null,
 *   }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskListId: string }> }
) {
  try {
    const { id, taskListId } = await params;
    const campaignId = Number(id);
    const numericTaskListId = Number(taskListId);
    if (!Number.isFinite(campaignId) || !Number.isFinite(numericTaskListId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const supabase = await createClient();
    const staff = await requireStaffUser(supabase);
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Confirm the task list belongs to this campaign (defence-in-depth).
    const { data: tl, error: tlErr } = await supabase
      .from("campaign_task_lists")
      .select("task_list_id, campaign_id")
      .eq("task_list_id", numericTaskListId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (tlErr) {
      return NextResponse.json({ error: tlErr.message }, { status: 500 });
    }
    if (!tl) {
      return NextResponse.json({ error: "Task list not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const cursorParam = url.searchParams.get("cursor");
    const limitParam = url.searchParams.get("limit");

    let cursor: number | null = null;
    if (cursorParam) {
      const n = Number(cursorParam);
      if (Number.isFinite(n) && n > 0) cursor = n;
    }
    let limit = 50;
    if (limitParam) {
      const n = Number(limitParam);
      if (Number.isFinite(n) && n >= 1 && n <= 100) limit = Math.floor(n);
    }

    // Tokens for this task list.
    const { data: tokens } = await supabase
      .from("campaign_leader_tokens")
      .select("token_id")
      .eq("task_list_id", numericTaskListId);
    const tokenIds = (tokens ?? []).map((t) => t.token_id as number);

    // Summary in parallel with the events page.
    const [summary, eventsResult] = await Promise.all([
      getTaskListProgress(supabase, numericTaskListId),
      (async () => {
        if (tokenIds.length === 0) return { events: [], nextCursor: null };
        let q = supabase
          .from("campaign_leader_form_events")
          .select("event_id, event_type, worker_id, payload, created_at, ip_hash")
          .in("token_id", tokenIds)
          .order("event_id", { ascending: false })
          .limit(limit + 1);

        if (cursor != null) {
          q = q.lt("event_id", cursor);
        }

        const { data: rows, error: evErr } = await q;
        if (evErr) throw evErr;

        const page = (rows ?? []).slice(0, limit);
        const hasMore = (rows ?? []).length > limit;
        const nextCursor = hasMore
          ? (page[page.length - 1].event_id as number)
          : null;

        // Worker name lookup.
        const workerIds = Array.from(
          new Set(
            page
              .map((r) => r.worker_id as number | null)
              .filter((w): w is number => w != null)
          )
        );

        let nameById = new Map<number, string>();
        if (workerIds.length > 0) {
          const { data: workers } = await supabase
            .from("workers")
            .select("worker_id, first_name, last_name")
            .in("worker_id", workerIds);
          nameById = new Map(
            (workers ?? []).map((w) => [
              w.worker_id as number,
              `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() ||
                `Worker #${w.worker_id}`,
            ])
          );
        }

        const events = page.map((r) => ({
          event_id: r.event_id as number,
          event_type: r.event_type as string,
          worker_id: (r.worker_id as number | null) ?? null,
          worker_name:
            r.worker_id != null
              ? nameById.get(r.worker_id as number) ?? null
              : null,
          payload: r.payload ?? null,
          created_at: r.created_at as string,
          // ip_hash is a SHA-256 hex string. Surface only the trailing 6 chars
          // for triage; full hash never leaves the audit table.
          ip_hash_tail:
            typeof r.ip_hash === "string" && r.ip_hash.length > 6
              ? r.ip_hash.slice(-6)
              : null,
        }));

        return { events, nextCursor };
      })(),
    ]);

    return NextResponse.json({
      summary,
      events: eventsResult.events,
      next_cursor: eventsResult.nextCursor,
    });
  } catch (e) {
    console.error("task-list progress route failed", e);
    return NextResponse.json(
      { error: "Failed to load progress" },
      { status: 500 }
    );
  }
}
