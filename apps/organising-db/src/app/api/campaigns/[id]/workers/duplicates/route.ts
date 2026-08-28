import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/api/error-response";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import {
  findDuplicateClusters,
  type DuplicateCandidate,
} from "@/lib/workers/duplicate-clusters";

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

type WorkerEmbed = {
  worker_id: number;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  created_at: string | null;
  employers: { employer_name: string } | { employer_name: string }[] | null;
  worksites: { worksite_name: string } | { worksite_name: string }[] | null;
};

type MemberEmbed = {
  worker_id: number;
  workers: WorkerEmbed | WorkerEmbed[] | null;
};

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
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

    const rows = await fetchAllRows<MemberEmbed>((from, to) =>
      supabase
        .from("campaign_worker_membership")
        .select(
          `worker_id,
           workers (
             worker_id, first_name, last_name, preferred_name, email, phone,
             occupation, created_at,
             employers ( employer_name ),
             worksites ( worksite_name )
           )`
        )
        .eq("campaign_id", campaignId)
        .range(from, to)
    );

    const workers: DuplicateCandidate[] = [];
    for (const row of rows) {
      const w = unwrap(row.workers);
      if (!w) continue;
      const emp = unwrap(w.employers);
      const ws = unwrap(w.worksites);
      workers.push({
        worker_id: w.worker_id,
        first_name: w.first_name,
        last_name: w.last_name,
        preferred_name: w.preferred_name,
        email: w.email,
        phone: w.phone,
        occupation: w.occupation,
        created_at: w.created_at,
        employer_name: emp?.employer_name ?? null,
        worksite_name: ws?.worksite_name ?? null,
      });
    }

    return NextResponse.json({
      scanned: workers.length,
      clusters: findDuplicateClusters(workers),
    });
  } catch (error) {
    console.error("GET worker duplicates error:", error);
    return errorResponse("Failed to search for duplicates", error);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("remove"),
    keep_worker_id: z.number().int().positive(),
    remove_worker_ids: z.array(z.number().int().positive()).min(1),
  }),
  z.object({
    action: z.literal("merge"),
    keep_worker_id: z.number().int().positive(),
    merge_from_worker_ids: z.array(z.number().int().positive()).min(1),
  }),
]);

const bodySchema = z.object({
  actions: z.array(actionSchema).min(1).max(50),
});

async function removeFromCampaign(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  campaignId: number,
  workerId: number
) {
  const { data: ouRows } = await supabase
    .from("campaign_organising_units")
    .select("ou_id")
    .eq("campaign_id", campaignId);
  const ouIds = (ouRows ?? []).map((r: { ou_id: number }) => r.ou_id);
  if (ouIds.length > 0) {
    const { error: ouErr } = await supabase
      .from("campaign_worker_ou")
      .delete()
      .eq("worker_id", workerId)
      .in("ou_id", ouIds);
    if (ouErr) throw ouErr;
  }
  const { error: memErr } = await supabase
    .from("campaign_worker_membership")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("worker_id", workerId);
  if (memErr) throw memErr;

  const { data: campaignLists } = await supabase
    .from("call_lists")
    .select("list_id")
    .eq("campaign_id", campaignId);
  if (campaignLists && campaignLists.length > 0) {
    await supabase
      .from("call_list_items")
      .delete()
      .eq("worker_id", workerId)
      .in(
        "list_id",
        campaignLists.map((l: { list_id: number }) => l.list_id)
      );
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

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (!profile || profile.role === "viewer") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    const { data: canWrite, error: permErr } = await supabase.rpc("can_write_to_campaign", {
      p_campaign_id: campaignId,
    });
    if (permErr) throw permErr;
    if (!canWrite) {
      return NextResponse.json({ error: "No write access to this campaign" }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 }
      );
    }

    let removed = 0;
    let merged = 0;
    for (const item of parsed.data.actions) {
      if (item.action === "remove") {
        if (item.remove_worker_ids.includes(item.keep_worker_id)) {
          return NextResponse.json(
            { error: "Cannot remove the worker you chose to keep" },
            { status: 400 }
          );
        }
        for (const workerId of item.remove_worker_ids) {
          await removeFromCampaign(supabase, campaignId, workerId);
          removed += 1;
        }
      } else {
        const victims = item.merge_from_worker_ids.filter((id) => id !== item.keep_worker_id);
        if (victims.length === 0) continue;
        const { data, error } = await supabase.rpc("merge_workers", {
          p_survivor_id: item.keep_worker_id,
          p_victim_ids: victims,
          p_campaign_id: campaignId,
          p_actor_id: user.id,
        });
        if (error) throw error;
        merged += typeof data === "number" ? data : victims.length;
      }
    }

    return NextResponse.json({ ok: true, removed, merged });
  } catch (error) {
    console.error("POST worker duplicates resolve error:", error);
    return errorResponse("Failed to resolve duplicates", error);
  }
}
