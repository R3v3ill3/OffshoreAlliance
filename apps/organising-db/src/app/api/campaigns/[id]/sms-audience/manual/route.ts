import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toE164, toLocal } from "@/lib/phone/normalise-phone";

const schema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  phone: z.string().trim().min(1, "Phone number is required").max(30),
  email: z.string().trim().max(200).optional().nullable(),
  consent_attested: z.literal(true, {
    message: "Consent attestation is required",
  }),
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

  const phoneE164 = toE164(body.phone);
  if (!phoneE164) {
    return NextResponse.json(
      { success: false, error: "Not a valid AU mobile number" },
      { status: 400 }
    );
  }

  try {
    // Check for existing worker by phone_e164
    const { data: existing } = await supabase
      .from("workers")
      .select("worker_id, first_name, last_name, phone, phone_e164, sms_opt_out")
      .eq("phone_e164", phoneE164)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Ensure campaign membership — do not change consent
      await supabase.from("campaign_worker_membership").upsert(
        { campaign_id: campaignId, worker_id: existing.worker_id },
        { onConflict: "campaign_id,worker_id", ignoreDuplicates: true }
      );

      return NextResponse.json({
        success: true,
        worker_id: existing.worker_id,
        first_name: existing.first_name,
        last_name: existing.last_name,
        phone_e164: existing.phone_e164,
        sms_opt_out: existing.sms_opt_out ?? false,
        matched_existing: true,
      });
    }

    // Create new worker
    const phoneLocal = toLocal(body.phone);
    const email =
      body.email && body.email.trim() ? body.email.trim() : null;

    const { data: inserted, error: insErr } = await supabase
      .from("workers")
      .insert({
        first_name: body.first_name,
        last_name: body.last_name,
        email,
        phone: phoneLocal,
        phone_e164: phoneE164,
        sms_consent_source: "sms_manual_entry",
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select("worker_id, first_name, last_name, phone_e164, sms_opt_out")
      .single();

    if (insErr || !inserted) {
      return NextResponse.json(
        { success: false, error: insErr?.message ?? "Worker insert failed" },
        { status: 500 }
      );
    }

    // Campaign membership
    const { error: memErr } = await supabase
      .from("campaign_worker_membership")
      .upsert(
        { campaign_id: campaignId, worker_id: inserted.worker_id },
        { onConflict: "campaign_id,worker_id", ignoreDuplicates: true }
      );
    if (memErr) {
      return NextResponse.json(
        { success: false, error: `Membership failed: ${memErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      worker_id: inserted.worker_id,
      first_name: inserted.first_name,
      last_name: inserted.last_name,
      phone_e164: inserted.phone_e164,
      sms_opt_out: inserted.sms_opt_out ?? false,
      matched_existing: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
