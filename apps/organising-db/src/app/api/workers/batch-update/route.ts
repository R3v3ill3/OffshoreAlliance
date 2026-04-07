import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const batchUpdateSchema = z.object({
  worker_ids: z.array(z.number().int().positive()).min(1).max(500),
  updates: z
    .object({
      employer_id: z.number().int().positive().optional(),
      worksite_id: z.number().int().positive().optional(),
      union_membership_type_id: z.number().int().positive().optional(),
      member_role_type_id: z.number().int().positive().optional(),
      canonical_occupation_id: z.number().int().positive().optional(),
      is_active: z.boolean().optional(),
      is_hsr: z.boolean().optional(),
    })
    .optional(),
  agreement_updates: z
    .object({
      add_agreement_ids: z.array(z.number().int().positive()).optional(),
      remove_agreement_ids: z.array(z.number().int().positive()).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
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

  // Check write permission via profile role
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

  let body: z.infer<typeof batchUpdateSchema>;
  try {
    const raw = await request.json();
    body = batchUpdateSchema.parse(raw);
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

  const { worker_ids, updates, agreement_updates } = body;
  let workersUpdated = 0;
  let agreementsAdded = 0;
  let agreementsRemoved = 0;

  // Apply scalar field updates
  if (updates && Object.keys(updates).length > 0) {
    const { error, count } = await supabase
      .from("workers")
      .update(updates)
      .in("worker_id", worker_ids);

    if (error) {
      return NextResponse.json(
        { success: false, error: `Update failed: ${error.message}` },
        { status: 500 }
      );
    }
    workersUpdated = count ?? worker_ids.length;
  }

  // Add agreements (upsert to avoid duplicates)
  if (agreement_updates?.add_agreement_ids?.length) {
    const rows = worker_ids.flatMap((wid) =>
      agreement_updates.add_agreement_ids!.map((aid) => ({
        worker_id: wid,
        agreement_id: aid,
      }))
    );

    const { error, count } = await supabase
      .from("worker_agreements")
      .upsert(rows, { onConflict: "worker_id,agreement_id", ignoreDuplicates: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: `Agreement add failed: ${error.message}` },
        { status: 500 }
      );
    }
    agreementsAdded = count ?? rows.length;
  }

  // Remove agreements
  if (agreement_updates?.remove_agreement_ids?.length) {
    const { error, count } = await supabase
      .from("worker_agreements")
      .delete()
      .in("worker_id", worker_ids)
      .in("agreement_id", agreement_updates.remove_agreement_ids);

    if (error) {
      return NextResponse.json(
        { success: false, error: `Agreement remove failed: ${error.message}` },
        { status: 500 }
      );
    }
    agreementsRemoved = count ?? 0;
  }

  return NextResponse.json({
    success: true,
    workers_updated: workersUpdated,
    agreements_added: agreementsAdded,
    agreements_removed: agreementsRemoved,
  });
}
