import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createWorkerSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  employer_id: z.number().int().positive().optional().nullable(),
  worksite_id: z.number().int().positive().optional().nullable(),
  ou_id: z.number().int().positive().optional().nullable(),
});

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
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

  if (body.ou_id != null) {
    const { data: ouRow, error: ouErr } = await supabase
      .from("campaign_organising_units")
      .select("ou_id, is_group_container")
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
  }

  const { data: inserted, error: insErr } = await supabase
    .from("workers")
    .insert({
      first_name: body.first_name,
      last_name: body.last_name,
      email,
      phone,
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

  const workerId = inserted.worker_id as number;

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
  }

  return NextResponse.json({
    success: true,
    worker_id: workerId,
  });
}
