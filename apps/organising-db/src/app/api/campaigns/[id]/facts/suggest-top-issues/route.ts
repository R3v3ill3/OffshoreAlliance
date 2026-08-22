import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api/error-response";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import type { CampaignDataField, WorkerCampaignFact } from "@/lib/campaign-facts/types";
import { rankToSuggestedHeat } from "@/lib/campaign-facts/values";

/**
 * Appends claim fields that have worker ranks onto the current situation
 * analysis top_issues list when the label is not already present.
 * Does not overwrite existing heat.
 */
export async function POST(
  _req: NextRequest,
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

    const { data: fields, error: fieldErr } = await supabase
      .from("campaign_data_fields")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("category", "claims")
      .in("value_type", ["integer", "scale"]);
    if (fieldErr) throw fieldErr;
    const claimFields = (fields ?? []) as CampaignDataField[];
    if (claimFields.length === 0) {
      return NextResponse.json({ added: 0, message: "No ranked claim fields" });
    }

    const facts = await fetchAllRows<WorkerCampaignFact>((from, to) =>
      supabase
        .from("worker_campaign_facts")
        .select("*")
        .eq("campaign_id", campaignId)
        .in(
          "field_id",
          claimFields.map((f) => f.field_id)
        )
        .range(from, to)
    );

    const avgByField = new Map<number, { sum: number; n: number; max: number }>();
    for (const fact of facts) {
      if (fact.value_int == null) continue;
      const field = claimFields.find((f) => f.field_id === fact.field_id);
      if (!field) continue;
      const acc = avgByField.get(fact.field_id) ?? {
        sum: 0,
        n: 0,
        max: field.scale_max ?? fact.value_int,
      };
      acc.sum += fact.value_int;
      acc.n += 1;
      acc.max = Math.max(acc.max, field.scale_max ?? fact.value_int);
      avgByField.set(fact.field_id, acc);
    }

    const suggestions = claimFields
      .map((f) => {
        const acc = avgByField.get(f.field_id);
        if (!acc || acc.n === 0) return null;
        return {
          label: f.label,
          heat: rankToSuggestedHeat(acc.sum / acc.n, acc.max),
          notes: `Suggested from ${acc.n} worker rank(s) on ${f.key}`,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s != null);

    const { data: sa, error: saErr } = await supabase
      .from("campaign_situation_analyses")
      .select("situation_id, top_issues")
      .eq("campaign_id", campaignId)
      .eq("is_current", true)
      .maybeSingle();
    if (saErr) throw saErr;
    if (!sa) {
      return NextResponse.json(
        { error: "No current situation analysis to update" },
        { status: 404 }
      );
    }

    type Issue = { label?: string; heat?: number; notes?: string };
    const existing = (Array.isArray(sa.top_issues) ? sa.top_issues : []) as Issue[];
    const existingLabels = new Set(
      existing.map((i) => (i.label ?? "").trim().toLowerCase()).filter(Boolean)
    );
    const toAdd = suggestions.filter(
      (s) => !existingLabels.has(s.label.trim().toLowerCase())
    );
    if (toAdd.length === 0) {
      return NextResponse.json({ added: 0, message: "All claim labels already on top issues" });
    }

    const next = [...existing, ...toAdd];
    const { error: updErr } = await supabase
      .from("campaign_situation_analyses")
      .update({ top_issues: next })
      .eq("situation_id", sa.situation_id);
    if (updErr) throw updErr;

    return NextResponse.json({ added: toAdd.length, labels: toAdd.map((s) => s.label) });
  } catch (error) {
    console.error("POST suggest-top-issues error:", error);
    return errorResponse("Failed to suggest top issues", error);
  }
}
