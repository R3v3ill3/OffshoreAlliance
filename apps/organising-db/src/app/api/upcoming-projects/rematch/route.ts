import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  proposeEmployerMatch,
  type EmployerCandidate,
} from "@oa/employer-matching";

const STICKY = new Set(["confirmed", "overridden", "rejected"]);

interface ExistingLink {
  id: number;
  is_primary: boolean;
  match_status: string;
}

interface ProjectRow {
  id: number;
  organisation: string | null;
  upcoming_project_employers: ExistingLink[];
}

// Re-runs proposeEmployerMatch for every active upcoming_projects row,
// updating the primary upcoming_project_employers link in place. Rows
// whose primary link is already confirmed / overridden / rejected are
// left alone — admin decisions are sticky regardless of how the matcher
// changes underneath.
//
// Admin-only. Uses the service role under the hood (we've already
// verified the caller is an admin), so we bypass the RLS guard that
// would otherwise force everything through confirm_upcoming_project_match.
export async function POST() {
  const userClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await userClient
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (profileError || profile?.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden - admin only" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  const { data: employersRaw, error: empErr } = await admin
    .from("employers")
    .select("employer_id, employer_name, trading_name, employer_category")
    .eq("is_active", true);
  if (empErr) {
    return NextResponse.json({ error: empErr.message }, { status: 500 });
  }
  const employers = (employersRaw ?? []) as EmployerCandidate[];

  const { data: projectsRaw, error: projErr } = await admin
    .from("upcoming_projects")
    .select(
      "id, organisation, upcoming_project_employers!left(id, is_primary, match_status)"
    )
    .eq("is_active", true);
  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const projects = (projectsRaw ?? []) as unknown as ProjectRow[];

  let auto = 0;
  let needs_review = 0;
  let unmatched = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const project of projects) {
    const primary =
      project.upcoming_project_employers.find((l) => l.is_primary) ??
      project.upcoming_project_employers[0] ??
      null;

    if (primary && STICKY.has(primary.match_status)) {
      skipped += 1;
      continue;
    }

    const outcome = proposeEmployerMatch(project.organisation ?? "", employers);
    if (outcome.status === "auto") auto += 1;
    else if (outcome.status === "needs_review") needs_review += 1;
    else unmatched += 1;

    const payload = {
      upcoming_project_id: project.id,
      employer_id: outcome.employerId,
      role_type: "Operator" as const,
      is_primary: true,
      match_status: outcome.status,
      match_score: outcome.score,
      match_method: outcome.status === "auto" ? "fuzzy" : null,
      candidate_proposals: outcome.proposals,
    };

    if (primary) {
      const { error } = await admin
        .from("upcoming_project_employers")
        .update(payload)
        .eq("id", primary.id);
      if (error) errors.push(`row ${project.id}: ${error.message}`);
    } else {
      const { error } = await admin
        .from("upcoming_project_employers")
        .insert(payload);
      if (error) errors.push(`row ${project.id}: ${error.message}`);
    }
  }

  return NextResponse.json({
    auto,
    needs_review,
    unmatched,
    skipped,
    total: projects.length,
    errors: errors.slice(0, 5),
  });
}
