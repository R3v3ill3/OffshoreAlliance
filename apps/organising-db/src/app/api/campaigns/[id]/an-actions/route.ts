import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnClient, AN_NOT_CONFIGURED_ERROR } from "@/lib/api/an-client";
import type {
  AnActionListItem,
  AnActionsResponse,
  AnResourceType,
} from "@/lib/import/participation-import-shared";

/** Pages of 25 per action type — bounds AN round trips per request. */
const MAX_PAGES_PER_TYPE = 4;

const TYPE_CONFIG: {
  type: AnResourceType;
  path: string;
  embeddedKey: string;
  countFields: string[];
}[] = [
  { type: "form", path: "/forms", embeddedKey: "osdi:forms", countFields: ["total_submissions"] },
  { type: "survey", path: "/surveys", embeddedKey: "action_network:surveys", countFields: ["total_responses"] },
  { type: "petition", path: "/petitions", embeddedKey: "osdi:petitions", countFields: ["total_signatures"] },
  { type: "event", path: "/events", embeddedKey: "osdi:events", countFields: ["total_accepted", "total_attendances"] },
];

function extractAnId(record: Record<string, unknown>): string | null {
  const identifiers = record.identifiers as string[] | undefined;
  const tagged = identifiers?.find((i) => i.startsWith("action_network:"));
  if (tagged) return tagged.slice("action_network:".length);
  const links = record._links as Record<string, { href?: string }> | undefined;
  const self = links?.self?.href;
  if (self) return self.split("/").filter(Boolean).pop() ?? null;
  return null;
}

/**
 * List the group's Action Network actions (forms, surveys, petitions,
 * events) for the import wizard, flagging any already linked to one of
 * this campaign's assessments.
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
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const typeFilter = searchParams.get("type") as AnResourceType | null;

  const configs = TYPE_CONFIG.filter((c) => !typeFilter || c.type === typeFilter);

  try {
    const perType = await Promise.all(
      configs.map(async (config) => {
        const { records } = await client.fetchAllRecords(config.path, config.embeddedKey, {
          maxPages: MAX_PAGES_PER_TYPE,
        });
        return records.map((record): AnActionListItem | null => {
          const anId = extractAnId(record);
          if (!anId) return null;
          const title =
            (record.title as string | undefined) ??
            (record.name as string | undefined) ??
            "(untitled)";
          let total: number | null = null;
          for (const field of config.countFields) {
            const v = record[field];
            if (typeof v === "number") {
              total = v;
              break;
            }
          }
          return {
            resource_type: config.type,
            id: anId,
            title,
            browser_url: (record.browser_url as string | undefined) ?? null,
            created_date: (record.created_date as string | undefined) ?? null,
            total_records: total,
            linked_activity_id: null,
            linked_activity_title: null,
          };
        });
      })
    );

    let actions = perType.flat().filter((a): a is AnActionListItem => a != null);
    if (q) {
      actions = actions.filter((a) => a.title.toLowerCase().includes(q));
    }
    actions.sort((a, b) => (b.created_date ?? "").localeCompare(a.created_date ?? ""));

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
