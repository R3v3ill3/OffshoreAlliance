import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import { generateRawLeaderToken, hashLeaderToken } from "@/lib/campaign/token-crypto";
import { hashPassword } from "@/lib/campaign/password-crypto";
import { tokenIssueRequestSchema } from "@/lib/validation/campaign-leader";

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be JSON: { password, expiresInHours }" },
        { status: 400 },
      );
    }

    const parsed = tokenIssueRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { password, expiresInHours } = parsed.data;

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
    const { hash: password_hash, algo: password_algo } = await hashPassword(password);

    const expiresAtDate = new Date(Date.now() + expiresInHours * 3600 * 1000);
    const expires_at = expiresAtDate.toISOString();

    const { error: insError } = await serverClient.from("campaign_leader_tokens").insert({
      task_list_id: Number(taskListId),
      token_hash,
      password_hash,
      // Phase 1's migration set the column DEFAULT to 'argon2id'. Phase 2 always uses
      // bcrypt, so we explicitly write the algo rather than rely on the default.
      password_algo,
      issued_by: staff.user.id,
      expires_at,
      failed_attempts: 0,
      locked_until: null,
    });

    if (insError) throw insError;

    const origin = appOrigin(request);
    const path = `/leader/task/${raw}`;
    const url = origin ? `${origin}${path}` : path;

    // Never echo password back; the staff caller already has it.
    return NextResponse.json({
      token: raw,
      url,
      expires_at,
      expires_in_hours: expiresInHours,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to issue token" }, { status: 500 });
  }
}
