import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveCallShareTokenRow,
  tokenStatusResponse,
} from "@/lib/campaign/call-share-api";

export interface IdentityOptionResult {
  worker_id: number;
  first_name: string;
  last_name: string;
  occupation: string | null;
  /** True only for the token's designated_worker_id, so the gate can show a personalised greeting. */
  designated?: true;
}

function mapWorkerRow(row: {
  worker: unknown;
}): IdentityOptionResult | null {
  const raw = (row as { worker: unknown }).worker;
  const w = (Array.isArray(raw) ? raw[0] : raw) as {
    worker_id: number;
    first_name: string;
    last_name: string;
    occupation: string | null;
  } | null;
  if (!w) return null;
  return {
    worker_id: w.worker_id,
    first_name: w.first_name,
    last_name: w.last_name,
    occupation: w.occupation,
  };
}

/**
 * GET /api/call-share/[token]/identity-options
 *
 * Returns a list of workers the caller can identify themselves as.
 *
 * Query params:
 *   q  – optional search string (≥2 chars).  When provided, performs an
 *          ilike search across first_name + last_name and returns up to 10
 *          matches in alphabetical order.
 *        When absent, returns the designated worker (if any) plus up to 5
 *          alphabetical campaign members as hint options.
 *
 * Response:
 *   {
 *     designated?: IdentityOptionResult,   // only when token.designated_worker_id is set
 *     workers: IdentityOptionResult[]      // search results or hint list
 *   }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();

    const admin = createAdminClient();
    const outcome = await resolveCallShareTokenRow(admin, rawToken);
    const errResp = tokenStatusResponse(outcome);
    if (errResp || outcome.kind !== "ok") return errResp!;

    const tokenRow = outcome.row;

    const { data: list, error: listErr } = await admin
      .from("call_lists")
      .select("campaign_id")
      .eq("list_id", tokenRow.list_id)
      .maybeSingle();
    if (listErr) throw listErr;
    if (!list) return NextResponse.json({ error: "Call list not found" }, { status: 404 });

    const { campaign_id } = list;
    const designatedWorkerId: number | null =
      (tokenRow as { designated_worker_id?: number | null }).designated_worker_id ?? null;

    // ── Resolve designated worker ──────────────────────────────────────────
    let designated: IdentityOptionResult | undefined;
    if (designatedWorkerId != null) {
      const { data: dRow } = await admin
        .from("campaign_worker_membership")
        .select("worker_id, worker:workers(worker_id, first_name, last_name, occupation)")
        .eq("campaign_id", campaign_id)
        .eq("worker_id", designatedWorkerId)
        .maybeSingle();
      if (dRow) {
        const mapped = mapWorkerRow(dRow as { worker: unknown });
        if (mapped) designated = { ...mapped, designated: true };
      }
    }

    // ── Search or hint list ────────────────────────────────────────────────
    let workers: IdentityOptionResult[] = [];

    if (q.length >= 2) {
      // Query workers table with inner-join to campaign membership, then ilike on name columns.
      // Starting from `workers` lets us apply .or() on root-table columns directly.
      const pattern = `%${q}%`;
      const { data: rows, error: searchErr } = await admin
        .from("workers")
        .select(
          "worker_id, first_name, last_name, occupation, membership:campaign_worker_membership!inner(campaign_id)",
        )
        .eq("membership.campaign_id", campaign_id)
        .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
        .order("first_name")
        .order("last_name")
        .limit(10);
      if (searchErr) throw searchErr;

      workers = (rows ?? [])
        .map((r) => ({
          worker_id: r.worker_id,
          first_name: r.first_name,
          last_name: r.last_name,
          occupation: r.occupation,
        }))
        .filter((r) => r.worker_id !== designatedWorkerId);
    } else if (!designatedWorkerId) {
      // No designation + no search → small alphabetical hint list from workers table
      const { data: rows, error: hintErr } = await admin
        .from("workers")
        .select(
          "worker_id, first_name, last_name, occupation, membership:campaign_worker_membership!inner(campaign_id)",
        )
        .eq("membership.campaign_id", campaign_id)
        .order("first_name")
        .order("last_name")
        .limit(5);
      if (hintErr) throw hintErr;

      workers = (rows ?? []).map((r) => ({
        worker_id: r.worker_id,
        first_name: r.first_name,
        last_name: r.last_name,
        occupation: r.occupation,
      }));
    }
    // When designated is set and no q → return empty hint list (gate shows designated greeting only)

    return NextResponse.json({
      ...(designated ? { designated } : {}),
      workers,
    });
  } catch (error) {
    console.error("Call share identity options error:", error);
    return NextResponse.json({ error: "Failed to load identity options" }, { status: 500 });
  }
}
