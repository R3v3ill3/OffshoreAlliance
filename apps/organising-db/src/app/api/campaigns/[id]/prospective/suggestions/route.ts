import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";

/**
 * GET /api/campaigns/:id/prospective/suggestions
 *
 * Phase 5 — review queue. Returns suggested existing-worker matches for every
 * pending `campaign_prospective_workers` row in this campaign so the review tab
 * can render them inline without N round trips.
 *
 * Match strategy (per prospective row, scored highest first; cap 3 results):
 *   - exact email match (case-insensitive)         → score 100
 *   - exact phone match (digits-only normalised)   → score 90
 *   - first AND last name ILIKE substring match    → score 70
 *   - last name only ILIKE substring match         → score 40
 *
 * We pull a single broad page of `workers` (active only) per request and
 * compute matches in JS — at expected volumes (a few dozen pending entries
 * against a workforce of a few thousand) this is comfortably fast and
 * eliminates the per-row query fan-out.
 *
 * Response shape:
 *   {
 *     suggestions: {
 *       [prospective_id]: Array<{
 *         worker_id, first_name, last_name, email, phone,
 *         employer_id, score, match_reason
 *       }>
 *     }
 *   }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json(
      { error: "Invalid campaign id" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const staff = await requireStaffUser(supabase);
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Pending prospective rows for this campaign.
  const { data: pending, error: pErr } = await supabase
    .from("campaign_prospective_workers")
    .select("prospective_id, first_name, last_name, email, phone")
    .eq("campaign_id", campaignId)
    .eq("review_status", "pending");

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const suggestions: Record<
    number,
    Array<{
      worker_id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      employer_id: number | null;
      score: number;
      match_reason: string;
    }>
  > = {};

  if (!pending || pending.length === 0) {
    return NextResponse.json({ suggestions });
  }

  // 2. Pull active workers — id, name, email, phone, employer_id. RLS will scope
  //    naturally for the staff caller.
  const { data: workersData, error: wErr } = await supabase
    .from("workers")
    .select("worker_id, first_name, last_name, email, phone, employer_id")
    .eq("is_active", true);

  if (wErr) {
    return NextResponse.json({ error: wErr.message }, { status: 500 });
  }

  type WorkerLite = {
    worker_id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    employer_id: number | null;
  };
  const workers: WorkerLite[] = (workersData ?? []) as WorkerLite[];

  // Build lookup tables once.
  const byEmail = new Map<string, WorkerLite[]>();
  const byPhone = new Map<string, WorkerLite[]>();

  function digitsOnly(p: string | null | undefined): string {
    if (!p) return "";
    return p.replace(/\D+/g, "");
  }

  for (const w of workers) {
    if (w.email) {
      const k = w.email.trim().toLowerCase();
      if (k) {
        const arr = byEmail.get(k) ?? [];
        arr.push(w);
        byEmail.set(k, arr);
      }
    }
    if (w.phone) {
      const k = digitsOnly(w.phone);
      if (k.length >= 6) {
        const arr = byPhone.get(k) ?? [];
        arr.push(w);
        byPhone.set(k, arr);
      }
    }
  }

  // 3. For each pending row, gather candidates and rank.
  for (const p of pending) {
    const matches = new Map<
      number,
      {
        worker: WorkerLite;
        score: number;
        reason: string;
      }
    >();

    function add(w: WorkerLite, score: number, reason: string) {
      const prev = matches.get(w.worker_id);
      if (!prev || prev.score < score) {
        matches.set(w.worker_id, { worker: w, score, reason });
      }
    }

    // Email exact match.
    if (p.email) {
      const k = p.email.trim().toLowerCase();
      if (k) {
        for (const w of byEmail.get(k) ?? []) {
          add(w, 100, "Email match");
        }
      }
    }

    // Phone exact match (digits-only).
    const pPhoneKey = digitsOnly(p.phone);
    if (pPhoneKey.length >= 6) {
      for (const w of byPhone.get(pPhoneKey) ?? []) {
        add(w, 90, "Phone match");
      }
    }

    // Fuzzy name match — substring on both first & last (case-insensitive).
    const pFirst = (p.first_name ?? "").trim().toLowerCase();
    const pLast = (p.last_name ?? "").trim().toLowerCase();
    if (pFirst.length >= 2 || pLast.length >= 2) {
      for (const w of workers) {
        const wFirst = (w.first_name ?? "").trim().toLowerCase();
        const wLast = (w.last_name ?? "").trim().toLowerCase();
        const firstMatch =
          pFirst.length >= 2 &&
          wFirst.length >= 2 &&
          (wFirst.includes(pFirst) || pFirst.includes(wFirst));
        const lastMatch =
          pLast.length >= 2 &&
          wLast.length >= 2 &&
          (wLast.includes(pLast) || pLast.includes(wLast));

        if (firstMatch && lastMatch) {
          add(w, 70, "Name match (first + last)");
        } else if (lastMatch) {
          add(w, 40, "Name match (last only)");
        }
      }
    }

    // Sort by score desc, take top 3.
    const ranked = [...matches.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ worker, score, reason }) => ({
        worker_id: worker.worker_id,
        first_name: worker.first_name,
        last_name: worker.last_name,
        email: worker.email,
        phone: worker.phone,
        employer_id: worker.employer_id,
        score,
        match_reason: reason,
      }));

    if (ranked.length > 0) {
      suggestions[p.prospective_id] = ranked;
    }
  }

  return NextResponse.json({ suggestions });
}
