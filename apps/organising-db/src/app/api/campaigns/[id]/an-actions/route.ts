import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnClient, AN_NOT_CONFIGURED_ERROR } from "@/lib/api/an-client";
import { listAnActions } from "@/lib/api/an-actions";
import type {
  AnActionListItem,
  AnActionsResponse,
  AnResourceType,
} from "@/lib/import/participation-import-shared";

const RESOURCE_TYPES: AnResourceType[] = ["form", "survey", "petition", "event"];

/**
 * List the group's Action Network actions (forms, surveys, petitions,
 * events) for the import wizard, flagging any already linked to one of
 * this campaign's assessments. The AN walk lives in `@/lib/api/an-actions`
 * (shared with the survey importer).
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

  const client = getAnClient();
  if (!client) {
    return NextResponse.json({ success: false, error: AN_NOT_CONFIGURED_ERROR }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const typeParam = searchParams.get("type");
  const typeFilter = RESOURCE_TYPES.find((t) => t === typeParam) ?? null;

  try {
    const records = await listAnActions(client, {
      types: typeFilter ? [typeFilter] : undefined,
      q,
    });
    const actions: AnActionListItem[] = records.map((r) => ({
      ...r,
      linked_activity_id: null,
      linked_activity_title: null,
    }));

    // Flag actions already linked to one of this campaign's assessments.
    const { data: linked } = await supabase
      .from("campaign_activities")
      .select("activity_id, title, an_resource_type, an_resource_id")
      .eq("campaign_id", campaignId)
      .not("an_resource_id", "is", null);
    const linkByKey = new Map(
      (linked ?? []).map((l) => [
        `${l.an_resource_type}:${l.an_resource_id}`,
        { activity_id: l.activity_id, title: l.title },
      ])
    );
    for (const action of actions) {
      const link = linkByKey.get(`${action.resource_type}:${action.id}`);
      if (link) {
        action.linked_activity_id = link.activity_id;
        action.linked_activity_title = link.title;
      }
    }

    return NextResponse.json({ success: true, actions } satisfies AnActionsResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action Network request failed";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
