import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  matchRows,
  nameKey,
  normaliseEmail,
  normalisePhone,
  type MatchableWorker,
} from "@/lib/import/worker-matching";
import type {
  ParticipationMatchCandidate,
  ParticipationMatchResponse,
} from "@/lib/import/participation-import-shared";

const matchSchema = z.object({
  rows: z
    .array(
      z.object({
        key: z.string().min(1),
        emails: z.array(z.string()).max(5),
        phones: z.array(z.string()).max(5),
        firstName: z.string(),
        lastName: z.string(),
      })
    )
    .min(1)
    .max(5000),
  activity_id: z.number().int().positive().nullish(),
});

export async function POST(
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
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role === "viewer") {
    return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
  }

  let body: z.infer<typeof matchSchema>;
  try {
    body = matchSchema.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid request body";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  // Normalised lookup inputs across every row.
  const emailSet = new Set<string>();
  const phoneSet = new Set<string>();
  const nameKeySet = new Set<string>();
  for (const row of body.rows) {
    for (const e of row.emails) {
      const n = normaliseEmail(e);
      if (n) emailSet.add(n);
    }
    for (const p of row.phones) {
      const n = normalisePhone(p);
      if (n) phoneSet.add(n);
    }
    const nk = nameKey(row.firstName, row.lastName);
    if (nk) nameKeySet.add(nk);
  }

  // One round trip: candidate workers across the whole DB.
  const { data: candidates, error: rpcErr } = await supabase.rpc("match_workers_for_import", {
    p_emails: Array.from(emailSet),
    p_phones: Array.from(phoneSet),
    p_name_keys: Array.from(nameKeySet),
  });
  if (rpcErr) {
    return NextResponse.json(
      { success: false, error: `Candidate lookup failed: ${rpcErr.message}` },
      { status: 500 }
    );
  }

  const candidateRows = (candidates ?? []) as Array<{
    worker_id: number;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
    email: string | null;
    phone: string | null;
  }>;
  const candidateIds = candidateRows.map((c) => c.worker_id);

  // Which candidates are already in this campaign's workforce?
  const inCampaign = new Set<number>();
  if (candidateIds.length > 0) {
    const { data: memberships, error: memErr } = await supabase
      .from("campaign_worker_membership")
      .select("worker_id")
      .eq("campaign_id", campaignId)
      .in("worker_id", candidateIds);
    if (memErr) {
      return NextResponse.json(
        { success: false, error: `Membership lookup failed: ${memErr.message}` },
        { status: 500 }
      );
    }
    for (const m of memberships ?? []) inCampaign.add(m.worker_id);
  }

  // Existing ratings on the target assessment (for conflict display).
  const existingByWorker = new Map<number, { rating: number | null; binary_value: string | null }>();
  if (body.activity_id && candidateIds.length > 0) {
    const { data: ratings, error: ratErr } = await supabase
      .from("campaign_activity_ratings")
      .select("worker_id, rating, binary_value")
      .eq("activity_id", body.activity_id)
      .eq("rating_phase", "actual")
      .is("event_id", null)
      .in("worker_id", candidateIds);
    if (ratErr) {
      return NextResponse.json(
        { success: false, error: `Rating lookup failed: ${ratErr.message}` },
        { status: 500 }
      );
    }
    for (const r of ratings ?? []) {
      existingByWorker.set(r.worker_id, { rating: r.rating, binary_value: r.binary_value });
    }
  }

  const matchable: MatchableWorker[] = candidateRows.map((c) => ({
    worker_id: c.worker_id,
    first_name: c.first_name,
    last_name: c.last_name,
    preferred_name: c.preferred_name,
    email: c.email,
    phone: c.phone,
    in_campaign: inCampaign.has(c.worker_id),
  }));

  const results = matchRows(
    body.rows.map((r) => ({
      key: r.key,
      emails: r.emails,
      phones: r.phones,
      firstName: r.firstName,
      lastName: r.lastName,
    })),
    matchable
  );

  const response: ParticipationMatchResponse = {
    success: true,
    results: results.map((r) => ({
      key: r.key,
      disposition: r.disposition,
      candidates: r.candidates.map((c): ParticipationMatchCandidate => {
        const existing = existingByWorker.get(c.worker.worker_id);
        return {
          worker_id: c.worker.worker_id,
          first_name: c.worker.first_name,
          last_name: c.worker.last_name,
          preferred_name: c.worker.preferred_name ?? null,
          email: c.worker.email,
          phone: c.worker.phone,
          in_campaign: c.worker.in_campaign,
          method: c.method,
          existing_rating: existing?.rating ?? null,
          existing_binary_value: existing?.binary_value ?? null,
        };
      }),
    })),
  };

  return NextResponse.json(response);
}
