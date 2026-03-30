import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface MergeEmployersPayload {
  survivor_employer_id: number;
  victim_employer_ids: number[];
  canonical_employer_name?: string;
  alias_names?: string[];
  extra_aliases?: string[];
  expected_survivor_updated_at?: string | null;
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

    const body = (await req.json()) as MergeEmployersPayload;
    const {
      survivor_employer_id,
      victim_employer_ids,
      canonical_employer_name,
      alias_names,
      extra_aliases,
      expected_survivor_updated_at,
    } = body;

    if (
      survivor_employer_id == null ||
      !Array.isArray(victim_employer_ids) ||
      victim_employer_ids.length < 1
    ) {
      return NextResponse.json(
        { error: "survivor_employer_id and victim_employer_ids are required." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient.rpc("merge_employers", {
      payload: {
        survivor_employer_id,
        victim_employer_ids,
        ...(canonical_employer_name != null && canonical_employer_name !== ""
          ? { canonical_employer_name }
          : {}),
        ...(alias_names != null && alias_names.length > 0 ? { alias_names } : {}),
        ...(extra_aliases != null && extra_aliases.length > 0
          ? { extra_aliases }
          : {}),
        ...(expected_survivor_updated_at != null
          ? { expected_survivor_updated_at }
          : {}),
        admin_user_id: user.id,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data as Record<string, unknown>;
    if (result?.success === false) {
      const err = String(result.error ?? "merge_failed");
      const status =
        err === "stale_data" || err === "parent_child_conflict" ? 409 : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
