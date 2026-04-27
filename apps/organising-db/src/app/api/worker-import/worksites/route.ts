import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { WorksiteType } from "@/types/database";

interface CreateImportWorksiteRequest {
  worksiteName: string;
  worksiteType: WorksiteType;
  employerId: number | null;
  employerRoleType?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateImportWorksiteRequest;
  try {
    body = (await request.json()) as CreateImportWorksiteRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const worksiteName = body.worksiteName?.trim();
  if (!worksiteName || !body.worksiteType) {
    return NextResponse.json(
      { success: false, error: "worksiteName and worksiteType are required" },
      { status: 400 }
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("worksites")
    .select("*")
    .ilike("worksite_name", worksiteName)
    .limit(1)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ success: false, error: existingError.message }, { status: 500 });
  }

  let worksite = existing;
  if (!worksite) {
    const { data: inserted, error } = await supabase
      .from("worksites")
      .insert({
        worksite_name: worksiteName,
        worksite_type: body.worksiteType,
        ...(body.employerId ? { principal_employer_id: body.employerId } : {}),
      })
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    worksite = inserted;
  }

  if (body.employerId && worksite?.worksite_id) {
    const { error: roleError } = await supabase.from("employer_worksite_roles").upsert(
      {
        employer_id: body.employerId,
        worksite_id: worksite.worksite_id,
        role_type: body.employerRoleType || "Other",
        is_current: true,
      },
      { onConflict: "employer_id,worksite_id,role_type", ignoreDuplicates: true }
    );
    if (roleError) {
      return NextResponse.json(
        {
          success: false,
          error: `Worksite saved, but employer link failed: ${roleError.message}`,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    worksite,
    reusedExisting: !!existing,
  });
}
