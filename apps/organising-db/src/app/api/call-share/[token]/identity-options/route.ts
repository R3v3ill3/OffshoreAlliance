import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveCallShareTokenRow,
  tokenStatusResponse,
} from "@/lib/campaign/call-share-api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const admin = createAdminClient();
    const outcome = await resolveCallShareTokenRow(admin, rawToken);
    const errResp = tokenStatusResponse(outcome);
    if (errResp || outcome.kind !== "ok") return errResp!;

    const { data: list, error: listErr } = await admin
      .from("call_lists")
      .select("campaign_id")
      .eq("list_id", outcome.row.list_id)
      .maybeSingle();
    if (listErr) throw listErr;
    if (!list) return NextResponse.json({ error: "Call list not found" }, { status: 404 });

    const { data, error } = await admin
      .from("campaign_worker_membership")
      .select(
        `worker_id,
         worker:workers(worker_id, first_name, last_name, occupation)`,
      )
      .eq("campaign_id", list.campaign_id)
      .limit(20);
    if (error) throw error;

    const workers = (data ?? []).map((row) => {
      const raw = (row as { worker: unknown }).worker;
      const worker = (Array.isArray(raw) ? raw[0] : raw) as
        | { worker_id: number; first_name: string; last_name: string; occupation: string | null }
        | null;
      return worker
        ? {
            worker_id: worker.worker_id,
            first_name: worker.first_name,
            last_name: worker.last_name,
            occupation: worker.occupation,
          }
        : null;
    }).filter((row): row is NonNullable<typeof row> => row != null);

    return NextResponse.json({ workers });
  } catch (error) {
    console.error("Call share identity options error:", error);
    return NextResponse.json({ error: "Failed to load identity options" }, { status: 500 });
  }
}
