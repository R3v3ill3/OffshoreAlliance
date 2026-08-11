import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toE164, toLocal } from "@/lib/phone/normalise-phone";
import { CONSENT_BASES } from "@/lib/sms/audience-import";

const resolutionSchema = z.object({
  key: z.string(),
  action: z.enum(["match", "create", "skip"]),
  worker_id: z.number().int().positive().optional(),
  first_name: z.string().trim().min(1).optional(),
  last_name: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
  phone_e164: z.string().trim().optional(),
  email: z.string().trim().nullable().optional(),
});

const schema = z.object({
  resolutions: z.array(resolutionSchema).min(1).max(10_000),
  consent_basis: z.enum(CONSENT_BASES),
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

  try {
    const workers: Array<{
      worker_id: number;
      first_name: string;
      last_name: string;
      phone_e164: string | null;
      sms_opt_out: boolean;
      action: string;
    }> = [];
    const errors: Array<{ key: string; reason: string }> = [];

    for (const res of body.resolutions) {
      if (res.action === "skip") continue;

      if (res.action === "match" && res.worker_id) {
        // Link to existing worker — ensure campaign membership
        const { data: w } = await supabase
          .from("workers")
          .select(
            "worker_id, first_name, last_name, phone, phone_e164, sms_opt_out, sms_consent_source"
          )
          .eq("worker_id", res.worker_id)
          .single();
        if (!w) {
          errors.push({ key: res.key, reason: "Matched worker not found" });
          continue;
        }

        // If worker has no phone/consent and import provides one, update
        const importE164 = res.phone_e164 ?? toE164(res.phone ?? "");
        if (
          importE164 &&
          !w.phone_e164 &&
          !w.sms_consent_source
        ) {
          await supabase
            .from("workers")
            .update({
              phone: toLocal(importE164),
              phone_e164: importE164,
              sms_consent_source: "sms_import",
              updated_at: new Date().toISOString(),
            })
            .eq("worker_id", w.worker_id);
        }

        await supabase.from("campaign_worker_membership").upsert(
          { campaign_id: campaignId, worker_id: w.worker_id as number },
          { onConflict: "campaign_id,worker_id", ignoreDuplicates: true }
        );

        workers.push({
          worker_id: w.worker_id as number,
          first_name: w.first_name as string,
          last_name: w.last_name as string,
          phone_e164: (w.phone_e164 ?? importE164) as string | null,
          sms_opt_out: (w.sms_opt_out ?? false) as boolean,
          action: "match",
        });
      } else if (res.action === "create") {
        if (!res.first_name || !res.last_name) {
          errors.push({ key: res.key, reason: "Missing first or last name" });
          continue;
        }
        const e164 = res.phone_e164 ?? toE164(res.phone ?? "");
        if (!e164) {
          errors.push({ key: res.key, reason: "Missing or invalid phone" });
          continue;
        }

        // A UNIQUE index on phone_e164 is deferred — DEV/PROD have one
        // existing duplicate (+61416266435, n=2) that must be cleaned first.
        // Until then we SELECT-before-insert to prevent new duplicates.
        const { data: existingByPhone } = await supabase
          .from("workers")
          .select(
            "worker_id, first_name, last_name, phone_e164, sms_opt_out"
          )
          .eq("phone_e164", e164)
          .limit(1)
          .maybeSingle();

        if (existingByPhone) {
          // Worker already exists — link to campaign, do NOT insert a duplicate
          // and do NOT overwrite existing sms_consent_source / sms_opt_out.
          await supabase.from("campaign_worker_membership").upsert(
            {
              campaign_id: campaignId,
              worker_id: existingByPhone.worker_id as number,
            },
            { onConflict: "campaign_id,worker_id", ignoreDuplicates: true }
          );

          workers.push({
            worker_id: existingByPhone.worker_id as number,
            first_name: existingByPhone.first_name as string,
            last_name: existingByPhone.last_name as string,
            phone_e164: existingByPhone.phone_e164 as string | null,
            sms_opt_out: (existingByPhone.sms_opt_out ?? false) as boolean,
            action: "linked",
          });
          continue;
        }

        const { data: inserted, error: insErr } = await supabase
          .from("workers")
          .insert({
            first_name: res.first_name,
            last_name: res.last_name,
            email: res.email ?? null,
            phone: toLocal(e164),
            phone_e164: e164,
            sms_consent_source: "sms_import",
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .select("worker_id, first_name, last_name, phone_e164, sms_opt_out")
          .single();

        if (insErr || !inserted) {
          errors.push({
            key: res.key,
            reason: insErr?.message ?? "Worker insert failed",
          });
          continue;
        }

        await supabase.from("campaign_worker_membership").upsert(
          {
            campaign_id: campaignId,
            worker_id: inserted.worker_id as number,
          },
          { onConflict: "campaign_id,worker_id", ignoreDuplicates: true }
        );

        workers.push({
          worker_id: inserted.worker_id as number,
          first_name: inserted.first_name as string,
          last_name: inserted.last_name as string,
          phone_e164: inserted.phone_e164 as string | null,
          sms_opt_out: (inserted.sms_opt_out ?? false) as boolean,
          action: "create",
        });
      }
    }

    return NextResponse.json({
      success: true,
      workers,
      errors,
      created: workers.filter((w) => w.action === "create").length,
      matched: workers.filter((w) => w.action === "match").length,
      linked: workers.filter((w) => w.action === "linked").length,
      skipped: body.resolutions.filter((r) => r.action === "skip").length,
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
