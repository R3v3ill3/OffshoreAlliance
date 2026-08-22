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
import { enumValues } from "@/lib/campaign-facts/values";

function parsePositiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> }
) {
  try {
    const { id, fieldId: fieldIdRaw } = await params;
    const campaignId = parsePositiveInt(id);
    const fieldId = parsePositiveInt(fieldIdRaw);
    if (campaignId == null || fieldId == null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      label?: string;
      category?: FactCategory;
      fieldset_id?: number | null;
      enum_options?: FactEnumOption[] | null;
      scale_min?: number | null;
      scale_max?: number | null;
      filterable?: boolean;
      sortable?: boolean;
      sort_order?: number;
      value_type?: FactValueType;
    };

    const patch: Record<string, unknown> = {};
    if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim();
    if (body.category != null) {
      if (!FACT_CATEGORIES.includes(body.category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      patch.category = body.category;
    }
    if (body.fieldset_id !== undefined) patch.fieldset_id = body.fieldset_id;
    if (body.filterable != null) patch.filterable = body.filterable;
    if (body.sortable != null) patch.sortable = body.sortable;
    if (body.sort_order != null) patch.sort_order = body.sort_order;
    if (body.enum_options !== undefined) {
      if (enumValues(body.enum_options).length < 2) {
        return NextResponse.json(
          { error: "Choice fields need at least two options" },
          { status: 400 }
        );
      }
      patch.enum_options = body.enum_options;
    }
    if (body.scale_min !== undefined) patch.scale_min = body.scale_min;
    if (body.scale_max !== undefined) patch.scale_max = body.scale_max;
    if (body.value_type != null) {
      if (!FACT_VALUE_TYPES.includes(body.value_type)) {
        return NextResponse.json({ error: "Invalid value type" }, { status: 400 });
      }
      patch.value_type = body.value_type;
    }

    const { data, error } = await supabase
      .from("campaign_data_fields")
      .update(patch)
      .eq("field_id", fieldId)
      .eq("campaign_id", campaignId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Field not found" }, { status: 404 });
    return NextResponse.json({ field: data });
  } catch (error) {
    console.error("PATCH data-field error:", error);
    return errorResponse("Failed to update data field", error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> }
) {
  try {
    const { id, fieldId: fieldIdRaw } = await params;
    const campaignId = parsePositiveInt(id);
    const fieldId = parsePositiveInt(fieldIdRaw);
    if (campaignId == null || fieldId == null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { error } = await supabase
      .from("campaign_data_fields")
      .delete()
      .eq("field_id", fieldId)
      .eq("campaign_id", campaignId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE data-field error:", error);
    return errorResponse("Failed to delete data field", error);
  }
}
