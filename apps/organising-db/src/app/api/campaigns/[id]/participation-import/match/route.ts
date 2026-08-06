import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  lastNameKey,
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
        resolved_worker_id: z.number().int().positive().nullish(),
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

  // Rows pre-resolved by AN person id skip fuzzy matching entirely.
  const resolvedRows = body.rows.filter((r) => r.resolved_worker_id != null);
  const unresolvedRows = body.rows.filter((r) => r.resolved_worker_id == null);

  // Normalised lookup inputs across the unresolved rows.
  const emailSet = new Set<string>();
  const phoneSet = new Set<string>();
  const nameKeySet = new Set<string>();
  const lastNameSet = new Set<string>();
  for (const row of unresolvedRows) {
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
    const lk = lastNameKey(row.lastName);
    if (lk) lastNameSet.add(lk);
  }

  // One round trip: candidate workers across the whole DB (surname hits
  // feed the tier-4 suggestion list, never auto-matches).
  const { data: candidates, error: rpcErr } = await supabase.rpc("match_workers_for_import", {
    p_emails: Array.from(emailSet),
    p_phones: Array.from(phoneSet),
    p_name_keys: Array.from(nameKeySet),
    p_last_names: Array.from(lastNameSet),
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

  // Fetch details for pre-resolved workers (AN sync mode).
  const resolvedWorkerIds = Array.from(
    new Set(resolvedRows.map((r) => r.resolved_worker_id as number))
  );
  const resolvedWorkers = new Map<
    number,
    { worker_id: number; first_name: string; last_name: string; preferred_name: string | null; email: string | null; phone: string | null }
  >();
  if (resolvedWorkerIds.length > 0) {
    const { data: workers, error: wErr } = await supabase
      .from("workers")
      .select("worker_id, first_name, last_name, preferred_name, email, phone")
      .in("worker_id", resolvedWorkerIds);
    if (wErr) {
      return NextResponse.json(
        { success: false, error: `Worker lookup failed: ${wErr.message}` },
        { status: 500 }
      );
    }
    for (const w of workers ?? []) resolvedWorkers.set(w.worker_id, w);
  }

  const candidateIds = Array.from(
    new Set([...candidateRows.map((c) => c.worker_id), ...resolvedWorkerIds])
  );

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

  const matched = matchRows(
    unresolvedRows.map((r) => ({
      key: r.key,
      emails: r.emails,
      phones: r.phones,
      firstName: r.firstName,
      lastName: r.lastName,
    })),
    matchable
  );
  const matchedByKey = new Map(matched.map((m) => [m.key, m]));

  const toCandidate = (
    worker: {
      worker_id: number;
      first_name: string;
      last_name: string;
      preferred_name?: string | null;
      email: string | null;
      phone: string | null;
    },
    method: ParticipationMatchCandidate["method"],
    inCampaignFlag: boolean
  ): ParticipationMatchCandidate => {
    const existing = existingByWorker.get(worker.worker_id);
    return {
      worker_id: worker.worker_id,
      first_name: worker.first_name,
      last_name: worker.last_name,
      preferred_name: worker.preferred_name ?? null,
      email: worker.email,
      phone: worker.phone,
      in_campaign: inCampaignFlag,
      method,
      existing_rating: existing?.rating ?? null,
      existing_binary_value: existing?.binary_value ?? null,
    };
  };

  const response: ParticipationMatchResponse = {
    success: true,
    results: body.rows.map((row) => {
      if (row.resolved_worker_id != null) {
        const worker = resolvedWorkers.get(row.resolved_worker_id);
        if (worker) {
          return {
            key: row.key,
            disposition: "auto" as const,
            candidates: [toCandidate(worker, "an_id", inCampaign.has(worker.worker_id))],
          };
        }
        // Stored AN id points at a deleted worker — treat as unmatched.
        return { key: row.key, disposition: "unmatched" as const, candidates: [] };
      }
      const m = matchedByKey.get(row.key);
      return {
        key: row.key,
        disposition: m?.disposition ?? ("unmatched" as const),
        candidates: (m?.candidates ?? []).map((c) =>
          toCandidate(c.worker, c.method, c.worker.in_campaign)
        ),
      };
    }),
  };

  return NextResponse.json(response);
}
