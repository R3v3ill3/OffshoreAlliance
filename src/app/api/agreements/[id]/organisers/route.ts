import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AgreementOrgRole } from "@/types/database";

const VALID_ROLES: AgreementOrgRole[] = ["organiser", "lead", "industrial_officer"];

async function getCallerAndCheck(serverClient: Awaited<ReturnType<typeof createClient>>) {
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

// GET /api/agreements/[id]/organisers
// Returns assigned organisers with user profile and organiser details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const serverClient = await createClient();
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await serverClient
      .from("agreement_organisers")
      .select(
        `id, organiser_id, is_primary, agreement_role,
         organiser:organisers(organiser_id, organiser_name, email),
         user_profile:user_profiles!inner(user_id, display_name, work_role, reports_to)`
      )
      .eq("agreement_id", id)
      .order("is_primary", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("GET agreement organisers error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

// POST /api/agreements/[id]/organisers
// Add an organiser to an agreement
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const serverClient = await createClient();
    const caller = await getCallerAndCheck(serverClient);
    if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { organiserId, agreementRole, isPrimary } = await request.json();

    if (!organiserId) {
      return NextResponse.json({ error: "organiserId is required" }, { status: 400 });
    }
    if (agreementRole && !VALID_ROLES.includes(agreementRole)) {
      return NextResponse.json({ error: "Invalid agreementRole" }, { status: 400 });
    }

    // If setting as primary, clear any existing primary first
    if (isPrimary) {
      await serverClient
        .from("agreement_organisers")
        .update({ is_primary: false })
        .eq("agreement_id", id)
        .eq("is_primary", true);
    }

    const { data, error } = await serverClient
      .from("agreement_organisers")
      .insert({
        agreement_id: parseInt(id, 10),
        organiser_id: organiserId,
        agreement_role: agreementRole ?? "organiser",
        is_primary: isPrimary ?? false,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("POST agreement organisers error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

// PATCH /api/agreements/[id]/organisers
// Update an assignment (set primary or change role)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const serverClient = await createClient();
    const caller = await getCallerAndCheck(serverClient);
    if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { assignmentId, isPrimary, agreementRole } = await request.json();

    if (!assignmentId) {
      return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
    }
    if (agreementRole && !VALID_ROLES.includes(agreementRole)) {
      return NextResponse.json({ error: "Invalid agreementRole" }, { status: 400 });
    }

    // If promoting to primary, clear any existing primary first
    if (isPrimary) {
      await serverClient
        .from("agreement_organisers")
        .update({ is_primary: false })
        .eq("agreement_id", id)
        .eq("is_primary", true);
    }

    const updates: Record<string, unknown> = {};
    if (isPrimary !== undefined) updates.is_primary = isPrimary;
    if (agreementRole !== undefined) updates.agreement_role = agreementRole;

    const { data, error } = await serverClient
      .from("agreement_organisers")
      .update(updates)
      .eq("id", assignmentId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH agreement organisers error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

// DELETE /api/agreements/[id]/organisers?assignmentId=X
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const serverClient = await createClient();
    const caller = await getCallerAndCheck(serverClient);
    if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const assignmentId = request.nextUrl.searchParams.get("assignmentId");
    if (!assignmentId) {
      return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
    }

    const { error } = await serverClient
      .from("agreement_organisers")
      .delete()
      .eq("id", assignmentId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE agreement organisers error:", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
