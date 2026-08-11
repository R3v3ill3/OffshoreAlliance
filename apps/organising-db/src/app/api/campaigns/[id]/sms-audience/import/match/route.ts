import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  matchRows,
  type MatchIdentityRow,
  type MatchableWorker,
} from "@/lib/import/worker-matching";

const rowSchema = z.object({
  key: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string(),
  phone_e164: z.string(),
  email: z.string().nullable().optional(),
});

const schema = z.object({
  rows: z.array(rowSchema).min(1).max(10_000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json(
      { success: false, error: "Invalid campaign ID" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role === "viewer") {
    return NextResponse.json(
      { success: false, error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  let body: z.infer<typeof schema>;
  try {
    const raw = await request.json();
    body = schema.parse(raw);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid request body";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }

  try {
    // Load campaign workforce + wider workers for matching
    const { data: campaignWorkers, error: cwErr } = await supabase
      .from("campaign_worker_membership")
      .select("worker_id")
      .eq("campaign_id", campaignId);
    if (cwErr) throw cwErr;

    const campaignWorkerIds = new Set(
      (campaignWorkers ?? []).map((r) => r.worker_id as number)
    );

    // Load all workers with any phone or email for matching
    const { data: allWorkers, error: wErr } = await supabase
      .from("workers")
      .select(
        "worker_id, first_name, last_name, preferred_name, email, phone"
      );
    if (wErr) throw wErr;

    const matchableWorkers: MatchableWorker[] = (allWorkers ?? []).map(
      (w) => ({
        worker_id: w.worker_id as number,
        first_name: w.first_name as string,
        last_name: w.last_name as string,
        preferred_name: w.preferred_name as string | null,
        email: w.email as string | null,
        phone: w.phone as string | null,
        in_campaign: campaignWorkerIds.has(w.worker_id as number),
      })
    );

    const identityRows: MatchIdentityRow[] = body.rows.map((r) => ({
      key: r.key,
      emails: r.email ? [r.email] : [],
      phones: [r.phone, r.phone_e164].filter(Boolean),
      firstName: r.first_name,
      lastName: r.last_name,
    }));

    const results = matchRows(identityRows, matchableWorkers);

    return NextResponse.json({
      success: true,
      results,
      summary: {
        auto: results.filter((r) => r.disposition === "auto").length,
        confirm: results.filter((r) => r.disposition === "confirm").length,
        review: results.filter((r) => r.disposition === "review").length,
        unmatched: results.filter((r) => r.disposition === "unmatched").length,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
