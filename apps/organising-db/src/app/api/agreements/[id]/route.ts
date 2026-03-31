import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AgreementStatus } from "@/types/database";

const VALID_STATUSES: AgreementStatus[] = [
  "Current",
  "Expired",
  "Under_Negotiation",
  "Terminated",
];

async function getCallerAndCheck(
  serverClient: Awaited<ReturnType<typeof createClient>>
) {
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();
  if (authError || !user) return null;

  const { data: profile } = await serverClient
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return profile?.role === "admin" || profile?.role === "user" ? profile : null;
}

// PATCH /api/agreements/[id]
// Update core agreement fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agreementId = parseInt(id, 10);
    if (!Number.isFinite(agreementId)) {
      return NextResponse.json({ error: "Invalid agreement id" }, { status: 400 });
    }

    const serverClient = await createClient();
    const caller = await getCallerAndCheck(serverClient);
    if (!caller) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    const {
      decision_no,
      agreement_name,
      short_name,
      sector_id,
      employer_id,
      industry_classification,
      date_of_decision,
      commencement_date,
      expiry_date,
      status,
      is_greenfield,
      is_variation,
      fwc_link,
      notes,
    } = body;

    if (!decision_no || !agreement_name) {
      return NextResponse.json(
        { error: "decision_no and agreement_name are required" },
        { status: 400 }
      );
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      decision_no: String(decision_no).trim(),
      agreement_name: String(agreement_name).trim(),
      short_name: short_name ? String(short_name).trim() || null : null,
      sector_id: sector_id ? Number(sector_id) : null,
      employer_id: employer_id ? Number(employer_id) : null,
      industry_classification: industry_classification
        ? String(industry_classification).trim() || null
        : null,
      date_of_decision: date_of_decision || null,
      commencement_date: commencement_date || null,
      expiry_date: expiry_date || null,
      status: status ?? "Current",
      is_greenfield: Boolean(is_greenfield),
      is_variation: Boolean(is_variation),
      fwc_link: fwc_link ? String(fwc_link).trim() || null : null,
      notes: notes ? String(notes).trim() || null : null,
    };

    const { data, error } = await serverClient
      .from("agreements")
      .update(payload)
      .eq("agreement_id", agreementId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH agreement error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
