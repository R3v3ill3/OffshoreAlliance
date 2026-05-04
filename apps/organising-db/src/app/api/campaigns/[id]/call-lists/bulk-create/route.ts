import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { computePriorityScore } from "@/lib/phone/priority-scoring";

const SegmentSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  filters: z.record(z.string(), z.unknown()),
});

const BulkCreateSchema = z.object({
  base_name: z.string().min(1, "base_name is required"),
  description: z.string().optional(),
  script_id: z.number().int().nullable().optional(),
  action_id: z.number().int().nullable().optional(),
  segments: z.array(SegmentSchema).min(1, "At least one segment is required"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignIdStr } = await params;
    const campaignId = parseInt(campaignIdStr, 10);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = BulkCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { base_name, description, script_id, action_id, segments } = parsed.data;

    const listIds: number[] = [];

    for (const segment of segments) {
      const listName = `${base_name} — ${segment.label}`;

      // 1. Create the call_list row
      const { data: newList, error: createErr } = await supabase
        .from("call_lists")
        .insert({
          campaign_id: campaignId,
          name: listName,
          description: description ?? null,
          script_id: script_id ?? null,
          priority_strategy: "sequential",
          source_filters: segment.filters,
          status: "draft",
          created_by: user.id,
        })
        .select("list_id")
        .single();

      if (createErr || !newList) {
        console.error(`bulk-create: failed to create list "${listName}":`, createErr);
        return NextResponse.json(
          { error: `Failed to create list "${listName}": ${createErr?.message ?? "unknown error"}` },
          { status: 500 }
        );
      }

      const listId = newList.list_id as number;

      // 2. If a script was supplied, record in call_list_scripts join table
      if (script_id) {
        const { error: linkErr } = await supabase.from("call_list_scripts").insert({
          list_id: listId,
          script_id,
          wave_label: segment.label,
          is_current: true,
          linked_by: user.id,
        });
        if (linkErr) {
          console.error(`bulk-create: failed to link script for list ${listId}:`, linkErr);
          // Non-fatal — continue
        }
      }

      // 3. Fetch workers via the list-builder endpoint (reusing existing logic)
      const filters = segment.filters as Record<string, string>;
      const listBuilderUrl = new URL(
        `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/campaigns/${campaignId}/list-builder`
      );

      if (filters.membership) listBuilderUrl.searchParams.set("membership", filters.membership);
      if (filters.roles) listBuilderUrl.searchParams.set("roles", filters.roles);
      if (filters.employer_id) listBuilderUrl.searchParams.set("employer_id", String(filters.employer_id));
      if (filters.worksite_id) listBuilderUrl.searchParams.set("worksite_id", String(filters.worksite_id));
      if (filters.ou_id) listBuilderUrl.searchParams.set("ou_id", String(filters.ou_id));
      if (filters.ou_type) listBuilderUrl.searchParams.set("ou_type", String(filters.ou_type));
      if (filters.multi_unit_only) listBuilderUrl.searchParams.set("multi_unit_only", "true");
      if (filters.occupation) {
        const occVal = Array.isArray(filters.occupation)
          ? (filters.occupation as string[]).join(",")
          : String(filters.occupation);
        if (occVal) listBuilderUrl.searchParams.set("occupation", occVal);
      }
      if (filters.an_tags) listBuilderUrl.searchParams.set("an_tags", String(filters.an_tags));
      if (filters.exclude_an_tags)
        listBuilderUrl.searchParams.set("exclude_an_tags", String(filters.exclude_an_tags));

      const workerRes = await fetch(listBuilderUrl.toString(), {
        headers: { cookie: req.headers.get("cookie") || "" },
      });

      if (!workerRes.ok) {
        return NextResponse.json(
          { error: `Failed to fetch workers for segment "${segment.label}"` },
          { status: 500 }
        );
      }

      const workerJson = (await workerRes.json()) as {
        success?: boolean;
        data?: Array<{ worker_id: number; phone: string | null; membership_status: string | null }>;
      };

      const workers = workerJson.success ? (workerJson.data ?? []) : [];
      const withPhone = workers.filter((w) => w.phone && w.phone.trim() !== "");
      const workerIds = withPhone.map((w) => w.worker_id);

      if (workerIds.length > 0) {
        // Fetch connection data for priority scoring
        let connectionMap = new Map<number, Record<string, unknown>>();
        const { data: connections } = await supabase
          .from("worker_campaign_connections")
          .select("worker_id, connection_status, contact_count, preferred_contact_method")
          .eq("campaign_id", campaignId)
          .in("worker_id", workerIds);

        if (connections) {
          connectionMap = new Map(connections.map((c) => [c.worker_id, c]));
        }

        const items = withPhone
          .map((w, i) => {
            const conn = connectionMap.get(w.worker_id) as
              | Record<string, string | number | null | undefined>
              | undefined;
            const score = computePriorityScore({
              connection_status: (conn?.connection_status as string) || null,
              contact_count: (conn?.contact_count as number) || 0,
              membership_status: w.membership_status,
              has_phone: true,
              preferred_contact_method: (conn?.preferred_contact_method as string) || null,
              cumulative_rating: null,
              assessment_rating_bucket: null,
              priority_order: null,
            });
            return {
              list_id: listId,
              worker_id: w.worker_id,
              sort_order: i,
              priority_score: score,
              status: "pending" as const,
            };
          })
          .sort((a, b) => b.priority_score - a.priority_score)
          .map((item, i) => ({ ...item, sort_order: i }));

        const { error: insertErr } = await supabase
          .from("call_list_items")
          .insert(items);

        if (insertErr) {
          console.error(
            `bulk-create: failed to insert items for list ${listId}:`,
            insertErr
          );
          return NextResponse.json(
            { error: `Failed to populate list "${listName}": ${insertErr.message}` },
            { status: 500 }
          );
        }

        // Update total_items on the list row
        await supabase
          .from("call_lists")
          .update({ total_items: items.length, source_filters: segment.filters })
          .eq("list_id", listId);
      }

      listIds.push(listId);
    }

    // 4. If action_id supplied, append list_ids to phone_call_actions.list_ids
    //    and transition status to 'completed' when both script_id and at least
    //    one list are linked (so ResumeBanner stops surfacing the action).
    if (action_id != null && listIds.length > 0) {
      const { data: existing } = await supabase
        .from("phone_call_actions")
        .select("list_ids, script_id, status")
        .eq("action_id", action_id)
        .single();

      const prevIds: number[] = (existing?.list_ids as number[] | null) ?? [];
      const merged = [...new Set([...prevIds, ...listIds])];

      const effectiveScriptId =
        (script_id ?? null) ?? (existing?.script_id ?? null);

      const updatePayload: {
        list_ids: number[];
        script_id?: number | null;
        status?: "completed";
      } = { list_ids: merged };

      // Persist any newly-supplied script_id on the action.
      if (script_id != null && existing?.script_id !== script_id) {
        updatePayload.script_id = script_id;
      }

      // Lifecycle: once both script and list(s) are linked, mark complete.
      if (
        effectiveScriptId != null &&
        merged.length > 0 &&
        existing?.status !== "completed"
      ) {
        updatePayload.status = "completed";
      }

      await supabase
        .from("phone_call_actions")
        .update(updatePayload)
        .eq("action_id", action_id);
    }

    return NextResponse.json(
      { success: true, list_ids: listIds, count: listIds.length },
      { status: 201 }
    );
  } catch (err) {
    console.error("bulk-create call lists error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
