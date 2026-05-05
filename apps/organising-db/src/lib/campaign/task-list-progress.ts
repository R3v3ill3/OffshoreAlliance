import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@oa/db-types";

/**
 * Phase 6 — progress monitoring helpers for the staff task lists page.
 *
 * Pure server-side aggregation: given a `task_list_id` (or a campaign), tally
 * how the leader is progressing on the webform by joining
 * `campaign_leader_form_events` (the audit log Phase 4 emits) against the
 * task list's items. The output drives both the per-row badge in
 * `campaign-task-lists.tsx` and the slide-over timeline.
 *
 * Event-type vocabulary (from Phases 2 + 4):
 *   - `opened`              — leader hit the page (auto-fires on each authed GET)
 *   - `auth_success`        — password accepted, session cookie issued
 *   - `auth_fail`           — password rejected
 *   - `rating_saved`        — `worker_id` set, payload `{ rating, binary_value }`
 *   - `worker_edited`       — `worker_id` set, payload `{ patch }`
 *   - `membership_changed`  — `worker_id` set, payload `{ from, to, ... }`
 *   - `existing_added`      — `worker_id` set (the campaign worker added)
 *   - `prospective_added`   — `worker_id` NULL, payload `{ prospective_id, ... }`
 *
 * The aggregation derives:
 *   - workers_total      → count of items currently on the list
 *   - workers_rated      → distinct `worker_id` with a `rating_saved` event
 *                          OR a `campaign_activity_ratings` row sourced via
 *                          `leader_form` for the parent activity (so ratings
 *                          written before Phase 4's audit-event additions
 *                          still count).
 *   - existing_added     → distinct `worker_id` with an `existing_added` event
 *   - prospective_added  → count of `prospective_added` events
 *   - workers_edited     → distinct `worker_id` with `worker_edited` events
 *   - membership_changed → distinct `worker_id` with `membership_changed`
 *   - last_event_at      → MAX(created_at) across ALL events for the list's
 *                          tokens (including `opened` / `auth_*`)
 *   - last_auth_success_at → MAX(created_at) WHERE event_type='auth_success'
 *
 * No React. Caller passes a Supabase client with sufficient privileges to
 * SELECT from these tables (the staff routes use the cookie-bound server
 * client; RLS allows authenticated SELECT on the events table).
 */

export type TaskListProgressSummary = {
  task_list_id: number;
  workers_total: number;
  workers_rated: number;
  existing_added: number;
  prospective_added: number;
  workers_edited: number;
  membership_changed: number;
  last_event_at: string | null;
  last_auth_success_at: string | null;
};

const EMPTY_SUMMARY = (taskListId: number): TaskListProgressSummary => ({
  task_list_id: taskListId,
  workers_total: 0,
  workers_rated: 0,
  existing_added: 0,
  prospective_added: 0,
  workers_edited: 0,
  membership_changed: 0,
  last_event_at: null,
  last_auth_success_at: null,
});

interface MinimalEvent {
  event_type: string;
  worker_id: number | null;
  created_at: string;
}

interface MinimalToken {
  token_id: number;
  task_list_id: number;
}

/**
 * Compute progress summary for a single task list. One round trip per relation.
 */
export async function getTaskListProgress(
  client: SupabaseClient<Database>,
  taskListId: number
): Promise<TaskListProgressSummary> {
  const numericId = Number(taskListId);
  if (!Number.isFinite(numericId)) return EMPTY_SUMMARY(taskListId);

  // 1. Tokens for this task list.
  const { data: tokens } = await client
    .from("campaign_leader_tokens")
    .select("token_id, task_list_id")
    .eq("task_list_id", numericId);

  const tokenIds = (tokens ?? []).map((t) => t.token_id as number);

  // 2. Items on this task list (drives workers_total).
  const { data: items } = await client
    .from("campaign_task_list_items")
    .select("worker_id")
    .eq("task_list_id", numericId);

  const workersTotal = (items ?? []).length;

  // 3. Activity id (drives the workers_rated fallback path).
  const { data: tlRow } = await client
    .from("campaign_task_lists")
    .select("activity_id")
    .eq("task_list_id", numericId)
    .maybeSingle();

  // 4. Events for these tokens (single SELECT).
  let events: MinimalEvent[] = [];
  if (tokenIds.length > 0) {
    const { data: ev } = await client
      .from("campaign_leader_form_events")
      .select("event_type, worker_id, created_at")
      .in("token_id", tokenIds);
    events = (ev ?? []) as MinimalEvent[];
  }

  // 5. Fallback: workers with a leader_form rating attached to this activity
  //    (covers the case where Phase 4's `rating_saved` audit event is missing
  //    for any reason but `record_assessment_event` did write a row).
  let ratedFromCar = new Set<number>();
  if (tlRow?.activity_id != null) {
    const itemWorkerIds = (items ?? [])
      .map((i) => i.worker_id as number)
      .filter((w) => Number.isFinite(w));
    if (itemWorkerIds.length > 0) {
      const { data: cars } = await client
        .from("campaign_activity_ratings")
        .select("worker_id")
        .eq("activity_id", tlRow.activity_id)
        .eq("source", "leader_form")
        .in("worker_id", itemWorkerIds);
      ratedFromCar = new Set(
        (cars ?? []).map((r) => r.worker_id as number)
      );
    }
  }

  return summariseEvents({
    taskListId: numericId,
    workersTotal,
    events,
    ratedFromCar,
  });
}

/**
 * Compute progress summaries for every task list in a campaign in batch.
 * One round trip per relation, joined client-side.
 */
export async function getTaskListProgressBatch(
  client: SupabaseClient<Database>,
  campaignId: number
): Promise<Record<number, TaskListProgressSummary>> {
  const numericCampaignId = Number(campaignId);
  const result: Record<number, TaskListProgressSummary> = {};
  if (!Number.isFinite(numericCampaignId)) return result;

  // 1. Task lists in this campaign.
  const { data: lists } = await client
    .from("campaign_task_lists")
    .select("task_list_id, activity_id")
    .eq("campaign_id", numericCampaignId);

  if (!lists || lists.length === 0) return result;

  const taskListIds = lists.map((l) => l.task_list_id as number);

  // 2. Items grouped by task_list_id.
  const { data: items } = await client
    .from("campaign_task_list_items")
    .select("task_list_id, worker_id")
    .in("task_list_id", taskListIds);

  const itemsByList = new Map<number, number[]>();
  for (const it of items ?? []) {
    const id = it.task_list_id as number;
    if (!itemsByList.has(id)) itemsByList.set(id, []);
    itemsByList.get(id)!.push(it.worker_id as number);
  }

  // 3. Tokens grouped by task_list_id.
  const { data: tokens } = await client
    .from("campaign_leader_tokens")
    .select("token_id, task_list_id")
    .in("task_list_id", taskListIds);

  const tokensByList = new Map<number, number[]>();
  const listByToken = new Map<number, number>();
  for (const t of (tokens ?? []) as MinimalToken[]) {
    const id = t.task_list_id;
    if (!tokensByList.has(id)) tokensByList.set(id, []);
    tokensByList.get(id)!.push(t.token_id);
    listByToken.set(t.token_id, id);
  }

  // 4. Events for all those tokens (single SELECT).
  const allTokenIds = Array.from(listByToken.keys());
  const eventsByList = new Map<number, MinimalEvent[]>();
  if (allTokenIds.length > 0) {
    const { data: ev } = await client
      .from("campaign_leader_form_events")
      .select("token_id, event_type, worker_id, created_at")
      .in("token_id", allTokenIds);

    for (const e of ev ?? []) {
      const tid = e.token_id as number;
      const listId = listByToken.get(tid);
      if (listId == null) continue;
      const arr = eventsByList.get(listId) ?? [];
      arr.push({
        event_type: e.event_type as string,
        worker_id: e.worker_id as number | null,
        created_at: e.created_at as string,
      });
      eventsByList.set(listId, arr);
    }
  }

  // 5. Fallback rated-from-CAR: gather all (activity_id, worker_id) pairs we need.
  type ActivityKey = number;
  const activityToList = new Map<ActivityKey, number>();
  const wantedActivities: number[] = [];
  for (const l of lists) {
    if (l.activity_id != null) {
      const aid = l.activity_id as number;
      activityToList.set(aid, l.task_list_id as number);
      wantedActivities.push(aid);
    }
  }

  const ratedByList = new Map<number, Set<number>>();
  if (wantedActivities.length > 0) {
    const { data: cars } = await client
      .from("campaign_activity_ratings")
      .select("activity_id, worker_id")
      .in("activity_id", wantedActivities)
      .eq("source", "leader_form");

    for (const r of cars ?? []) {
      const aid = r.activity_id as number;
      const listId = activityToList.get(aid);
      if (listId == null) continue;
      const items = itemsByList.get(listId) ?? [];
      const wid = r.worker_id as number;
      // Only count workers actually on the list.
      if (!items.includes(wid)) continue;
      const set = ratedByList.get(listId) ?? new Set<number>();
      set.add(wid);
      ratedByList.set(listId, set);
    }
  }

  // 6. Build summaries.
  for (const l of lists) {
    const id = l.task_list_id as number;
    const events = eventsByList.get(id) ?? [];
    const ratedFromCar = ratedByList.get(id) ?? new Set<number>();
    result[id] = summariseEvents({
      taskListId: id,
      workersTotal: (itemsByList.get(id) ?? []).length,
      events,
      ratedFromCar,
    });
  }

  // Also emit zero-summaries for lists with no events / items so callers can
  // safely look up every id.
  for (const id of taskListIds) {
    if (!result[id]) {
      result[id] = {
        ...EMPTY_SUMMARY(id),
        workers_total: (itemsByList.get(id) ?? []).length,
      };
    }
  }

  return result;
}

/**
 * Pure summarisation step — given the events + items + CAR fallback for a
 * single task list, produce the summary. Extracted so single + batch paths
 * share identical semantics.
 */
function summariseEvents({
  taskListId,
  workersTotal,
  events,
  ratedFromCar,
}: {
  taskListId: number;
  workersTotal: number;
  events: MinimalEvent[];
  ratedFromCar: Set<number>;
}): TaskListProgressSummary {
  const ratedWorkers = new Set<number>(ratedFromCar);
  const existingAddedWorkers = new Set<number>();
  const editedWorkers = new Set<number>();
  const membershipWorkers = new Set<number>();
  let prospectiveCount = 0;
  let lastEventAt: string | null = null;
  let lastAuthSuccessAt: string | null = null;

  for (const e of events) {
    if (!lastEventAt || e.created_at > lastEventAt) lastEventAt = e.created_at;

    switch (e.event_type) {
      case "rating_saved":
        if (e.worker_id != null) ratedWorkers.add(e.worker_id);
        break;
      case "existing_added":
        if (e.worker_id != null) existingAddedWorkers.add(e.worker_id);
        break;
      case "prospective_added":
        prospectiveCount += 1;
        break;
      case "worker_edited":
        if (e.worker_id != null) editedWorkers.add(e.worker_id);
        break;
      case "membership_changed":
        if (e.worker_id != null) membershipWorkers.add(e.worker_id);
        break;
      case "auth_success":
        if (!lastAuthSuccessAt || e.created_at > lastAuthSuccessAt) {
          lastAuthSuccessAt = e.created_at;
        }
        break;
      default:
        break;
    }
  }

  return {
    task_list_id: taskListId,
    workers_total: workersTotal,
    workers_rated: ratedWorkers.size,
    existing_added: existingAddedWorkers.size,
    prospective_added: prospectiveCount,
    workers_edited: editedWorkers.size,
    membership_changed: membershipWorkers.size,
    last_event_at: lastEventAt,
    last_auth_success_at: lastAuthSuccessAt,
  };
}
