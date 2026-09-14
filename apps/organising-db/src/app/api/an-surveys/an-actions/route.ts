import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnClient, AN_NOT_CONFIGURED_ERROR } from "@/lib/api/an-client";
import { listAnActions } from "@/lib/api/an-actions";
import { authenticate } from "@/lib/an-surveys/server";
import { fail } from "@/lib/an-surveys/route-utils";
import type {
  AnSurveyActionListItem,
  AnSurveyActionsResponse,
  AnSurveySourceKind,
} from "@/lib/an-surveys/types";

/**
 * GET /api/an-surveys/an-actions?type=form|survey&q=
 *
 * The group's Action Network forms and surveys for the "link to AN" step,
 * flagging those already linked to a survey import.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const auth = await authenticate(supabase);
  if (!auth.ok) return fail(auth.status, auth.error);

  const client = getAnClient();
  if (!client) return fail(503, AN_NOT_CONFIGURED_ERROR);

  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get("type");
  const types: AnSurveySourceKind[] =
    typeParam === "form" || typeParam === "survey" ? [typeParam] : ["form", "survey"];

  try {
    const records = await listAnActions(client, { types, q: searchParams.get("q") });

    const { data: linked } = await supabase
      .from("an_survey_imports")
      .select("id, title, an_resource_type, an_resource_id")
      .not("an_resource_id", "is", null);
    const linkByKey = new Map(
      ((linked ?? []) as { id: string; title: string; an_resource_type: string; an_resource_id: string }[]).map(
        (l) => [`${l.an_resource_type}:${l.an_resource_id}`, l]
      )
    );

    const actions: AnSurveyActionListItem[] = records.flatMap((r) => {
      if (r.resource_type !== "form" && r.resource_type !== "survey") return [];
      const link = linkByKey.get(`${r.resource_type}:${r.id}`);
      return [
        {
          resource_type: r.resource_type,
          id: r.id,
          title: r.title,
          browser_url: r.browser_url,
          created_date: r.created_date,
          total_records: r.total_records,
          linked_import_id: link?.id ?? null,
          linked_import_title: link?.title ?? null,
        },
      ];
    });

    return NextResponse.json({ success: true, actions } satisfies AnSurveyActionsResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action Network request failed";
    return fail(502, message);
  }
}
