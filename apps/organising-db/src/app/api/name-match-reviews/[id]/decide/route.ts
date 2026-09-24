import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncWorkersToMatchingCampaigns } from "@/lib/workers/sync-campaign-universe";

/**
 * POST /api/name-match-reviews/[id]/decide (DA0.3 plan §2.4.5).
 *
 * Body: { action: 'confirm' | 'override' | 'create' | 'reject' | 'reopen',
 *         employer_id?, worksite_id?, create?, notes? }
 * Response: { review, aliasWritten, backfilledWorkerIds, siblingsResolved,
 *             universeSyncError? }
 * 401 unauthenticated · 403 non-admin · 404 unknown review id · 409 conflicts
 * (unique name, alias ambiguity, target not among the proposals, target
 * employer / worksite no longer exists, review already decided) with the
 * RPC's message verbatim · 400 bad payload.
 *
 * The RPC runs on the USER client so `auth.uid()` / `is_admin()` apply
 * inside `decide_name_match()`; the campaign-universe sync then runs with
 * the service role for the back-filled workers, as the worker import does.
 */

const ACTIONS = new Set(["confirm", "override", "create", "reject", "reopen"]);

interface DecideBody {
  action?: string;
  employer_id?: number | null;
  worksite_id?: number | null;
  create?: Record<string, unknown> | null;
  notes?: string | null;
}

interface DecideResult {
  review: Record<string, unknown>;
  alias_written: boolean;
  backfilled_worker_ids: number[];
  siblings_resolved: number;
}

function statusForRpcError(message: string): number {
  const m = message.toLowerCase();
  if (m.includes("only admins")) return 403;
  // "name_match_reviews row N not found" is the review itself (404); a
  // missing target ("employer N not found") is a conflict with the reviewer's
  // choice, not a missing resource (409).
  if (m.startsWith("name_match_reviews row") && m.includes("not found")) return 404;
  if (
    m.includes("not found") ||
    m.includes("already exists") ||
    m.includes("already points at") ||
    m.includes("reopen it first") ||
    m.includes("only a decided review can be reopened") ||
    m.includes("not one of the proposals")
  )
    return 409;
  if (m.includes("requires") || m.includes("unsupported action") || m.includes("payload must")) return 400;
  return 500;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ success: false, error: "Invalid review id" }, { status: 400 });
  }

  let body: DecideBody;
  try {
    body = (await request.json()) as DecideBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.action || !ACTIONS.has(body.action)) {
    return NextResponse.json(
      { success: false, error: "action must be confirm, override, create, reject or reopen" },
      { status: 400 }
    );
  }

  const payload = {
    id,
    action: body.action,
    employer_id: body.employer_id ?? null,
    worksite_id: body.worksite_id ?? null,
    create: body.create && typeof body.create === "object" ? body.create : null,
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
  };

  const { data, error } = await supabase.rpc("decide_name_match", { payload });
  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: statusForRpcError(error.message) }
    );
  }
  const result = data as DecideResult;
  const backfilledWorkerIds = Array.isArray(result?.backfilled_worker_ids)
    ? result.backfilled_worker_ids.map(Number).filter((n) => Number.isFinite(n))
    : [];

  let universeSyncError: string | undefined;
  if (backfilledWorkerIds.length > 0) {
    try {
      await syncWorkersToMatchingCampaigns(createAdminClient(), backfilledWorkerIds);
    } catch (syncError) {
      universeSyncError = syncError instanceof Error ? syncError.message : String(syncError);
    }
  }

  return NextResponse.json({
    success: true,
    review: result?.review ?? null,
    aliasWritten: result?.alias_written === true,
    backfilledWorkerIds,
    siblingsResolved: Number(result?.siblings_resolved ?? 0),
    ...(universeSyncError ? { universeSyncError } : {}),
  });
}
