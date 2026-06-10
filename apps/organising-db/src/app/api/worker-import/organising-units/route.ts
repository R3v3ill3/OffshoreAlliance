import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

  const { data: inserted, error } = await supabase
    .from("campaign_organising_units")
    .insert({
      campaign_id: body.campaignId,
      name,
      ou_type: body.ouType,
      is_group_container: false,
      source: "manual",
    })
    .select("ou_id, name, ou_type")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, ou: inserted });
}
