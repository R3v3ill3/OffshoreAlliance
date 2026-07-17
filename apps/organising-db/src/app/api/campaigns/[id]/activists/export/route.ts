import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffUser } from "@/lib/campaign/auth-api";
import * as XLSX from "xlsx";

/**
 * Activist & WOC Tracker export — a five-sheet workbook mirroring the
 * OA tracker (Activist Register · Tasking Log · Structure Tests ·
 * WOC Log · Coverage Map), for offline/site use.
 *
 *   GET /api/campaigns/123/activists/export
 *   GET /api/campaigns/123/activists/export?group=45      (one group's units)
 *   GET /api/campaigns/123/activists/export?archived=1    (include archived)
 */

const RATING_LABELS: Record<number, string> = {
  0: "Unassessed",
  1: "Supportive leader",
  2: "Supporter",
  3: "Neutral",
  4: "Opposed",
  5: "Oppositional leader",
};

function ratingLabel(value: number | null | undefined): string {
  if (value == null) return "Unassessed";
  return RATING_LABELS[Math.round(value)] ?? "Unassessed";
}

function pct(numerator: number | null, denominator: number | null): string {
  if (!numerator || !denominator || denominator === 0) return "";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const campaignId = Number.parseInt(id, 10);
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    const supabase = await createClient();
    const staff = await requireStaffUser(supabase);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const groupOuId = url.searchParams.get("group")
      ? Number(url.searchParams.get("group"))
      : null;
    const includeArchived = url.searchParams.get("archived") === "1";

    const [
      { data: campaign },
      { data: register },
      { data: tasks },
      { data: tests },
      { data: testResults },
      { data: coverage },
      { data: wocMeetings },
      { data: wocMembers },
      { data: workerOus },
    ] = await Promise.all([
      supabase
        .from("campaigns")
        .select("name")
        .eq("campaign_id", campaignId)
        .maybeSingle(),
      supabase
        .from("v_campaign_activist_register")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("worker_name"),
      supabase
        .from("activist_tasks")
        .select("*, workers(first_name, last_name)")
        .eq("campaign_id", campaignId)
        .order("assigned_at", { ascending: false }),
      supabase
        .from("structure_tests")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("test_number"),
      supabase
        .from("structure_test_results")
        .select("*, workers(first_name, last_name), structure_tests!inner(campaign_id)")
        .eq("structure_tests.campaign_id", campaignId),
      supabase
        .from("v_campaign_coverage_map")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("ou_name"),
      supabase
        .from("woc_committee_meetings")
        .select("*, campaign_wocs!inner(campaign_id, name), workers!woc_committee_meetings_chair_worker_id_fkey(first_name, last_name)")
        .eq("campaign_wocs.campaign_id", campaignId)
        .order("meeting_date", { ascending: false }),
      supabase
        .from("woc_members")
        .select("woc_id, worker_id, woc_role, left_on, campaign_wocs!inner(campaign_id)")
        .eq("campaign_wocs.campaign_id", campaignId),
      supabase
        .from("campaign_worker_ou")
        .select("ou_id, worker_id, is_primary, campaign_organising_units!inner(campaign_id, name)")
        .eq("campaign_organising_units.campaign_id", campaignId),
    ]);

    // Optional group scoping: restrict to the subtree under a group OU.
    const allUnits = coverage ?? [];
    let unitIds: Set<number> | null = null;
    if (groupOuId != null) {
      unitIds = new Set<number>([groupOuId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const u of allUnits) {
          if (
            u.ou_id != null &&
            u.parent_ou_id != null &&
            unitIds.has(u.parent_ou_id) &&
            !unitIds.has(u.ou_id)
          ) {
            unitIds.add(u.ou_id);
            grew = true;
          }
        }
      }
    }

    const scopedWorkerIds =
      unitIds == null
        ? null
        : new Set(
            (workerOus ?? [])
              .filter((a) => unitIds!.has(a.ou_id))
              .map((a) => a.worker_id)
          );

    const unitNamesByWorker = new Map<number, string[]>();
    for (const a of workerOus ?? []) {
      const ouName =
        (a.campaign_organising_units as unknown as { name: string } | null)?.name ??
        "";
      if (!ouName) continue;
      const list = unitNamesByWorker.get(a.worker_id) ?? [];
      list.push(ouName);
      unitNamesByWorker.set(a.worker_id, list);
    }

    const inScope = (workerId: number | null | undefined) =>
      workerId != null && (scopedWorkerIds == null || scopedWorkerIds.has(workerId));

    // ── Sheet 1 · Activist Register ──────────────────────────────
    const registerRows = (register ?? [])
      .filter((r) => (includeArchived || !r.is_archived) && inScope(r.worker_id))
      .map((r) => ({
        Name: r.worker_name,
        "Crew / unit(s)": (unitNamesByWorker.get(r.worker_id!) ?? []).join(", "),
        Role: r.role_display_name ?? "",
        Membership: r.union_membership_type ?? "",
        "Assessment (0–5)": ratingLabel(r.current_rating),
        "Ladder rung": r.current_rung ?? "",
        "4A stage": r.four_a_stage ?? "",
        Domain: r.domain ?? "",
        "Identified via": r.identified_via ?? "",
        "Recruited by": r.recruited_by_text ?? "",
        "Recruited on": r.recruited_at ?? "",
        "Followers test": r.followers_evidence ?? "",
        "SKAB / training needs": r.skab_notes ?? "",
        "Current task": r.current_task_responsibility ?? "",
        "Last contact": r.last_contact_date ?? "",
        "Next contact": r.next_contact_date ?? "",
        WOC: (r.woc_names ?? []).join(", "),
        Notes: r.notes ?? "",
        Source: r.source ?? "",
        Archived: r.is_archived ? "Y" : "",
      }));

    // ── Sheet 2 · Tasking Log ────────────────────────────────────
    const taskRows = (tasks ?? [])
      .filter((t) => inScope(t.worker_id))
      .map((t) => {
        const w = t.workers as unknown as {
          first_name: string;
          last_name: string;
        } | null;
        return {
          "Date assigned": t.assigned_at ?? "",
          Activist: w ? `${w.first_name} ${w.last_name}` : "",
          "Task / responsibility": t.responsibility,
          "Why it matters": t.why_it_matters ?? "",
          "Ladder rung": t.rung ?? "",
          "Assist plan": [t.walkthrough_plan, t.inoculation]
            .filter(Boolean)
            .join(" · "),
          "Due date": t.due_date ?? "",
          Status: t.status,
          Outcome: t.outcome ?? "",
          "Outcome notes": t.outcome_notes ?? "",
          "Debrief date": t.debrief_date ?? "",
          Acknowledgement: t.acknowledgement ?? "",
          "Campaign moment": t.campaign_moment ?? "",
        };
      });

    // ── Sheet 3 · Structure Tests ────────────────────────────────
    const testById = new Map((tests ?? []).map((t) => [t.structure_test_id, t]));
    const unitNameById = new Map(
      allUnits.filter((u) => u.ou_id != null).map((u) => [u.ou_id!, u.ou_name ?? ""])
    );
    const testRows = (testResults ?? [])
      .filter((r) => unitIds == null || unitIds.has(r.ou_id))
      .map((r) => {
        const t = testById.get(r.structure_test_id);
        const leader = r.workers as unknown as {
          first_name: string;
          last_name: string;
        } | null;
        return {
          "Test #": t?.test_number ?? "",
          Date: t?.test_date ?? "",
          Test: t?.title ?? "",
          Target: t?.target_description ?? "",
          "Crew / unit": unitNameById.get(r.ou_id) ?? "",
          Eligible: r.eligible ?? "",
          Participated: r.participated ?? "",
          "Participation %": pct(r.participated, r.eligible),
          "Pass?": r.passed == null ? "" : r.passed ? "Y" : "N",
          "Leader responsible": leader
            ? `${leader.first_name} ${leader.last_name}`
            : "",
          "What it showed": r.learnings ?? t?.learnings ?? "",
        };
      });

    // ── Sheet 4 · WOC Log ────────────────────────────────────────
    const activeMembersByWoc = new Map<number, number>();
    for (const m of wocMembers ?? []) {
      if (m.left_on != null) continue;
      activeMembersByWoc.set(m.woc_id, (activeMembersByWoc.get(m.woc_id) ?? 0) + 1);
    }
    const taskRollup = new Map<number, { total: number; done: number }>();
    for (const t of tasks ?? []) {
      if (t.set_in_woc_meeting_id == null) continue;
      const entry = taskRollup.get(t.set_in_woc_meeting_id) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (t.status === "complete") entry.done += 1;
      taskRollup.set(t.set_in_woc_meeting_id, entry);
    }
    const wocRows = (wocMeetings ?? []).map((m) => {
      const woc = m.campaign_wocs as unknown as { name: string } | null;
      const chair = m.workers as unknown as {
        first_name: string;
        last_name: string;
      } | null;
      const attendees =
        (m.attendees_snapshot as Array<{ worker_id: number }> | null) ?? [];
      const rep =
        (m.crews_represented_snapshot as Array<{ name: string }> | null) ?? [];
      const missing =
        (m.crews_missing_snapshot as Array<{ name: string }> | null) ?? [];
      const rollup = taskRollup.get(m.meeting_id);
      return {
        Date: m.meeting_date,
        WOC: woc?.name ?? "",
        Format: m.format ?? "",
        Chair: chair ? `${chair.first_name} ${chair.last_name}` : "",
        Attendees: attendees.length || "",
        "Crews represented": rep.map((r) => r.name).join(", "),
        "Crews missing (gap check)": missing.map((r) => r.name).join(", "),
        "What's new": m.whats_new ?? "",
        "Tasks from last meeting": rollup ? `${rollup.done} / ${rollup.total}` : "",
        Recognition: m.recognition_notes ?? "",
        "New tasks set": m.new_tasks_summary ?? "",
        "Next meeting": m.next_meeting_date ?? "",
        Notes: m.notes ?? "",
      };
    });

    // ── Sheet 5 · Coverage Map ───────────────────────────────────
    const coverageUnits = allUnits.filter(
      (u) =>
        !u.is_group_container && (unitIds == null || (u.ou_id != null && unitIds.has(u.ou_id)))
    );
    const coverageRows: Record<string, unknown>[] = coverageUnits.map((u) => ({
      "Crew / unit": u.ou_name ?? "",
      Group:
        u.parent_ou_id != null ? (unitNameById.get(u.parent_ou_id) ?? "") : "",
      Workers: u.assigned_workers ?? 0,
      Members: u.member_count ?? 0,
      "Density %": u.density != null ? `${Math.round(Number(u.density) * 100)}%` : "",
      "Named leader": u.leader_name ?? "",
      "Assessment of leader": u.leader_worker_id
        ? ratingLabel(u.leader_rating)
        : "",
      "Second-in-line": u.second_name ?? "",
      "Reachable in 48hrs?": u.reachable_48h == null ? "" : u.reachable_48h ? "Y" : "N",
      "Coverage status":
        u.coverage_status === "gap"
          ? "GAP"
          : u.coverage_status === "leader_no_second"
            ? "LEADER — no second"
            : "COVERED",
      "Priority action": u.priority_action ?? "",
    }));
    // Tracker-style summary block.
    const workers = coverageUnits.reduce((s, u) => s + (u.assigned_workers ?? 0), 0);
    const members = coverageUnits.reduce((s, u) => s + (u.member_count ?? 0), 0);
    coverageRows.push(
      {},
      { "Crew / unit": "Crews mapped", Workers: coverageUnits.length },
      {
        "Crew / unit": "Crews covered",
        Workers: coverageUnits.filter((u) => u.coverage_status === "covered").length,
      },
      {
        "Crew / unit": "Leader, no second",
        Workers: coverageUnits.filter(
          (u) => u.coverage_status === "leader_no_second"
        ).length,
      },
      {
        "Crew / unit": "Gaps (no leader)",
        Workers: coverageUnits.filter((u) => u.coverage_status === "gap").length,
      },
      { "Crew / unit": "Workers mapped", Workers: workers },
      { "Crew / unit": "Members", Workers: members },
      {
        "Crew / unit": "Overall density",
        Workers: workers > 0 ? `${Math.round((members / workers) * 100)}%` : "",
      }
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(registerRows),
      "Activist Register"
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), "Tasking Log");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(testRows),
      "Structure Tests"
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wocRows), "WOC Log");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(coverageRows),
      "Coverage Map"
    );

    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array<ArrayBuffer>;
    const blob = new Blob([arr], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const ts = new Date().toISOString().slice(0, 10);
    const scopeName =
      groupOuId != null
        ? (unitNameById.get(groupOuId) ?? `group-${groupOuId}`)
        : (campaign?.name ?? `campaign-${campaignId}`);
    const safeScope = scopeName.replace(/[^\w\-]+/g, "-").slice(0, 60);
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="activist-woc-tracker-${safeScope}-${ts}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("activist tracker export failed", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
