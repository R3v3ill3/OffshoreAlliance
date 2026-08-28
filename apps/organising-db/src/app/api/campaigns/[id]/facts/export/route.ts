import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api/error-response";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import type {
  CampaignDataField,
  FactCategory,
  WorkerCampaignFact,
} from "@/lib/campaign-facts/types";
import { displayFactValue } from "@/lib/campaign-facts/values";
import { loadFactWorkerMeta } from "@/lib/campaign-facts/worker-meta";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const campaignId = Number((await params).id);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const category = req.nextUrl.searchParams.get("category") as FactCategory | null;

    let fieldQuery = supabase
      .from("campaign_data_fields")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("sort_order", { ascending: true });
    if (category === "claims" || category === "compliance" || category === "other") {
      fieldQuery = fieldQuery.eq("category", category);
    }
    const { data: fields, error: fieldErr } = await fieldQuery;
    if (fieldErr) throw fieldErr;
    const fieldList = (fields ?? []) as CampaignDataField[];
    const fieldById = new Map(fieldList.map((f) => [f.field_id, f]));

    const facts = await fetchAllRows<WorkerCampaignFact>((from, to) => {
      let q = supabase
        .from("worker_campaign_facts")
        .select("*")
        .eq("campaign_id", campaignId)
        .range(from, to);
      if (fieldList.length > 0) {
        q = q.in(
          "field_id",
          fieldList.map((f) => f.field_id)
        );
      }
      return q;
    });

    const workerMeta = await loadFactWorkerMeta(
      supabase,
      facts.map((f) => f.worker_id)
    );

    const valuesByWorker = new Map<number, Record<string, string>>();
    for (const fact of facts) {
      const field = fieldById.get(fact.field_id);
      if (!field) continue;
      let values = valuesByWorker.get(fact.worker_id);
      if (!values) {
        values = {};
        valuesByWorker.set(fact.worker_id, values);
      }
      values[String(fact.field_id)] = displayFactValue(field, fact);
    }

    const workers = [...valuesByWorker.entries()]
      .map(([workerId, values]) => {
        const meta = workerMeta.get(workerId);
        return {
          worker_id: workerId,
          first_name: meta?.first_name ?? "",
          last_name: meta?.last_name ?? "",
          occupation: meta?.occupation ?? "",
          worksite_name: meta?.worksite_name ?? "",
          values,
        };
      })
      .sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
      );

    return NextResponse.json({
      fields: fieldList.map((f) => ({
        field_id: f.field_id,
        key: f.key,
        label: f.label,
        category: f.category,
      })),
      workers,
    });
  } catch (error) {
    console.error("GET facts export error:", error);
    return errorResponse("Failed to export facts", error);
  }
}
