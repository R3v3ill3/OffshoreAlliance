/**
 * DELETE /api/campaigns/[id]/task-lists/[taskListId]
 *
 * Permanently deletes a single leader task list. Uses the service-role admin
 * client for the mutations because campaign_task_lists has an admin-only DELETE
 * RLS policy. Authentication is validated via the regular server client first.
 *
 * --- Upstream / downstream considerations ---
 *
 * campaign_worker_lists.fired_task_list_id is a plain integer with NO FK, so it
 * must be nulled manually before deleting the task list.
 *
 * DB CASCADE handles: campaign_task_list_items, campaign_leader_tokens,
 * campaign_leader_form_events.
 * DB SET NULL handles: campaign_prospective_workers.task_list_id.
 * Ratings written by leaders (campaign_activity_ratings) live on the linked
 * activity and are intentionally left in place.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffUser } from "@/lib/campaign/auth-api";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskListId: string }> }
) {
  try {
    const { id: campaignId, taskListId } = await params;
    const cid = parseInt(campaignId, 10);
    const tlid = parseInt(taskListId, 10);
    if (!Number.isFinite(cid) || !Number.isFinite(tlid)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const serverClient = await createClient();
    const staff = await requireStaffUser(serverClient);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify the task list belongs to this campaign before touching anything.
    const { data: taskList, error: tlError } = await serverClient
      .from("campaign_task_lists")
      .select("task_list_id, campaign_id")
      .eq("task_list_id", tlid)
      .maybeSingle();
    if (tlError) throw tlError;
    if (!taskList || taskList.campaign_id !== cid) {
      return NextResponse.json({ error: "Task list not found" }, { status: 404 });
    }

    const admin = createAdminClient();

    // 1. Clear the no-FK reference in campaign_worker_lists.
    await admin
      .from("campaign_worker_lists")
      .update({ fired_task_list_id: null })
      .eq("fired_task_list_id", tlid);

    // 2. Delete the task list (DB CASCADE removes items, tokens, form events).
    const { error: delErr } = await admin
      .from("campaign_task_lists")
      .delete()
      .eq("task_list_id", tlid)
      .eq("campaign_id", cid);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE task-list error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete task list",
      },
      { status: 500 }
    );
  }
}
