import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const campaignId = Number(id);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json(
        { error: "Invalid campaign ID" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const membership = searchParams.get("membership")?.split(",").filter(Boolean) ?? [];
    const roles = searchParams.get("roles")?.split(",").filter(Boolean) ?? [];
    const employerId = searchParams.get("employer_id");
    const worksiteId = searchParams.get("worksite_id");
    const occupation = searchParams.get("occupation");
    const anTags = searchParams.get("an_tags")?.split(",").filter(Boolean) ?? [];
    const excludeAnTags = searchParams.get("exclude_an_tags")?.split(",").filter(Boolean) ?? [];

    let query = supabase
      .from("campaign_worker_membership")
      .select(
        `
        worker_id,
        membership_status,
        oa_leader_role,
        employer_id,
        worksite_id,
        workers (
          worker_id,
          first_name,
          last_name,
          email,
          phone,
          occupation,
          action_network_id
        ),
        employers (
          employer_name
        ),
        worksites (
          worksite_name
        )
      `
      )
      .eq("campaign_id", campaignId);

    if (membership.length > 0) {
      query = query.in("membership_status", membership);
    }

    if (roles.length > 0) {
      query = query.in("oa_leader_role", roles);
    }

    if (employerId && employerId !== "__all__") {
      query = query.eq("employer_id", Number(employerId));
    }

    if (worksiteId && worksiteId !== "__all__") {
      query = query.eq("worksite_id", Number(worksiteId));
    }

    const { data: membershipRows, error: membershipError } = await query;
    if (membershipError) throw membershipError;

    let workerIds = (membershipRows ?? []).map(
      (r: Record<string, unknown>) => r.worker_id as number
    );

    if (occupation) {
      const { data: occRows, error: occErr } = await supabase
        .from("workers")
        .select("worker_id")
        .in("worker_id", workerIds)
        .ilike("occupation", `%${occupation}%`);
      if (occErr) throw occErr;
      const occSet = new Set((occRows ?? []).map((r) => r.worker_id));
      workerIds = workerIds.filter((id) => occSet.has(id));
    }

    if (anTags.length > 0) {
      const { data: tagRows, error: tagErr } = await supabase
        .from("worker_an_tags")
        .select("worker_id")
        .in("worker_id", workerIds)
        .in("an_tag_id", anTags);
      if (tagErr) throw tagErr;
      const taggedSet = new Set((tagRows ?? []).map((r) => r.worker_id));
      workerIds = workerIds.filter((id) => taggedSet.has(id));
    }

    if (excludeAnTags.length > 0) {
      const { data: exclRows, error: exclErr } = await supabase
        .from("worker_an_tags")
        .select("worker_id")
        .in("worker_id", workerIds)
        .in("an_tag_id", excludeAnTags);
      if (exclErr) throw exclErr;
      const excludedSet = new Set((exclRows ?? []).map((r) => r.worker_id));
      workerIds = workerIds.filter((id) => !excludedSet.has(id));
    }

    const remainingSet = new Set(workerIds);
    const results = (membershipRows ?? [])
      .filter((r: Record<string, unknown>) => remainingSet.has(r.worker_id as number))
      .map((r: Record<string, unknown>) => {
        const worker = r.workers as {
          worker_id: number;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          occupation: string | null;
          action_network_id: string | null;
        } | null;
        const employer = r.employers as { employer_name: string } | null;
        const worksite = r.worksites as { worksite_name: string } | null;

        return {
          worker_id: worker?.worker_id ?? r.worker_id,
          first_name: worker?.first_name ?? "",
          last_name: worker?.last_name ?? "",
          email: worker?.email ?? null,
          phone: worker?.phone ?? null,
          occupation: worker?.occupation ?? null,
          employer_name: employer?.employer_name ?? null,
          worksite_name: worksite?.worksite_name ?? null,
          oa_leader_role: r.oa_leader_role as string | null,
          membership_status: r.membership_status as string | null,
          action_network_id: worker?.action_network_id ?? null,
        };
      });

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
