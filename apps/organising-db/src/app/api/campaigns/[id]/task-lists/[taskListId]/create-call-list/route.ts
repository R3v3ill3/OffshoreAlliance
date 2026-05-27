import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";

/**
 * POST /api/campaigns/[id]/task-lists/[taskListId]/create-call-list
 *
 * Creates a standalone call_list from the workers on a campaign task list,
 * including only those with a phone number on record.
 *
 * Returns { list_id, added, skipped_no_phone } on success.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskListId: string }> },
) {
  try {
    const { id, taskListId } = await params;
    const campaignId = Number.parseInt(id, 10);
    const numericTaskListId = Number.parseInt(taskListId, 10);

    if (!Number.isFinite(campaignId) || !Number.isFinite(numericTaskListId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const serverClient = await createClient();
    const staff = await requireStaffUser(serverClient);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify the task list belongs to this campaign.
    const { data: taskList, error: tlError } = await serverClient
      .from("campaign_task_lists")
      .select("task_list_id, campaign_id, title")
      .eq("task_list_id", numericTaskListId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (tlError) throw tlError;
    if (!taskList) {
      return NextResponse.json({ error: "Task list not found" }, { status: 404 });
    }

    // Fetch workers from this task list, joined to their phone number.
    const { data: items, error: itemsError } = await serverClient
      .from("campaign_task_list_items")
      .select("worker_id, workers!inner(worker_id, phone)")
      .eq("task_list_id", numericTaskListId);

    if (itemsError) throw itemsError;

    type ItemRow = {
      worker_id: number;
      workers: { worker_id: number; phone: string | null } | { worker_id: number; phone: string | null }[];
    };
    const rows = (items ?? []) as ItemRow[];
    const total = rows.length;

    const withPhone = rows.filter((r) => {
      const w = Array.isArray(r.workers) ? r.workers[0] : r.workers;
      return w?.phone && w.phone.trim() !== "";
    });
    const skippedNoPhone = total - withPhone.length;

    if (withPhone.length === 0) {
      return NextResponse.json(
        { error: "No workers on this task list have a phone number on record" },
        { status: 400 },
      );
    }

    // Create the call list.
    const listName = `Call — ${taskList.title}`;
    const { data: newList, error: listInsertErr } = await serverClient
      .from("call_lists")
      .insert({
        campaign_id: campaignId,
        name: listName,
        status: "active",
        priority_strategy: "sequential",
        total_items: withPhone.length,
        completed_items: 0,
        source_filters: { source: "task_list", task_list_id: numericTaskListId },
      })
      .select("list_id")
      .single();

    if (listInsertErr) throw listInsertErr;
    const listId = newList.list_id;

    // Populate call_list_items from the task list workers.
    const callListItems = withPhone.map((r, i) => ({
      list_id: listId,
      worker_id: r.worker_id,
      sort_order: i,
      priority_score: 0,
      status: "pending" as const,
    }));

    const { error: itemsInsertErr } = await serverClient
      .from("call_list_items")
      .insert(callListItems);

    if (itemsInsertErr) throw itemsInsertErr;

    return NextResponse.json({
      list_id: listId,
      added: withPhone.length,
      skipped_no_phone: skippedNoPhone,
    });
  } catch (error) {
    console.error("create-call-list from task list error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create call list" },
      { status: 500 },
    );
  }
}
