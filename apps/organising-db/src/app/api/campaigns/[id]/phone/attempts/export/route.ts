import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import * as XLSX from "xlsx";

/**
 * Attempt-level export. Returns CSV by default, or XLSX when
 * `?format=xlsx` is supplied. Flattens the relational payload (objections,
 * issues, CTA + assessment ratings) into pipe-delimited cells so the file
 * is usable in spreadsheet tools without further processing.
 *
 *   GET /api/campaigns/123/phone/attempts/export?format=csv
 *   GET /api/campaigns/123/phone/attempts/export?format=xlsx
 *
 * Filters mirror `/api/campaigns/[id]/phone/attempts` (outcome,
 * caller_session_label, share_token_id, list_id, since).
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

    const supabase = await createClient();
    const staff = await requireStaffUser(supabase);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
    const since =
      url.searchParams.get("since") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: lists } = await supabase
      .from("call_lists")
      .select("list_id, name")
      .eq("campaign_id", campaignId);
    const listIds = (lists ?? []).map((l) => l.list_id);
    if (listIds.length === 0) {
      return sendExport([], format, campaignId);
    }

    const { data: items } = await supabase
      .from("call_list_items")
      .select(
        "item_id, list_id, worker_id, workers!call_list_items_worker_id_fkey(worker_id, first_name, last_name, email, phone, occupation, employer_id, employers(employer_name), worksites(worksite_name))",
      )
      .in("list_id", listIds);
    const itemIds = (items ?? []).map((i) => i.item_id);
    if (itemIds.length === 0) {
      return sendExport([], format, campaignId);
    }

    const { data: attempts } = await supabase
      .from("call_attempts")
      .select(
        "attempt_id, list_item_id, started_at, dial_disposition, call_disposition, outcome_classification, support_level_assessed, overall_notes, callback_datetime, duration_seconds, caller_user_id, caller_session_label, share_token_id",
      )
      .in("list_item_id", itemIds)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(10_000);

    const attemptIds = (attempts ?? []).map((a) => a.attempt_id);
    const [
      { data: objections },
      { data: issues },
      { data: ctaRatings },
      { data: assessmentRatings },
    ] = await Promise.all([
      supabase
        .from("call_attempt_objections")
        .select("attempt_id, objection_id, custom_label, outcome")
        .in("attempt_id", attemptIds),
      supabase
        .from("call_attempt_issues")
        .select("attempt_id, issue_label, heat")
        .in("attempt_id", attemptIds),
      supabase
        .from("call_attempt_cta_ratings")
        .select("attempt_id, cta_ambition_id, rating, binary_value")
        .in("attempt_id", attemptIds),
      supabase
        .from("call_attempt_assessment_ratings")
        .select("attempt_id, activity_id, rating")
        .in("attempt_id", attemptIds),
    ]);

    const itemById = new Map(items?.map((i) => [i.item_id, i]) ?? []);
    const listById = new Map(lists?.map((l) => [l.list_id, l.name]) ?? []);
    const groupBy = <T extends { attempt_id: number }>(rows: T[] | null): Map<number, T[]> => {
      const map = new Map<number, T[]>();
      for (const r of rows ?? []) {
        const arr = map.get(r.attempt_id) ?? [];
        arr.push(r);
        map.set(r.attempt_id, arr);
      }
      return map;
    };
    const oByA = groupBy(objections);
    const iByA = groupBy(issues);
    const cByA = groupBy(ctaRatings);
    const aByA = groupBy(assessmentRatings);

    const flatten = (attempts ?? []).map((a) => {
      const item = itemById.get(a.list_item_id);
      const workersRel = (item as { workers?: unknown } | undefined)?.workers;
      const worker = Array.isArray(workersRel)
        ? workersRel[0]
        : (workersRel as Record<string, unknown> | undefined);
      const employerRel = worker?.employers as { employer_name?: string } | { employer_name?: string }[] | null | undefined;
      const employer = Array.isArray(employerRel) ? employerRel[0] : employerRel;
      const worksiteRel = worker?.worksites as { worksite_name?: string } | { worksite_name?: string }[] | null | undefined;
      const worksite = Array.isArray(worksiteRel) ? worksiteRel[0] : worksiteRel;
      const objectionsText = (oByA.get(a.attempt_id) ?? [])
        .map((o) => `${o.custom_label ?? `#${o.objection_id ?? ""}`}:${o.outcome ?? ""}`)
        .join(" | ");
      const issuesText = (iByA.get(a.attempt_id) ?? [])
        .map((i) => `${i.issue_label}:${i.heat}`)
        .join(" | ");
      const ctaText = (cByA.get(a.attempt_id) ?? [])
        .map((c) => `${c.cta_ambition_id ?? "?"}:${c.rating ?? c.binary_value ?? ""}`)
        .join(" | ");
      const assessmentText = (aByA.get(a.attempt_id) ?? [])
        .map((aa) => `${aa.activity_id}:${aa.rating ?? ""}`)
        .join(" | ");

      return {
        attempt_id: a.attempt_id,
        started_at: a.started_at,
        duration_seconds: a.duration_seconds,
        list_id: item?.list_id ?? null,
        list_name: item?.list_id ? listById.get(item.list_id) ?? null : null,
        worker_id: worker?.worker_id ?? null,
        worker_name: worker
          ? `${(worker.first_name as string) ?? ""} ${(worker.last_name as string) ?? ""}`.trim()
          : null,
        worker_email: (worker?.email as string | null) ?? null,
        worker_phone: (worker?.phone as string | null) ?? null,
        worker_occupation: (worker?.occupation as string | null) ?? null,
        worker_employer: employer?.employer_name ?? null,
        worker_worksite: worksite?.worksite_name ?? null,
        caller_user_id: a.caller_user_id,
        caller_session_label: a.caller_session_label,
        share_token_id: a.share_token_id,
        dial_disposition: a.dial_disposition,
        call_disposition: a.call_disposition,
        outcome_classification: a.outcome_classification,
        support_level_assessed: a.support_level_assessed,
        callback_datetime: a.callback_datetime,
        overall_notes: a.overall_notes,
        objections: objectionsText,
        issues: issuesText,
        cta_ratings: ctaText,
        assessment_ratings: assessmentText,
      };
    });

    return sendExport(flatten, format, campaignId);
  } catch (error) {
    console.error("/api/campaigns/[id]/phone/attempts/export error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export" },
      { status: 500 },
    );
  }
}

function sendExport(
  rows: Record<string, unknown>[],
  format: string,
  campaignId: number,
): NextResponse {
  const ts = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "attempts");
    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array<ArrayBuffer>;
    const blob = new Blob([arr], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="phone-attempts-campaign-${campaignId}-${ts}.xlsx"`,
      },
    });
  }
  // CSV default.
  const csv = rowsToCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="phone-attempts-campaign-${campaignId}-${ts}.csv"`,
    },
  });
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes("\n") || s.includes("\"")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}
