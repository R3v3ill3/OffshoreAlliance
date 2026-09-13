import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateYmd, renderSurveyReportHtml, slugForFilename } from "@/lib/an-surveys/html-export";
import { authenticate, buildAggregates, loadImportContext, parseReport } from "@/lib/an-surveys/server";
import { fail } from "@/lib/an-surveys/route-utils";

/**
 * GET /api/an-surveys/[id]/report/html?includeText=0|1
 *
 * Self-contained HTML download of the report. Verbatim (scrubbed) free
 * text is appended only with includeText=1.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await authenticate(supabase);
  if (!auth.ok) return fail(auth.status, auth.error);

  const { searchParams } = new URL(request.url);
  const includeText = searchParams.get("includeText") === "1";

  try {
    const ctx = await loadImportContext(supabase, id, { rows: true });
    if (!ctx) return fail(404, "Import not found");

    const aggregates = buildAggregates(ctx, { includeText });
    if (!aggregates) return fail(400, "Upload a CSV before exporting a report");
    const report = parseReport(ctx);

    const now = new Date();
    const html = renderSurveyReportHtml({
      title: ctx.import.title,
      campaignName: ctx.campaign_name,
      generatedAt: now,
      aggregates,
      questions: ctx.questions,
      narrative: report?.narrative ?? null,
      chartSpec: report?.chart_spec ?? null,
      reportGeneratedAt: report?.generated_at ?? null,
      reportModel: report?.model ?? null,
      includeText,
    });

    const filename = `${slugForFilename(ctx.import.title)}-${formatDateYmd(now)}.html`;
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : "Failed to export report");
  }
}
