"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type MatchStatus =
  | "auto"
  | "needs_review"
  | "confirmed"
  | "overridden"
  | "rejected"
  | "unmatched";

export interface MatchProposal {
  employer_id: number;
  name: string;
  score: number;
  is_principal: boolean;
}

export interface UpcomingProjectMatch {
  id: number;
  upcoming_project_id: number;
  employer_id: number | null;
  role_type: string;
  is_primary: boolean;
  match_status: MatchStatus;
  match_score: number | null;
  match_method: string | null;
  candidate_proposals: MatchProposal[];
  confirmed_by: string | null;
  confirmed_at: string | null;
  notes: string | null;
  matched_employer: {
    employer_id: number;
    employer_name: string;
    employer_category: string | null;
  } | null;
}

export interface UpcomingProjectRow {
  id: number;
  source: string;
  external_id: string;
  title: string | null;
  activity_type: string | null;
  lifecycle_classification: string | null;
  project_name: string | null;
  associated_project: string | null;
  organisation: string | null;
  region_code: string | null;
  jurisdiction: "WA" | "NT" | null;
  location_text: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  source_url: string;
  is_active: boolean;
  first_seen_at: string;
  last_seen_at: string;
  last_changed_at: string;
  match: UpcomingProjectMatch | null;
  [key: string]: unknown;
}

interface ProjectEmployerJoinRow {
  id: number;
  upcoming_project_id: number;
  employer_id: number | null;
  role_type: string;
  is_primary: boolean;
  match_status: MatchStatus;
  match_score: number | null;
  match_method: string | null;
  candidate_proposals: MatchProposal[];
  confirmed_by: string | null;
  confirmed_at: string | null;
  notes: string | null;
  employers:
    | {
        employer_id: number;
        employer_name: string;
        employer_category: string | null;
      }
    | null;
}

interface ProjectRowFromDb extends Omit<UpcomingProjectRow, "match"> {
  upcoming_project_employers: ProjectEmployerJoinRow[];
}

export function useUpcomingProjects() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["upcoming-projects"],
    queryFn: async (): Promise<UpcomingProjectRow[]> => {
      const { data, error } = await supabase
        .from("upcoming_projects")
        .select(
          `id, source, external_id, title, activity_type, lifecycle_classification,
           project_name, associated_project, organisation, region_code, jurisdiction,
           location_text, start_date, end_date, status, source_url, is_active,
           first_seen_at, last_seen_at, last_changed_at,
           upcoming_project_employers!left (
             id, upcoming_project_id, employer_id, role_type, is_primary,
             match_status, match_score, match_method, candidate_proposals,
             confirmed_by, confirmed_at, notes,
             employers:employer_id ( employer_id, employer_name, employer_category )
           )`
        )
        .eq("is_active", true)
        .order("start_date", { ascending: true, nullsFirst: false });

      if (error) throw error;

      const rows = (data ?? []) as unknown as ProjectRowFromDb[];

      return rows.map((row) => {
        const primary =
          row.upcoming_project_employers.find((j) => j.is_primary) ??
          row.upcoming_project_employers[0] ??
          null;
        const match: UpcomingProjectMatch | null = primary
          ? {
              id: primary.id,
              upcoming_project_id: primary.upcoming_project_id,
              employer_id: primary.employer_id,
              role_type: primary.role_type,
              is_primary: primary.is_primary,
              match_status: primary.match_status,
              match_score: primary.match_score,
              match_method: primary.match_method,
              candidate_proposals: primary.candidate_proposals ?? [],
              confirmed_by: primary.confirmed_by,
              confirmed_at: primary.confirmed_at,
              notes: primary.notes,
              matched_employer: primary.employers,
            }
          : null;

        const { upcoming_project_employers: _omit, ...rest } = row;
        void _omit;
        return { ...rest, match } as UpcomingProjectRow;
      });
    },
    staleTime: 60_000,
  });
}
