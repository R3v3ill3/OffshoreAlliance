import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ApplyPayload {
  parent_groups: {
    proposed_parent_name: string;
    existing_parent_id: number | null;
    is_new_parent: boolean;
    member_employer_ids: number[];
  }[];
  category_updates: {
    employer_id: number;
    proposed_category: string;
    expected_updated_at: string;
  }[];
  worksite_updates: {
    worksite_id: number;
    principal_employer_id: number;
    expected_updated_at: string;
  }[];
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (profile?.role !== "admin")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const payload: ApplyPayload = await req.json();
    const adminClient = createAdminClient();

    const { data, error } = await adminClient.rpc(
      "apply_employer_wizard_changes",
      {
        payload: {
          parent_groups: payload.parent_groups,
          category_updates: payload.category_updates,
          worksite_updates: payload.worksite_updates,
          admin_user_id: user.id,
        },
      }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
