import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api/error-response";
import {
  FACT_CATEGORIES,
  FACT_VALUE_TYPES,
  type FactCategory,
  type FactEnumOption,
  type FactValueType,
} from "@/lib/campaign-facts/types";
import { enumValues, fieldKeyForCategory } from "@/lib/campaign-facts/values";

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  _req: NextRequest,
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

    const [{ data: fields, error: fieldErr }, { data: fieldsets, error: setErr }] =
      await Promise.all([
        supabase
          .from("campaign_data_fields")
          .select("*")
          .eq("campaign_id", campaignId)
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
        supabase
          .from("campaign_data_fieldsets")
          .select("*")
          .eq("campaign_id", campaignId)
          .order("sort_order", { ascending: true })
          .order("title", { ascending: true }),
      ]);
    if (fieldErr) throw fieldErr;
    if (setErr) throw setErr;

    return NextResponse.json({
      fields: fields ?? [],
      fieldsets: fieldsets ?? [],
    });
  } catch (error) {
    console.error("GET data-fields error:", error);
    return errorResponse("Failed to fetch data fields", error);
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
      kind?: "field" | "fieldset";
      title?: string;
      label?: string;
      key?: string;
      category?: FactCategory;
      value_type?: FactValueType;
      fieldset_id?: number | null;
      enum_options?: FactEnumOption[] | null;
      scale_min?: number | null;
      scale_max?: number | null;
      filterable?: boolean;
      sortable?: boolean;
      sort_order?: number;
    };

    if (body.kind === "fieldset") {
      const title = body.title?.trim();
      const category = body.category ?? "other";
      if (!title) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
      }
      if (!FACT_CATEGORIES.includes(category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("campaign_data_fieldsets")
        .insert({
          campaign_id: campaignId,
          title,
          category,
          sort_order: body.sort_order ?? 0,
          created_by: user.id,
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ fieldset: data }, { status: 201 });
    }

    const label = body.label?.trim();
    const category = body.category ?? "other";
    const valueType = body.value_type;
    if (!label) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }
    if (!FACT_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (!valueType || !FACT_VALUE_TYPES.includes(valueType)) {
      return NextResponse.json({ error: "Invalid value type" }, { status: 400 });
    }
    if (
      (valueType === "enum" || valueType === "multi_enum") &&
      enumValues(body.enum_options).length < 2
    ) {
      return NextResponse.json(
        { error: "Choice fields need at least two options" },
        { status: 400 }
      );
    }
    const key = fieldKeyForCategory(category, label, body.key);
    const payload = {
      campaign_id: campaignId,
      fieldset_id: body.fieldset_id ?? null,
      key,
      label,
      category,
      value_type: valueType,
      enum_options:
        valueType === "enum" || valueType === "multi_enum"
          ? body.enum_options ?? []
          : null,
      scale_min:
        valueType === "scale" || valueType === "integer"
          ? body.scale_min ?? (valueType === "scale" ? 1 : null)
          : null,
      scale_max:
        valueType === "scale" || valueType === "integer"
          ? body.scale_max ?? (valueType === "scale" ? 5 : null)
          : null,
      filterable: body.filterable !== false,
      sortable: body.sortable === true || valueType === "integer" || valueType === "scale",
      sort_order: body.sort_order ?? 0,
      created_by: user.id,
    };
    const { data, error } = await supabase
      .from("campaign_data_fields")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `A field with key “${key}” already exists on this campaign` },
          { status: 409 }
        );
      }
      throw error;
    }
    return NextResponse.json({ field: data }, { status: 201 });
  } catch (error) {
    console.error("POST data-fields error:", error);
    return errorResponse("Failed to create data field", error);
  }
}
