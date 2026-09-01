import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit-middleware";
import { getSmsProvider, type SenderId } from "@/lib/sms/provider";
import type { SmsNumberRow, SmsNumberPurpose } from "@/types/sms";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Unauthorized", status: 401, supabase: null };

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profileError || profile?.role !== "admin")
    return { error: "Forbidden", status: 403, supabase: null };

  return { error: null, status: 200, supabase };
}

export interface SmsStatusResponse {
  provider: string;
  balance: number | null;
  senders: SenderId[];
  providerError: string | null;
  numbers: (SmsNumberRow & { organiser_name: string | null })[];
  organisers: { organiser_id: number; organiser_name: string }[];
  workersMissingE164: number;
}

export async function GET(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(request);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: rateLimitResult.reason },
      { status: 429, headers: rateLimitResult.headers }
    );
  }

  const { error, status, supabase } = await requireAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  // Provider readouts fail soft — a bad credential must not break the card.
  let providerName = "mock";
  let balance: number | null = null;
  let senders: SenderId[] = [];
  let providerError: string | null = null;
  try {
    const provider = await getSmsProvider();
    providerName = provider.name;
    [balance, senders] = await Promise.all([
      provider.getCreditBalance(),
      provider.listSenders(),
    ]);
  } catch (err) {
    providerError = err instanceof Error ? err.message : "Provider unavailable";
  }

  const [{ data: numbers }, { data: organisers }, { count: missingCount }] =
    await Promise.all([
      supabase
        .from("sms_numbers")
        .select("*, organisers(organiser_name)")
        .order("number_id"),
      supabase
        .from("organisers")
        .select("organiser_id, organiser_name")
        .eq("is_active", true)
        .order("organiser_name"),
      supabase
        .from("workers")
        .select("worker_id", { count: "exact", head: true })
        .not("phone", "is", null)
        .is("phone_e164", null),
    ]);

  const numberRows = ((numbers ?? []) as unknown as (SmsNumberRow & {
    organisers: { organiser_name: string } | null;
  })[]).map(({ organisers: org, ...row }) => ({
    ...row,
    organiser_name: org?.organiser_name ?? null,
  }));

  return NextResponse.json({
    provider: providerName,
    balance,
    senders,
    providerError,
    numbers: numberRows,
    organisers: organisers ?? [],
    workersMissingE164: missingCount ?? 0,
  } satisfies SmsStatusResponse);
}

interface AssignBody {
  action: "assign";
  number_id: number;
  purpose: SmsNumberPurpose;
  organiser_id?: number | null;
}

interface AddNumberBody {
  action: "add_number";
  phone_e164: string;
  label?: string | null;
}

interface SetStatusBody {
  action: "set_status";
  number_id: number;
  status: "active" | "retired";
}

interface DeleteNumberBody {
  action: "delete_number";
  number_id: number;
}

export async function POST(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(request);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: rateLimitResult.reason },
      { status: 429, headers: rateLimitResult.headers }
    );
  }

  const { error, status, supabase } = await requireAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  let body: AssignBody | AddNumberBody | SetStatusBody | DeleteNumberBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.action === "assign") {
    if (!body.number_id || !body.purpose) {
      return NextResponse.json({ error: "number_id and purpose required" }, { status: 400 });
    }
    const { error: rpcError } = await supabase.rpc("assign_sms_number", {
      p_number_id: body.number_id,
      p_purpose: body.purpose,
      p_organiser_id: body.organiser_id ?? null,
    });
    if (rpcError) {
      // RAISE EXCEPTION messages from assign_sms_number are validation
      // failures (bad purpose/organiser, retired/unknown number), not
      // server faults.
      const isValidation = rpcError.message.includes("assign_sms_number:");
      return NextResponse.json({ error: rpcError.message }, { status: isValidation ? 400 : 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (body.action === "add_number") {
    const phone = (body.phone_e164 ?? "").trim();
    if (!/^\+614\d{8}$/.test(phone)) {
      return NextResponse.json(
        { error: "phone_e164 must be an AU mobile in E.164 form (+614xxxxxxxx)" },
        { status: 400 }
      );
    }
    const { error: insertError } = await supabase.from("sms_numbers").insert({
      phone_e164: phone,
      label: body.label?.trim() || null,
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === "set_status") {
    if (!body.number_id || (body.status !== "active" && body.status !== "retired")) {
      return NextResponse.json(
        { error: "number_id and a status of 'active' or 'retired' required" },
        { status: 400 }
      );
    }
    const { error: updateError } = await supabase
      .from("sms_numbers")
      .update({ status: body.status })
      .eq("number_id", body.number_id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === "delete_number") {
    if (!body.number_id) {
      return NextResponse.json({ error: "number_id required" }, { status: 400 });
    }
    const { error: deleteError } = await supabase
      .from("sms_numbers")
      .delete()
      .eq("number_id", body.number_id);
    if (deleteError) {
      // 23503 = foreign-key violation: the number is still referenced by a
      // conversation, relay, or survey. Postgres blocks the delete; disabling
      // (retiring) is the safe path for a number that has been in service.
      if (deleteError.code === "23503") {
        return NextResponse.json(
          {
            error:
              "This number is used by existing conversations, relays, or surveys and can't be deleted. Disable it instead.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
