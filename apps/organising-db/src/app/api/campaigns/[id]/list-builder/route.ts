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
    const ouId = searchParams.get("ou_id");
    const ouType = searchParams.get("ou_type");
    const multiUnitOnly = searchParams.get("multi_unit_only") === "true";
    const anTags = searchParams.get("an_tags")?.split(",").filter(Boolean) ?? [];
    const excludeAnTags = searchParams.get("exclude_an_tags")?.split(",").filter(Boolean) ?? [];

    let query = supabase
      .from("campaign_worker_membership")
      .select(
        `
        worker_id,
        oa_leader_role,
        workers!inner (
          worker_id,
          first_name,
          last_name,
          email,
          phone,
          occupation,
          employer_id,
          worksite_id,
          member_role_type_id,
          action_network_id,
          employers ( employer_name ),
          worksites ( worksite_name )
        )
      `
      )
      .eq("campaign_id", campaignId);

    if (roles.length > 0) {
      query = query.in("oa_leader_role", roles);
    }

    const { data: membershipRows, error: membershipError } = await query;
    if (membershipError) throw membershipError;

    let results = (membershipRows ?? []).map((r: Record<string, unknown>) => {
      const worker = r.workers as {
        worker_id: number;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        occupation: string | null;
        employer_id: number | null;
        worksite_id: number | null;
        member_role_type_id: number | null;
        action_network_id: string | null;
        employers: { employer_name: string } | null;
        worksites: { worksite_name: string } | null;
      };

      const membershipStatus = worker.member_role_type_id ? "member" : "non_member";

      return {
        worker_id: worker.worker_id,
        first_name: worker.first_name,
        last_name: worker.last_name,
        email: worker.email,
        phone: worker.phone,
        occupation: worker.occupation,
        employer_name: worker.employers?.employer_name ?? null,
        worksite_name: worker.worksites?.worksite_name ?? null,
        oa_leader_role: r.oa_leader_role as string | null,
        membership_status: membershipStatus,
        action_network_id: worker.action_network_id,
        employer_id: worker.employer_id,
        worksite_id: worker.worksite_id,
      };
    });

    if (membership.length > 0) {
      results = results.filter((w) => membership.includes(w.membership_status));
    }

    if (employerId && employerId !== "__all__") {
      const eid = Number(employerId);
      results = results.filter((w) => w.employer_id === eid);
    }

    if (worksiteId && worksiteId !== "__all__") {
      const wid = Number(worksiteId);
      results = results.filter((w) => w.worksite_id === wid);
    }

    if (occupation) {
      const q = occupation.toLowerCase();
      results = results.filter((w) => w.occupation?.toLowerCase().includes(q));
    }

    if (ouId || ouType) {
      const workerIdsBeforeOu = results.map((w) => w.worker_id);
      if (workerIdsBeforeOu.length > 0) {
        let ouQuery = supabase
          .from("campaign_worker_ou")
          .select(
            `worker_id, ou:campaign_organising_units!inner(ou_id, campaign_id, ou_type)`
          )
          .in("worker_id", workerIdsBeforeOu);

        if (ouId) {
          const numericOuId = Number(ouId);
          if (Number.isFinite(numericOuId)) {
            ouQuery = ouQuery.eq("ou_id", numericOuId);
          }
        }

        if (ouType && ouType !== "__all__") {
          ouQuery = ouQuery.eq("ou.ou_type", ouType);
        }

        const { data: ouRows, error: ouErr } = await ouQuery;
        if (ouErr) throw ouErr;
        const allowedWorkers = new Set(
          (ouRows ?? [])
            .filter((row: Record<string, unknown>) => {
              const ou = row.ou as { campaign_id?: number } | { campaign_id?: number }[] | null;
              const joined = Array.isArray(ou) ? ou[0] : ou;
              return joined?.campaign_id === campaignId;
            })
            .map((row: Record<string, unknown>) => row.worker_id as number)
        );
        results = results.filter((w) => allowedWorkers.has(w.worker_id));
      } else {
        results = [];
      }
    }

    let workerIds = results.map((w) => w.worker_id);

    if (anTags.length > 0 && workerIds.length > 0) {
      const { data: tagRows, error: tagErr } = await supabase
        .from("worker_an_tags")
        .select("worker_id")
        .in("worker_id", workerIds)
        .in("an_tag_id", anTags);
      if (tagErr) throw tagErr;
      const taggedSet = new Set((tagRows ?? []).map((r) => r.worker_id));
      results = results.filter((w) => taggedSet.has(w.worker_id));
    }

    if (excludeAnTags.length > 0 && workerIds.length > 0) {
      const { data: exclRows, error: exclErr } = await supabase
        .from("worker_an_tags")
        .select("worker_id")
        .in("worker_id", workerIds)
        .in("an_tag_id", excludeAnTags);
      if (exclErr) throw exclErr;
      const excludedSet = new Set((exclRows ?? []).map((r) => r.worker_id));
      results = results.filter((w) => !excludedSet.has(w.worker_id));
    }

    workerIds = results.map((w) => w.worker_id);

    let summaryByWorker = new Map<number, { unit_count: number; is_multi_unit_member: boolean }>();
    if (workerIds.length > 0) {
      const { data: summaryRows, error: summaryErr } = await supabase
        .from("campaign_worker_unit_membership_summary")
        .select("worker_id, unit_count, is_multi_unit_member")
        .eq("campaign_id", campaignId)
        .in("worker_id", workerIds);
      if (summaryErr) throw summaryErr;
      summaryByWorker = new Map(
        (summaryRows ?? []).map((r) => [
          r.worker_id,
          {
            unit_count: r.unit_count ?? 0,
            is_multi_unit_member: !!r.is_multi_unit_member,
          },
        ])
      );
    }

    results = results.map((w) => {
      const summary = summaryByWorker.get(w.worker_id) ?? {
        unit_count: 0,
        is_multi_unit_member: false,
      };
      return {
        ...w,
        unit_count: summary.unit_count,
        is_multi_unit_member: summary.is_multi_unit_member,
      };
    });

    if (multiUnitOnly) {
      results = results.filter((w) => w.is_multi_unit_member);
    }

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
