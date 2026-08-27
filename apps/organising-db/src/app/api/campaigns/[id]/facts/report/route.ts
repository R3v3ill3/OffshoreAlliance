import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api/error-response";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import type {
  CampaignDataField,
  FactCategory,
  WorkerCampaignFact,
} from "@/lib/campaign-facts/types";
import { rankToSuggestedHeat } from "@/lib/campaign-facts/values";
import { loadFactWorkerMeta } from "@/lib/campaign-facts/worker-meta";

function bucketKey(field: CampaignDataField, fact: WorkerCampaignFact): string {
  if (field.value_type === "boolean") return fact.value_bool ? "yes" : "no";
  if (field.value_type === "integer" || field.value_type === "scale") {
    return fact.value_int == null ? "" : String(fact.value_int);
  }
  if (field.value_type === "enum") return fact.value_enum ?? "";
  if (field.value_type === "text") return (fact.value_text ?? "").trim();
  return "";
}

function factBuckets(field: CampaignDataField, fact: WorkerCampaignFact): string[] {
  if (field.value_type === "multi_enum" && Array.isArray(fact.value_json)) {
    return (fact.value_json as unknown[]).map((raw) => String(raw)).filter(Boolean);
  }
  const b = bucketKey(field, fact);
  return b === "" ? [] : [b];
}

type CountMap = Map<string, number>;
type GroupMap = Map<string, CountMap>;

function bump(store: Map<number, GroupMap>, fieldId: number, group: string, bucket: string) {
  let groups = store.get(fieldId);
  if (!groups) {
    groups = new Map();
    store.set(fieldId, groups);
  }
  let buckets = groups.get(group);
  if (!buckets) {
    buckets = new Map();
    groups.set(group, buckets);
  }
  buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
}

function toGroupRows(groups: GroupMap | undefined): { label: string; buckets: { key: string; count: number }[] }[] {
  if (!groups) return [];
  const rows = [...groups.entries()].map(([label, buckets]) => ({
    label,
    buckets: [...buckets.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    total: [...buckets.values()].reduce((n, c) => n + c, 0),
  }));
  rows.sort((a, b) => b.total - a.total);
  return rows.slice(0, 20).map(({ label, buckets }) => ({ label, buckets }));
}

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

    type Dist = {
      field: CampaignDataField;
      answered: number;
      buckets: { key: string; count: number }[];
      suggested_heat: 1 | 2 | 3 | 4 | 5 | null;
      by_worksite: { label: string; buckets: { key: string; count: number }[] }[];
      by_occupation: { label: string; buckets: { key: string; count: number }[] }[];
    };

    const distByField = new Map<number, Dist>();
    for (const f of fieldList) {
      distByField.set(f.field_id, {
        field: f,
        answered: 0,
        buckets: [],
        suggested_heat: null,
        by_worksite: [],
        by_occupation: [],
      });
    }

    const counts = new Map<string, number>();
    const rankSums = new Map<number, { sum: number; n: number; max: number }>();
    const worksiteCounts = new Map<number, GroupMap>();
    const occupationCounts = new Map<number, GroupMap>();

    for (const fact of facts) {
      const field = fieldById.get(fact.field_id);
      if (!field) continue;
      const dist = distByField.get(fact.field_id);
      if (!dist) continue;
      dist.answered += 1;

      const keys = factBuckets(field, fact);
      for (const key of keys) {
        counts.set(`${fact.field_id}::${key}`, (counts.get(`${fact.field_id}::${key}`) ?? 0) + 1);
      }

      const meta = workerMeta.get(fact.worker_id);
      const worksite = meta?.worksite_name?.trim() || "No worksite";
      const occupation = meta?.occupation?.trim() || "No occupation";
      for (const key of keys) {
        bump(worksiteCounts, fact.field_id, worksite, key);
        bump(occupationCounts, fact.field_id, occupation, key);
      }

      if (
        field.category === "claims" &&
        (field.value_type === "integer" || field.value_type === "scale") &&
        fact.value_int != null
      ) {
        const acc = rankSums.get(fact.field_id) ?? {
          sum: 0,
          n: 0,
          max: field.scale_max ?? fact.value_int,
        };
        acc.sum += fact.value_int;
        acc.n += 1;
        acc.max = Math.max(acc.max, field.scale_max ?? fact.value_int);
        rankSums.set(fact.field_id, acc);
      }
    }

    for (const [composite, count] of counts) {
      const sep = composite.indexOf("::");
      const fieldId = Number(composite.slice(0, sep));
      const key = composite.slice(sep + 2);
      distByField.get(fieldId)?.buckets.push({ key, count });
    }

    for (const [fieldId, acc] of rankSums) {
      const dist = distByField.get(fieldId);
      if (!dist || acc.n === 0) continue;
      const medianApprox = acc.sum / acc.n;
      dist.suggested_heat = rankToSuggestedHeat(medianApprox, acc.max);
    }

    for (const dist of distByField.values()) {
      dist.buckets.sort((a, b) => b.count - a.count);
      dist.by_worksite = toGroupRows(worksiteCounts.get(dist.field.field_id));
      dist.by_occupation = toGroupRows(occupationCounts.get(dist.field.field_id));
    }

    return NextResponse.json({
      fields: [...distByField.values()],
    });
  } catch (error) {
    console.error("GET facts report error:", error);
    return errorResponse("Failed to build fact report", error);
  }
}
