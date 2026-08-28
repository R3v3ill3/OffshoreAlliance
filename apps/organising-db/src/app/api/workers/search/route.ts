import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import { workerSearchBlob } from "@/lib/workers/worker-search-blob";

export type WorkerSearchHit = {
  worker_id: number;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  employer_name: string | null;
  worksite_name: string | null;
  in_campaign: boolean;
};

function sanitizeIlike(raw: string): string {
  return raw.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

function unwrapName(
  rel: { employer_name?: string; worksite_name?: string } | { employer_name?: string; worksite_name?: string }[] | null
): string | null {
  if (rel == null) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.employer_name ?? row?.worksite_name ?? null;
}

/**
 * GET /api/workers/search?q=&exclude_campaign_id=&limit=
 *
 * Org-wide worker search for "add existing worker to a campaign".
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await requireStaffUser(supabase);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = sanitizeIlike(request.nextUrl.searchParams.get("q") ?? "");
    if (q.length < 2) {
      return NextResponse.json({ workers: [] as WorkerSearchHit[] });
    }

    const excludeCampaignRaw = request.nextUrl.searchParams.get("exclude_campaign_id");
    const excludeCampaignId = excludeCampaignRaw ? Number(excludeCampaignRaw) : NaN;
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;

    const pattern = `%${q}%`;
    const tokens = q.split(" ").filter(Boolean);
    const select = `worker_id, first_name, last_name, preferred_name, email, phone,
         employer:employers(employer_name),
         worksite:worksites(worksite_name)`;

    const byId = new Map<number, Record<string, unknown>>();
    const take = (rows: Record<string, unknown>[] | null) => {
      for (const row of rows ?? []) {
        const id = row.worker_id as number;
        if (!byId.has(id)) byId.set(id, row);
      }
    };

    if (tokens.length >= 2) {
      const first = tokens.slice(0, -1).join(" ");
      const last = tokens[tokens.length - 1];
      const { data, error } = await supabase
        .from("workers")
        .select(select)
        .ilike("first_name", `%${first}%`)
        .ilike("last_name", `%${last}%`)
        .order("last_name")
        .order("first_name")
        .limit(limit);
      if (error) throw error;
      take(data as Record<string, unknown>[] | null);
    }

    const { data, error } = await supabase
      .from("workers")
      .select(select)
      .or(
        [
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
          `preferred_name.ilike.${pattern}`,
          `email.ilike.${pattern}`,
          `phone.ilike.${pattern}`,
        ].join(",")
      )
      .order("last_name")
      .order("first_name")
      .limit(limit);
    if (error) throw error;
    take(data as Record<string, unknown>[] | null);

    const rows = [...byId.values()].slice(0, limit);
    const workerIds = rows.map((r) => r.worker_id as number);
    const inCampaign = new Set<number>();
    if (Number.isFinite(excludeCampaignId) && workerIds.length > 0) {
      const { data: members, error: memErr } = await supabase
        .from("campaign_worker_membership")
        .select("worker_id")
        .eq("campaign_id", excludeCampaignId)
        .in("worker_id", workerIds);
      if (memErr) throw memErr;
      for (const row of members ?? []) inCampaign.add(row.worker_id as number);
    }

    const workers: WorkerSearchHit[] = rows.map((r) => ({
      worker_id: r.worker_id as number,
      first_name: r.first_name as string,
      last_name: r.last_name as string,
      preferred_name: (r.preferred_name as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      employer_name: unwrapName(
        r.employer as { employer_name?: string } | { employer_name?: string }[] | null
      ),
      worksite_name: unwrapName(
        r.worksite as { worksite_name?: string } | { worksite_name?: string }[] | null
      ),
      in_campaign: inCampaign.has(r.worker_id as number),
    }));

    // Rank full-name hits first when the query looks like a name.
    const blobQ = q.toLowerCase();
    workers.sort((a, b) => {
      const aBlob = workerSearchBlob(a);
      const bBlob = workerSearchBlob(b);
      const aHit = aBlob.includes(blobQ) ? 0 : 1;
      const bHit = bBlob.includes(blobQ) ? 0 : 1;
      if (aHit !== bHit) return aHit - bHit;
      if (a.in_campaign !== b.in_campaign) return a.in_campaign ? 1 : -1;
      return a.last_name.localeCompare(b.last_name);
    });

    return NextResponse.json({ workers });
  } catch (error) {
    console.error("Worker search error:", error);
    return NextResponse.json({ error: "Failed to search workers" }, { status: 500 });
  }
}
