import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { structureApi } from "@/lib/campaign/structure-api";
import { structureErrorMessage, structureErrorStatus } from "@/lib/campaign/structure-error-message";
import type { CampaignOuType } from "@/types/database";

interface CreateImportOuRequest {
  campaignId: number;
  name: string;
  ouType: CampaignOuType;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateImportOuRequest;
  try {
    body = (await request.json()) as CreateImportOuRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name || !body.ouType || !body.campaignId) {
    return NextResponse.json(
      { success: false, error: "campaignId, name, and ouType are required" },
      { status: 400 }
    );
  }

  // WP2.2 Stage 6 (wp2.2.md §3.11 row 20): one `structure_units_create` with
  // the legacy insert's columns; the RPC's own write-permission check answers
  // 403 where the legacy insert relied on RLS.
  try {
    const created = await structureApi(supabase).units.create({
      campaignId: body.campaignId,
      units: [{ name, ou_type: body.ouType, is_group_container: false, source: "manual" }],
    });
    const ou = created.units[0];
    if (!ou) {
      return NextResponse.json({ success: false, error: "Unit create returned no row" }, { status: 500 });
    }
    return NextResponse.json({ success: true, ou: { ou_id: ou.ou_id, name, ou_type: body.ouType } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: structureErrorMessage(error, "Unit create failed") },
      { status: structureErrorStatus(error) }
    );
  }
}
