import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import { generateRawLeaderToken, hashLeaderToken } from "@/lib/campaign/token-crypto";

function appOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (!host) return "";
  return `${proto}://${host}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskListId: string }> }
) {
  try {
    const { id: campaignId, taskListId } = await params;
    const serverClient = await createClient();
    const staff = await requireStaffUser(serverClient);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let expiresInDays: number | undefined;
    try {
      const body = await request.json();
      if (typeof body?.expiresInDays === "number" && body.expiresInDays > 0 && body.expiresInDays <= 365) {
        expiresInDays = body.expiresInDays;
      }
    } catch {
      /* empty body */
    }

    const { data: taskList, error: tlError } = await serverClient
      .from("campaign_task_lists")
      .select("task_list_id, campaign_id")
      .eq("task_list_id", taskListId)
      .eq("campaign_id", campaignId)
      .single();

    if (tlError || !taskList) {
      return NextResponse.json({ error: "Task list not found" }, { status: 404 });
    }

    const raw = generateRawLeaderToken();
    const token_hash = hashLeaderToken(raw);

    const expires_at =
      expiresInDays != null
        ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
        : null;

    const { error: insError } = await serverClient.from("campaign_leader_tokens").insert({
      task_list_id: Number(taskListId),
      token_hash,
      expires_at,
    });

    if (insError) throw insError;

    const origin = appOrigin(request);
    const path = `/leader/task/${raw}`;
    const url = origin ? `${origin}${path}` : path;

    return NextResponse.json({ token: raw, url, expires_at });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to issue token" }, { status: 500 });
  }
}
