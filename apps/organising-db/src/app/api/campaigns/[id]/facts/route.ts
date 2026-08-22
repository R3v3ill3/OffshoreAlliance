import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api/error-response";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import {
  FACT_SOURCES,
  type FactSource,
  type WorkerCampaignFact,
} from "@/lib/campaign-facts/types";
import { parseFactRawValue } from "@/lib/campaign-facts/values";
import { recordCampaignFactRpc } from "@/lib/campaign-facts/record-fact";

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const campaignId = parseId((await params).id);
    if (campaignId == null) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workerIdRaw = req.nextUrl.searchParams.get("worker_id");
    const workerId = workerIdRaw ? Number(workerIdRaw) : null;
    const fieldIdRaw = req.nextUrl.searchParams.get("field_id");
    const fieldId = fieldIdRaw ? Number(fieldIdRaw) : null;

    const rows = await fetchAllRows<WorkerCampaignFact>((from, to) => {
      let q = supabase
        .from("worker_campaign_facts")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("field_id", { ascending: true })
        .range(from, to);
      if (workerId != null && Number.isFinite(workerId)) q = q.eq("worker_id", workerId);
      if (fieldId != null && Number.isFinite(fieldId)) q = q.eq("field_id", fieldId);
      return q;
    });

    return NextResponse.json({ facts: rows });
  } catch (error) {
    console.error("GET facts error:", error);
    return errorResponse("Failed to fetch facts", error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const campaignId = parseId((await params).id);
    if (campaignId == null) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      worker_id?: number;
      field_id?: number;
      raw?: string | null;
      value_bool?: boolean | null;
      value_int?: number | null;
      value_text?: string | null;
      value_enum?: string | null;
      value_json?: unknown;
      source?: FactSource;
      source_ref?: string | null;
      notes?: string | null;
      clear?: boolean;
    };

    const workerId = body.worker_id;
    const fieldId = body.field_id;
    if (
      typeof workerId !== "number" ||
      typeof fieldId !== "number" ||
      !Number.isInteger(workerId) ||
      !Number.isInteger(fieldId)
    ) {
      return NextResponse.json(
        { error: "worker_id and field_id are required" },
        { status: 400 }
      );
    }
    const source = body.source ?? "staff";
    if (!FACT_SOURCES.includes(source)) {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    const { data: field, error: fieldErr } = await supabase
      .from("campaign_data_fields")
      .select("*")
      .eq("field_id", fieldId)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (fieldErr) throw fieldErr;
    if (!field) return NextResponse.json({ error: "Field not found" }, { status: 404 });

    if (body.clear) {
      const factId = await recordCampaignFactRpc(supabase, {
        fieldId,
        workerId,
        campaignId,
        source,
        sourceRef: body.source_ref,
        notes: body.notes,
        actorId: user.id,
        clear: true,
      });
      return NextResponse.json({ fact_id: factId, cleared: true });
    }

    let parsed = body.raw != null
      ? parseFactRawValue(field, body.raw)
      : null;
    if (!parsed) {
      if (field.value_type === "boolean" && typeof body.value_bool === "boolean") {
        parsed = { kind: "bool", value: body.value_bool };
      } else if (
        (field.value_type === "integer" || field.value_type === "scale") &&
        typeof body.value_int === "number"
      ) {
        parsed = { kind: "int", value: body.value_int };
      } else if (field.value_type === "text" && typeof body.value_text === "string") {
        parsed = { kind: "text", value: body.value_text };
      } else if (field.value_type === "enum" && typeof body.value_enum === "string") {
        parsed = parseFactRawValue(field, body.value_enum);
      } else if (field.value_type === "multi_enum" && Array.isArray(body.value_json)) {
        parsed = {
          kind: "multi",
          value: (body.value_json as unknown[]).map((v) => String(v)),
        };
      } else {
        parsed = { kind: "empty" };
      }
    }
    if (parsed.kind === "invalid") {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const factId = await recordCampaignFactRpc(supabase, {
      fieldId,
      workerId,
      campaignId,
      parsed,
      source,
      sourceRef: body.source_ref,
      notes: body.notes,
      actorId: user.id,
    });
    return NextResponse.json({ fact_id: factId });
  } catch (error) {
    console.error("POST facts error:", error);
    return errorResponse("Failed to record fact", error);
  }
}
