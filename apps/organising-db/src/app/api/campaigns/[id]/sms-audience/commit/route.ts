import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ensureSmsEpisodeMembership } from "@/lib/sms/sms-episode";

const schema = z.object({
  name: z.string().trim().max(200).optional(),
  worker_ids: z.array(z.number().int().positive()).min(1).max(50_000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json(
      { success: false, error: "Invalid campaign ID" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role === "viewer") {
    return NextResponse.json(
      { success: false, error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  let body: z.infer<typeof schema>;
  try {
    const raw = await request.json();
    body = schema.parse(raw);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid request body";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }

  try {
    const uniqueIds = [...new Set(body.worker_ids)];

    await ensureSmsEpisodeMembership(supabase, campaignId, uniqueIds);

    // Verify all workers are campaign members
    const { data: members, error: memErr } = await supabase
      .from("campaign_worker_membership")
      .select("worker_id")
      .eq("campaign_id", campaignId)
      .in("worker_id", uniqueIds);
    if (memErr) throw memErr;

    const memberSet = new Set(
      (members ?? []).map((m) => m.worker_id as number)
    );
    const nonMembers = uniqueIds.filter((id) => !memberSet.has(id));
    if (nonMembers.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `${nonMembers.length} worker(s) are not campaign members`,
        },
        { status: 400 }
      );
    }

    // Create draft campaign_worker_lists
    const listName =
      body.name?.trim() ||
      `SMS audience ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

    const { data: list, error: listErr } = await supabase
      .from("campaign_worker_lists")
      .insert({
        campaign_id: campaignId,
        name: listName,
        default_purpose: "sms",
        status: "draft",
        source: "sms_audience_picker",
        created_by: user.id,
      })
      .select("list_id")
      .single();

    if (listErr || !list) {
      return NextResponse.json(
        {
          success: false,
          error: listErr?.message ?? "Failed to create worker list",
        },
        { status: 500 }
      );
    }

    const listId = list.list_id as number;

    // Insert items
    const items = uniqueIds.map((workerId, idx) => ({
      list_id: listId,
      worker_id: workerId,
      sort_order: idx,
    }));

    // Batch insert in chunks of 500
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500);
      const { error: itemErr } = await supabase
        .from("campaign_worker_list_items")
        .insert(chunk);
      if (itemErr) {
        return NextResponse.json(
          {
            success: false,
            error: `Failed to insert items: ${itemErr.message}`,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      type: "worker_list" as const,
      worker_list_id: listId,
      items_count: uniqueIds.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
