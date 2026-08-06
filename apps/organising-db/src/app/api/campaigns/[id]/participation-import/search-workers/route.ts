import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_RESULTS = 20;

export interface WorkerSearchResult {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  in_campaign: boolean;
}

/** Strip characters that break PostgREST or-filter syntax / ilike patterns. */
function sanitiseQuery(raw: string): string {
  return raw.replace(/[%*,()]/g, " ").trim();
}

/**
 * Manual worker search for the import match step: find a worker by name,
 * email, or phone. scope=campaign (default) searches this campaign's
 * workforce; scope=all searches the whole worker database.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ success: false, error: "Invalid campaign ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = sanitiseQuery(searchParams.get("q") ?? "");
  const scope = searchParams.get("scope") === "all" ? "all" : "campaign";
  if (q.length < 2) {
    return NextResponse.json({ success: true, results: [] });
  }

  // Match each token against first name, last name, email, or phone so
  // "ste smi" finds "Stephen Smith".
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 3);
  const orFilterFor = (token: string) =>
    `first_name.ilike.*${token}*,last_name.ilike.*${token}*,preferred_name.ilike.*${token}*,email.ilike.*${token}*,phone.ilike.*${token}*`;

  let workers: {
    worker_id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  }[] = [];

  if (scope === "campaign") {
    let query = supabase
      .from("campaign_worker_membership")
      .select(
        "worker:workers!inner(worker_id, first_name, last_name, email, phone)"
      )
      .eq("campaign_id", campaignId)
      .limit(MAX_RESULTS);
    for (const token of tokens) {
      query = query.or(orFilterFor(token), { referencedTable: "workers" });
    }
    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { success: false, error: `Search failed: ${error.message}` },
        { status: 500 }
      );
    }
    workers = (data ?? [])
      .map((row) => (row as unknown as { worker: (typeof workers)[number] }).worker)
      .filter(Boolean);
  } else {
    let query = supabase
      .from("workers")
      .select("worker_id, first_name, last_name, email, phone")
      .limit(MAX_RESULTS);
    for (const token of tokens) {
      query = query.or(orFilterFor(token));
    }
    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { success: false, error: `Search failed: ${error.message}` },
        { status: 500 }
      );
    }
    workers = data ?? [];
  }

  // in_campaign flag for the picker badge.
  const inCampaign = new Set<number>();
  if (scope === "campaign") {
    for (const w of workers) inCampaign.add(w.worker_id);
  } else if (workers.length > 0) {
    const { data: memberships } = await supabase
      .from("campaign_worker_membership")
      .select("worker_id")
      .eq("campaign_id", campaignId)
      .in(
        "worker_id",
        workers.map((w) => w.worker_id)
      );
    for (const m of memberships ?? []) inCampaign.add(m.worker_id);
  }

  const results: WorkerSearchResult[] = workers.map((w) => ({
    worker_id: w.worker_id,
    first_name: w.first_name,
    last_name: w.last_name,
    email: w.email,
    phone: w.phone,
    in_campaign: inCampaign.has(w.worker_id),
  }));

  return NextResponse.json({ success: true, results });
}
