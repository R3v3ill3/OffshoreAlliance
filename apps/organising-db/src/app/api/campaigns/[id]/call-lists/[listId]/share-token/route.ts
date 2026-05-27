import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import { generateRawLeaderToken, hashLeaderToken } from "@/lib/campaign/token-crypto";
import { hashPassword } from "@/lib/campaign/password-crypto";
import { shareTokenIssueSchema } from "@/lib/validation/call-share";

function appOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> },
) {
  try {
    const { id, listId } = await params;
    const campaignId = Number.parseInt(id, 10);
    const numericListId = Number.parseInt(listId, 10);
    if (!Number.isFinite(campaignId) || !Number.isFinite(numericListId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const serverClient = await createClient();
    const staff = await requireStaffUser(serverClient);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be JSON: { password, expiresInHours, leaderWorkerId? }" },
        { status: 400 },
      );
    }

    const parsed = shareTokenIssueSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { password, expiresInHours, leaderWorkerId } = parsed.data;

    const { data: list, error: listError } = await serverClient
      .from("call_lists")
      .select("list_id, campaign_id, script_id, total_items, completed_items")
      .eq("list_id", numericListId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (listError) throw listError;
    if (!list) {
      return NextResponse.json({ error: "Call list not found" }, { status: 404 });
    }
    if ((list.total_items ?? 0) - (list.completed_items ?? 0) <= 0) {
      return NextResponse.json({ error: "Call list has no remaining contacts" }, { status: 400 });
    }

    const { count: pendingCount, error: pendingErr } = await serverClient
      .from("call_list_items")
      .select("item_id", { count: "exact", head: true })
      .eq("list_id", numericListId)
      .in("status", ["pending", "deferred"]);
    if (pendingErr) throw pendingErr;
    if ((pendingCount ?? 0) < 1) {
      return NextResponse.json({ error: "Call list has no pending contacts" }, { status: 400 });
    }

    if (leaderWorkerId != null) {
      const { data: membership, error: membershipErr } = await serverClient
        .from("campaign_worker_membership")
        .select("worker_id")
        .eq("campaign_id", campaignId)
        .eq("worker_id", leaderWorkerId)
        .maybeSingle();
      if (membershipErr) throw membershipErr;
      if (!membership) {
        return NextResponse.json({ error: "Leader must be in this campaign" }, { status: 400 });
      }
    }

    const raw = generateRawLeaderToken();
    const token_hash = hashLeaderToken(raw);
    const { hash: password_hash, algo: password_algo } = await hashPassword(password);
    const expires_at = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

    const { error: insertErr } = await serverClient.from("call_share_tokens").insert({
      list_id: numericListId,
      token_hash,
      password_hash,
      password_algo,
      issued_by: staff.user.id,
      leader_worker_id: leaderWorkerId ?? null,
      expires_at,
      failed_attempts: 0,
      locked_until: null,
    });
    if (insertErr) throw insertErr;

    const path = `/call/${raw}`;
    const origin = appOrigin(request);

    return NextResponse.json({
      token: raw,
      url: origin ? `${origin}${path}` : path,
      expires_at,
      expires_in_hours: expiresInHours,
    });
  } catch (error) {
    console.error("Issue call share token error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to issue token" },
      { status: 500 },
    );
  }
}
