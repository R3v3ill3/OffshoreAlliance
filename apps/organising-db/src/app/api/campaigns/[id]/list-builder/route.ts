import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCampaignMembershipStatus } from "@/lib/campaign/constants";

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

    // Sorting params
    type SortKey =
      | "name_asc"
      | "name_desc"
      | "worksite"
      | "employer"
      | "membership"
      | "recent_contact"
      | "priority_score_desc";
    const VALID_SORT_KEYS = new Set<string>([
      "name_asc",
      "name_desc",
      "worksite",
      "employer",
      "membership",
      "recent_contact",
      "priority_score_desc",
    ]);
    const sortRaw = searchParams.get("sort") ?? "name_asc";
    const sortKey: SortKey = VALID_SORT_KEYS.has(sortRaw)
      ? (sortRaw as SortKey)
      : "name_asc";
    const sortDirRaw = searchParams.get("sort_dir");
    // sort_dir overrides key-implied direction when supplied
    const sortDirOverride: "asc" | "desc" | null =
      sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : null;

    const query = supabase
      .from("campaign_worker_membership")
      .select(
        `
        worker_id,
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
          is_bargaining_rep,
          action_network_id,
          employers ( employer_name ),
          worksites ( worksite_name ),
          member_role_type:member_role_types ( role_name, display_name ),
          union_membership_type:union_membership_types ( type_name ),
          non_oa_union_option:non_oa_union_options!workers_non_oa_union_option_id_fkey ( badge_initials )
        )
      `
      )
      .eq("campaign_id", campaignId);

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
        is_bargaining_rep: boolean | null;
        action_network_id: string | null;
        employers: { employer_name: string } | null;
        worksites: { worksite_name: string } | null;
        member_role_type:
          | { role_name: string; display_name: string }
          | { role_name: string; display_name: string }[]
          | null;
        union_membership_type: { type_name: string } | { type_name: string }[] | null;
        non_oa_union_option: { badge_initials: string } | { badge_initials: string }[] | null;
      };

      const mrt = Array.isArray(worker.member_role_type) ? worker.member_role_type[0] : worker.member_role_type;
      const umt = Array.isArray(worker.union_membership_type)
        ? worker.union_membership_type[0]
        : worker.union_membership_type;
      const nuo = Array.isArray(worker.non_oa_union_option)
        ? worker.non_oa_union_option[0]
        : worker.non_oa_union_option;
      const membershipStatus = getCampaignMembershipStatus({
        unionMembershipTypeName: umt?.type_name,
        memberRoleName: mrt?.role_name,
        isBargainingRep: worker.is_bargaining_rep,
      });

      return {
        worker_id: worker.worker_id,
        first_name: worker.first_name,
        last_name: worker.last_name,
        email: worker.email,
        phone: worker.phone,
        occupation: worker.occupation,
        employer_name: worker.employers?.employer_name ?? null,
        worksite_name: worker.worksites?.worksite_name ?? null,
        organising_role: mrt?.display_name ?? null,
        organising_role_name: mrt?.role_name ?? null,
        is_bargaining_rep: worker.is_bargaining_rep ?? false,
        membership_status: membershipStatus,
        union_membership_type_name: umt?.type_name ?? null,
        non_oa_union_badge_initials: nuo?.badge_initials ?? null,
        action_network_id: worker.action_network_id,
        employer_id: worker.employer_id,
        worksite_id: worker.worksite_id,
        unit_count: 0,
        is_multi_unit_member: false,
      };
    });

    if (roles.length > 0) {
      results = results.filter((w) => w.organising_role_name && roles.includes(w.organising_role_name));
    }

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
      // Accept either a single substring (legacy) or a comma-separated list
      // of exact occupation values produced by the new occupation dropdown.
      const parts = occupation
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        const set = new Set(parts.map((p) => p.toLowerCase()));
        results = results.filter(
          (w) => !!w.occupation && set.has(w.occupation.toLowerCase())
        );
      } else if (parts.length === 1) {
        // Preserve substring behaviour for single-value callers that still
        // rely on "contains" matching.
        const q = parts[0].toLowerCase();
        results = results.filter((w) =>
          w.occupation?.toLowerCase().includes(q)
        );
      }
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

    // --- Sort ---
    // For recent_contact / priority_score_desc we need last_contacted_at from
    // worker_campaign_connections. Fetch it only when needed.
    let connectionContactMap = new Map<number, string | null>();
    const finalWorkerIds = results.map((w) => w.worker_id);
    if (
      (sortKey === "recent_contact" || sortKey === "priority_score_desc") &&
      finalWorkerIds.length > 0
    ) {
      const { data: connRows } = await supabase
        .from("worker_campaign_connections")
        .select("worker_id, last_contacted_at")
        .eq("campaign_id", campaignId)
        .in("worker_id", finalWorkerIds);
      if (connRows) {
        connectionContactMap = new Map(
          connRows.map((r) => [r.worker_id, r.last_contacted_at as string | null])
        );
      }
    }

    const MEMBERSHIP_SORT_ORDER: Record<string, number> = {
      member_pending: 0,
      member: 1,
      lapsed: 2,
      non_member: 3,
    };

    function strCmp(a: string | null, b: string | null): number {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    }

    results = results.sort((a, b) => {
      switch (sortKey) {
        case "name_desc": {
          const dir = sortDirOverride ?? "desc";
          const cmp = strCmp(
            `${a.first_name} ${a.last_name}`,
            `${b.first_name} ${b.last_name}`
          );
          return dir === "desc" ? -cmp : cmp;
        }
        case "worksite": {
          const dir = sortDirOverride ?? "asc";
          const cmp = strCmp(a.worksite_name, b.worksite_name);
          return dir === "desc" ? -cmp : cmp;
        }
        case "employer": {
          const dir = sortDirOverride ?? "asc";
          const cmp = strCmp(a.employer_name, b.employer_name);
          return dir === "desc" ? -cmp : cmp;
        }
        case "membership": {
          const dir = sortDirOverride ?? "asc";
          const ao = MEMBERSHIP_SORT_ORDER[a.membership_status ?? "non_member"] ?? 3;
          const bo = MEMBERSHIP_SORT_ORDER[b.membership_status ?? "non_member"] ?? 3;
          const cmp = ao - bo;
          return dir === "desc" ? -cmp : cmp;
        }
        case "recent_contact":
        case "priority_score_desc": {
          const dir = sortDirOverride ?? "desc";
          const at = connectionContactMap.get(a.worker_id) ?? null;
          const bt = connectionContactMap.get(b.worker_id) ?? null;
          // nulls last for recent_contact (never contacted goes to end)
          if (at == null && bt == null) return 0;
          if (at == null) return 1;
          if (bt == null) return -1;
          const cmp = at < bt ? -1 : at > bt ? 1 : 0;
          return dir === "desc" ? -cmp : cmp;
        }
        case "name_asc":
        default: {
          const dir = sortDirOverride ?? "asc";
          const cmp = strCmp(
            `${a.first_name} ${a.last_name}`,
            `${b.first_name} ${b.last_name}`
          );
          return dir === "desc" ? -cmp : cmp;
        }
      }
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
