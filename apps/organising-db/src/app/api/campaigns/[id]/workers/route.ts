import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";

/**
 * GET /api/campaigns/[id]/workers?q=
 *
 * Staff-authenticated worker search within a campaign.
 * Returns up to 10 campaign members whose name matches the `q` param (ilike).
 * Used by the designated-caller combobox in the call share link dialog.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const campaignId = Number.parseInt(id, 10);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    const serverClient = await createClient();
    const staff = await requireStaffUser(serverClient);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();

    // Query from workers with inner-join so .or() applies to root-table columns.
    let query = serverClient
      .from("workers")
      .select(
        "worker_id, first_name, last_name, occupation, membership:campaign_worker_membership!inner(campaign_id)",
      )
      .eq("membership.campaign_id", campaignId)
      .order("first_name")
      .order("last_name")
      .limit(10);

    if (q.length >= 2) {
      const pattern = `%${q}%`;
      query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const workers = (data ?? []).map((r) => ({
      worker_id: r.worker_id,
      first_name: r.first_name,
      last_name: r.last_name,
      occupation: r.occupation,
    }));

    return NextResponse.json({ workers });
  } catch (error) {
    console.error("Campaign worker search error:", error);
    return NextResponse.json({ error: "Failed to search workers" }, { status: 500 });
  }
}
