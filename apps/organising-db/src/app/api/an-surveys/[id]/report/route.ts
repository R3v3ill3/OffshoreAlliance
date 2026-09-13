import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { knownNumbers } from "@/lib/an-surveys/aggregate";
import { numberGuard } from "@/lib/an-surveys/number-guard";
import {
  authenticate,
  buildAggregates,
  loadImportContext,
  parseCrossTabParam,
  parseReport,
} from "@/lib/an-surveys/server";
import { fail } from "@/lib/an-surveys/route-utils";
import type { AnSurveyReportResponse } from "@/lib/an-surveys/types";

/**
 * GET /api/an-surveys/[id]/report?crosstabs=a:b,c:d&includeText=0|1
 *
 * Deterministic aggregates for the current batch plus the current AI
 * report (parsed defensively). Verbatim free text is only returned when
 * includeText=1; identity data never is.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await authenticate(supabase);
  if (!auth.ok) return fail(auth.status, auth.error);

  const { searchParams } = new URL(request.url);
  const includeText = searchParams.get("includeText") === "1";
  const crossTabs = parseCrossTabParam(searchParams.get("crosstabs"));

  try {
    const ctx = await loadImportContext(supabase, id, { rows: true });
    if (!ctx) return fail(404, "Import not found");

    const aggregates = buildAggregates(ctx, { crossTabs, includeText });
    const parsed = parseReport(ctx);
    const report: AnSurveyReportResponse["report"] = parsed
      ? {
          ...parsed,
          number_guard_warnings: aggregates ? numberGuard(parsed.narrative, knownNumbers(aggregates)) : [],
        }
      : null;

    return NextResponse.json({
      success: true,
      import: ctx.import,
      questions: ctx.questions,
      aggregates,
      report,
    } satisfies AnSurveyReportResponse);
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "Failed to build report");
  }
}
