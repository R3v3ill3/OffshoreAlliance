import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import {
  getTaskListProgressBatch,
  type TaskListProgressSummary,
} from "@/lib/campaign/task-list-progress";

/**
 * GET /api/campaigns/:id/task-lists/progress-batch
 *
 * Phase 6 — returns `Record<task_list_id, TaskListProgressSummary>` for every
 * task list in the campaign. The campaign-task-lists page calls this once on
 * mount and refetches periodically so each row's progress badge can be
 * rendered in a single round trip.
 *
 * Auth: admin|user.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    const supabase = await createClient();
    const staff = await requireStaffUser(supabase);
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summaries = await getTaskListProgressBatch(supabase, campaignId);
    // Return as a plain object for trivial JSON shape.
    const obj: Record<number, TaskListProgressSummary> = summaries;
    return NextResponse.json(obj);
  } catch (e) {
    console.error("progress-batch route failed", e);
    return NextResponse.json(
      { error: "Failed to load progress batch" },
      { status: 500 }
    );
  }
}
