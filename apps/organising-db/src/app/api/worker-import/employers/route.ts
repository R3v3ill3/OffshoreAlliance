import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface CreateImportEmployerRequest {
  employerName: string;
  tradingName?: string | null;
  employerCategory?: string | null;
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

  let body: CreateImportEmployerRequest;
  try {
    body = (await request.json()) as CreateImportEmployerRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const employerName = body.employerName?.trim();
  if (!employerName) {
    return NextResponse.json(
      { success: false, error: "employerName is required" },
      { status: 400 }
    );
  }

  // Reuse an existing employer when the name already matches (case-insensitive)
  // so imports never create duplicate employer records.
  const { data: existing, error: existingError } = await supabase
    .from("employers")
    .select("employer_id, employer_name, trading_name")
    .ilike("employer_name", employerName)
    .limit(1)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ success: false, error: existingError.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ success: true, employer: existing, reusedExisting: true });
  }

  const { data: inserted, error } = await supabase
    .from("employers")
    .insert({
      employer_name: employerName,
      trading_name: body.tradingName?.trim() || null,
      employer_category: body.employerCategory?.trim() || null,
      is_active: true,
    })
    .select("employer_id, employer_name, trading_name")
    .single();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, employer: inserted, reusedExisting: false });
}
