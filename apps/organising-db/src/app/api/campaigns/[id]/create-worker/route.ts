import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toE164 } from "@/lib/phone/normalise-phone";
import {
  matchRow,
  buildWorkerIndex,
  type MatchableWorker,
} from "@/lib/import/worker-matching";
import {
  stampEmployerWorksiteFromOu,
  syncWorkersToMatchingCampaigns,
} from "@/lib/workers/sync-campaign-universe";

const createWorkerSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  employer_id: z.number().int().positive().optional().nullable(),
  worksite_id: z.number().int().positive().optional().nullable(),
  ou_id: z.number().int().positive().optional().nullable(),
  /** Attach this existing worker instead of inserting a new row. */
  attach_existing_worker_id: z.number().int().positive().optional().nullable(),
  /** Bypass duplicate confirmation and insert anyway. */
  force_create: z.boolean().optional(),
});

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

type DuplicateMatch = {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  method: "email" | "phone" | "name" | "an_id";
  in_campaign: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadDuplicateCandidates(
  supabase: any,
  campaignId: number,
  identity: { email: string | null; phone: string | null; first_name: string; last_name: string }
): Promise<MatchableWorker[]> {
  const byId = new Map<number, MatchableWorker>();

  const take = (rows: {
    worker_id: number;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
    email: string | null;
    phone: string | null;
  }[]) => {
    for (const row of rows) {
      if (byId.has(row.worker_id)) continue;
      byId.set(row.worker_id, {
        worker_id: row.worker_id,
        first_name: row.first_name,
        last_name: row.last_name,
        preferred_name: row.preferred_name,
        email: row.email,
        phone: row.phone,
        in_campaign: false,
      });
    }
  };

  const select =
    "worker_id, first_name, last_name, preferred_name, email, phone";

  if (identity.email) {
    const { data } = await supabase
      .from("workers")
      .select(select)
      .ilike("email", identity.email)
      .limit(20);
    take(data ?? []);
  }

  const e164 = toE164(identity.phone);
  if (e164) {
    const { data } = await supabase
      .from("workers")
      .select(select)
      .eq("phone_e164", e164)
      .limit(20);
    take(data ?? []);
  }
  if (identity.phone) {
    const { data } = await supabase
      .from("workers")
      .select(select)
      .eq("phone", identity.phone)
      .limit(20);
    take(data ?? []);
  }

  const { data: nameHits } = await supabase
    .from("workers")
    .select(select)
    .ilike("first_name", identity.first_name)
    .ilike("last_name", identity.last_name)
    .limit(20);
  take(nameHits ?? []);

  const ids = [...byId.keys()];
  if (ids.length === 0) return [];

  const { data: members } = await supabase
    .from("campaign_worker_membership")
    .select("worker_id")
    .eq("campaign_id", campaignId)
    .in("worker_id", ids);
  const inCampaign = new Set((members ?? []).map((r: { worker_id: number }) => r.worker_id));
  for (const worker of byId.values()) {
    worker.in_campaign = inCampaign.has(worker.worker_id);
  }
  return [...byId.values()];
}

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

  let body: z.infer<typeof createWorkerSchema>;
  try {
    const raw = await request.json();
    body = createWorkerSchema.parse(raw);
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

  const email = emptyToNull(body.email ?? undefined);
  const phone = emptyToNull(body.phone ?? undefined);

  if (body.employer_id != null) {
    const { data: row, error: ceErr } = await supabase
      .from("campaign_employers")
      .select("employer_id")
      .eq("campaign_id", campaignId)
      .eq("employer_id", body.employer_id)
      .maybeSingle();
    if (ceErr || !row) {
      return NextResponse.json(
        {
          success: false,
          error: "Employer is not attached to this campaign",
        },
        { status: 400 }
      );
    }
  }

  if (body.worksite_id != null) {
    const { data: row, error: cwErr } = await supabase
      .from("campaign_worksites")
      .select("worksite_id")
      .eq("campaign_id", campaignId)
      .eq("worksite_id", body.worksite_id)
      .maybeSingle();
    if (cwErr || !row) {
      return NextResponse.json(
        {
          success: false,
          error: "Worksite is not attached to this campaign",
        },
        { status: 400 }
      );
    }
  }

  let ouUnitBasis: unknown = null;
  if (body.ou_id != null) {
    const { data: ouRow, error: ouErr } = await supabase
      .from("campaign_organising_units")
      .select("ou_id, is_group_container, unit_basis")
      .eq("ou_id", body.ou_id)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (ouErr || !ouRow) {
      return NextResponse.json(
        { success: false, error: "Unit not found for this campaign" },
        { status: 400 }
      );
    }
    if ((ouRow as { is_group_container: boolean }).is_group_container) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cannot assign workers directly to a group container. Select one of the individual units within the group.",
        },
        { status: 400 }
      );
    }
    ouUnitBasis = (ouRow as { unit_basis: unknown }).unit_basis;
  }

  const finishAttach = async (workerId: number, fillBlanks: boolean) => {
    const { error: memErr } = await supabase.from("campaign_worker_membership").upsert(
      { campaign_id: campaignId, worker_id: workerId },
      {
        onConflict: "campaign_id,worker_id",
        ignoreDuplicates: true,
      }
    );
    if (memErr) {
      return NextResponse.json(
        {
          success: false,
          error: `Membership failed: ${memErr.message}`,
        },
        { status: 500 }
      );
    }

    if (fillBlanks && (body.employer_id != null || body.worksite_id != null)) {
      const { data: existing } = await supabase
        .from("workers")
        .select("employer_id, worksite_id")
        .eq("worker_id", workerId)
        .maybeSingle();
      const patch: { employer_id?: number; worksite_id?: number } = {};
      if (body.employer_id != null && existing?.employer_id == null) {
        patch.employer_id = body.employer_id;
      }
      if (body.worksite_id != null && existing?.worksite_id == null) {
        patch.worksite_id = body.worksite_id;
      }
      if (Object.keys(patch).length > 0) {
        await supabase.from("workers").update(patch).eq("worker_id", workerId);
      }
    }

    if (body.ou_id != null) {
      const { error: ouAssignErr } = await supabase.from("campaign_worker_ou").upsert(
        {
          ou_id: body.ou_id,
          worker_id: workerId,
          is_primary: false,
          assignment_source: "manual",
        },
        {
          onConflict: "ou_id,worker_id",
          ignoreDuplicates: true,
        }
      );
      if (ouAssignErr) {
        return NextResponse.json(
          {
            success: false,
            error: `OU assignment failed: ${ouAssignErr.message}`,
          },
          { status: 500 }
        );
      }
      await stampEmployerWorksiteFromOu(supabase, [workerId], ouUnitBasis);
    }

    await syncWorkersToMatchingCampaigns(supabase, [workerId]);
    return NextResponse.json({
      success: true,
      worker_id: workerId,
      attached_existing: fillBlanks,
    });
  };

  if (body.attach_existing_worker_id != null) {
    const { data: existing, error: exErr } = await supabase
      .from("workers")
      .select("worker_id")
      .eq("worker_id", body.attach_existing_worker_id)
      .maybeSingle();
    if (exErr || !existing) {
      return NextResponse.json(
        { success: false, error: "Existing worker not found" },
        { status: 404 }
      );
    }
    return finishAttach(body.attach_existing_worker_id, true);
  }

  if (!body.force_create) {
    const candidates = await loadDuplicateCandidates(supabase, campaignId, {
      email,
      phone,
      first_name: body.first_name,
      last_name: body.last_name,
    });
    if (candidates.length > 0) {
      const result = matchRow(
        {
          key: "new",
          emails: email ? [email] : [],
          phones: phone ? [phone] : [],
          firstName: body.first_name,
          lastName: body.last_name,
        },
        buildWorkerIndex(candidates)
      );
      if (result.disposition !== "unmatched" && result.candidates.length > 0) {
        const matches: DuplicateMatch[] = result.candidates.map((c) => ({
          worker_id: c.worker.worker_id,
          first_name: c.worker.first_name,
          last_name: c.worker.last_name,
          email: c.worker.email,
          phone: c.worker.phone,
          method: c.method,
          in_campaign: c.worker.in_campaign,
        }));
        const alreadyIn = matches.filter((m) => m.in_campaign);
        return NextResponse.json(
          {
            success: false,
            code: result.disposition === "auto" ? "duplicate" : "possible_duplicate",
            error:
              alreadyIn.length > 0
                ? `${alreadyIn[0].first_name} ${alreadyIn[0].last_name} is already in this campaign.`
                : `A matching worker already exists in the database.`,
            matches,
          },
          { status: 409 }
        );
      }
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("workers")
    .insert({
      first_name: body.first_name,
      last_name: body.last_name,
      email,
      phone,
      phone_e164: toE164(phone),
      sms_consent_source: phone ? "manual" : null,
      employer_id: body.employer_id ?? null,
      worksite_id: body.worksite_id ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select("worker_id")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json(
      {
        success: false,
        error: insErr?.message ?? "Worker insert failed",
      },
      { status: 500 }
    );
  }

  return finishAttach(inserted.worker_id as number, false);
}
