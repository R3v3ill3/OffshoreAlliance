import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authenticate } from "@/lib/an-surveys/server";
import { dbFail, fail } from "@/lib/an-surveys/route-utils";
import {
  reportStateFor,
  type AnSurveyBatch,
  type AnSurveyImport,
  type AnSurveyListItem,
  type AnSurveyListResponse,
} from "@/lib/an-surveys/types";

const UNIQUE_VIOLATION = "23505";

const LIST_SELECT = [
  "*",
  "campaigns(name)",
  "current_batch:an_survey_import_batches!an_survey_imports_current_batch_fkey(id, file_name, row_count, response_count, duplicate_count, uploaded_at)",
  "current_report:an_survey_reports!an_survey_imports_current_report_fkey(batch_id, generated_at)",
].join(", ");

type ListRow = AnSurveyImport & {
  campaigns: { name: string } | { name: string }[] | null;
  current_batch: AnSurveyListItem["current_batch"] | AnSurveyListItem["current_batch"][] | null;
  current_report: { batch_id: string | null; generated_at: string } | { batch_id: string | null; generated_at: string }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** GET /api/an-surveys?campaignId= — list imports (all, or one campaign's). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const auth = await authenticate(supabase);
  if (!auth.ok) return fail(auth.status, auth.error);

  const { searchParams } = new URL(request.url);
  const campaignParam = searchParams.get("campaignId");
  let campaignId: number | null = null;
  if (campaignParam !== null && campaignParam !== "") {
    campaignId = Number(campaignParam);
    if (!Number.isInteger(campaignId)) return fail(400, "Invalid campaign ID");
  }

  let query = supabase.from("an_survey_imports").select(LIST_SELECT).order("updated_at", { ascending: false });
  if (campaignId !== null) query = query.eq("campaign_id", campaignId);
  const { data, error } = await query;
  if (error) return fail(500, `Failed to list imports: ${error.message}`);

  const imports: AnSurveyListItem[] = ((data ?? []) as unknown as ListRow[]).map((row) => {
    const { campaigns, current_batch, current_report, ...imp } = row;
    const report = one(current_report);
    const batch = one(current_batch) as Pick<
      AnSurveyBatch,
      "id" | "file_name" | "row_count" | "response_count" | "duplicate_count" | "uploaded_at"
    > | null;
    return {
      ...imp,
      campaign_name: one(campaigns)?.name ?? null,
      current_batch: batch,
      report_state: reportStateFor(imp, report?.batch_id),
      report_generated_at: report?.generated_at ?? null,
    };
  });

  return NextResponse.json({ success: true, imports } satisfies AnSurveyListResponse);
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  source_kind: z.enum(["form", "survey"]),
  campaign_id: z.number().int().positive().nullable().optional(),
  an: z
    .object({
      resource_type: z.enum(["form", "survey"]),
      resource_id: z.string().trim().min(1).max(100),
      browser_url: z.string().max(1000).nullable().optional(),
      total_records: z.number().int().nonnegative().nullable().optional(),
    })
    .nullable()
    .optional(),
});

/** POST /api/an-surveys — create an import (optionally AN-linked / campaign-linked). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await authenticate(supabase, { write: true });
  if (!auth.ok) return fail(auth.status, auth.error);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Invalid request body");
  const body = parsed.data;

  const campaignId = body.campaign_id ?? null;
  if (campaignId !== null) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("campaign_id")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (!campaign) return fail(404, "Campaign not found");
  }

  const insert: Record<string, unknown> = {
    title: body.title,
    source_kind: body.source_kind,
    campaign_id: campaignId,
    created_by: auth.user.id,
  };
  if (body.an) {
    insert.an_resource_type = body.an.resource_type;
    insert.an_resource_id = body.an.resource_id;
    insert.an_browser_url = body.an.browser_url ?? null;
    insert.an_total_records = body.an.total_records ?? null;
    insert.an_last_synced_at = new Date().toISOString();
  }

  const { data, error } = await supabase.from("an_survey_imports").insert(insert).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return fail(409, "This Action Network form/survey is already linked to another import");
    }
    return dbFail(error, "Failed to create import");
  }

  return NextResponse.json({ success: true, import: data as AnSurveyImport }, { status: 201 });
}
