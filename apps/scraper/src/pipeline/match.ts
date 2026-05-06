import type { SupabaseClient } from "@supabase/supabase-js";
import {
  proposeEmployerMatch,
  type EmployerCandidate,
} from "@oa/employer-matching";
import type { NormalisedUpcomingProject } from "../sources/types";

const STICKY_STATUSES = new Set(["confirmed", "overridden", "rejected"]);

export interface MatchSummary {
  auto: number;
  needsReview: number;
  unmatched: number;
}

export async function loadActiveEmployers(
  supa: SupabaseClient
): Promise<EmployerCandidate[]> {
  const { data, error } = await supa
    .from("employers")
    .select("employer_id, employer_name, trading_name, employer_category")
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as EmployerCandidate[];
}

export async function matchAndPersist(
  supa: SupabaseClient,
  upcomingProjectId: number,
  record: NormalisedUpcomingProject,
  employers: EmployerCandidate[],
  summary: MatchSummary
): Promise<void> {
  // Honour sticky admin decisions: skip if a primary row already
  // exists with a confirmed/overridden/rejected status.
  const { data: existing, error: existingErr } = await supa
    .from("upcoming_project_employers")
    .select("id, match_status")
    .eq("upcoming_project_id", upcomingProjectId)
    .eq("is_primary", true)
    .maybeSingle();
  if (existingErr) throw existingErr;

  if (existing && STICKY_STATUSES.has((existing as { match_status: string }).match_status)) {
    return;
  }

  const outcome = proposeEmployerMatch(record.organisation ?? "", employers);

  if (outcome.status === "auto") summary.auto += 1;
  else if (outcome.status === "needs_review") summary.needsReview += 1;
  else summary.unmatched += 1;

  const row = {
    upcoming_project_id: upcomingProjectId,
    employer_id: outcome.employerId,
    role_type: "Operator" as const,
    is_primary: true,
    match_status: outcome.status,
    match_score: outcome.score,
    match_method: outcome.status === "auto" ? "fuzzy" : null,
    candidate_proposals: outcome.proposals,
  };

  if (existing) {
    const { error: updErr } = await supa
      .from("upcoming_project_employers")
      .update(row)
      .eq("id", (existing as { id: number }).id);
    if (updErr) throw updErr;
  } else {
    const { error: insErr } = await supa
      .from("upcoming_project_employers")
      .insert(row);
    if (insErr) throw insErr;
  }
}
