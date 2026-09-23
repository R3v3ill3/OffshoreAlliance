"use client";

import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * DA0.3 Name Reviews page — the queue of employer / worksite strings an
 * import could not resolve (docs/data-architecture/wp/da0.3.md §2.5, §2.6.4).
 *
 * Read-only for every signed-in user (`name_match_reviews_select_authed`);
 * decisions go through `useDecideNameMatch` → the decide route, never here.
 *
 * The query builders are exported so the hooks contract suite
 * (`__contract__/name-match-reviews.contract.test.ts`) runs the exact
 * PostgREST strings the page emits against dev.
 */

export const NAME_MATCH_REVIEWS_KEY = ["name-match-reviews"] as const;

export type NameReviewEntity = "employer" | "worksite";

export type NameReviewStatus =
  | "auto"
  | "needs_review"
  | "unmatched"
  | "confirmed"
  | "overridden"
  | "rejected";

/** The page's status filter; `open` is the queue proper (plan §2.3.3). */
export type NameReviewStatusFilter = "open" | "auto" | "decided" | "all";

export const OPEN_STATUSES: readonly NameReviewStatus[] = ["needs_review", "unmatched"];
export const DECIDED_STATUSES: readonly NameReviewStatus[] = ["confirmed", "overridden", "rejected"];

export interface NameReviewProposal {
  id: number;
  name: string;
  score: number;
  is_principal: boolean;
}

export interface NameReviewSourceContext {
  other_raw_name?: string | null;
  import_type?: string | null;
  weekly_batch_id?: number | null;
  source_kinds?: string[] | null;
}

export interface NameReviewRow {
  id: number;
  entity: NameReviewEntity;
  raw_name: string;
  normalised_name: string;
  status: NameReviewStatus;
  match_score: number | null;
  match_method: string | null;
  candidate_proposals: NameReviewProposal[];
  resolved_employer_id: number | null;
  resolved_worksite_id: number | null;
  occurrences: number;
  source_context: NameReviewSourceContext;
  notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  import_logs: {
    import_id: number;
    file_name: string;
    import_type: string;
    imported_at: string;
  } | null;
  employers: { employer_id: number; employer_name: string } | null;
  worksites: { worksite_id: number; worksite_name: string } | null;
}

export interface NameReviewFilters {
  entity: NameReviewEntity;
  status: NameReviewStatusFilter;
  /** `null` = every import. */
  importId: number | null;
}

export interface NameReviewImport {
  import_id: number;
  file_name: string;
  import_type: string;
  imported_at: string;
}

/** P1 — three unhinted embeds (each FK is the only path to its target). */
export const NAME_REVIEW_SELECT =
  "id,entity,raw_name,normalised_name,status,match_score,match_method,candidate_proposals," +
  "resolved_employer_id,resolved_worksite_id,occurrences,source_context,notes,decided_by,decided_at,created_at," +
  "import_logs(import_id,file_name,import_type,imported_at)," +
  "employers(employer_id,employer_name)," +
  "worksites(worksite_id,worksite_name)";

export function statusesFor(filter: NameReviewStatusFilter): readonly NameReviewStatus[] | null {
  switch (filter) {
    case "open":
      return OPEN_STATUSES;
    case "auto":
      return ["auto"];
    case "decided":
      return DECIDED_STATUSES;
    case "all":
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/**
 * P1: `name_match_reviews?select=<NAME_REVIEW_SELECT>&entity=eq.<e>
 * [&status=in.(…)][&import_id=eq.<id>]&order=created_at.desc`.
 */
export function nameMatchReviewsQuery(supabase: AnyClient, filters: NameReviewFilters) {
  let query = supabase
    .from("name_match_reviews")
    .select(NAME_REVIEW_SELECT)
    .eq("entity", filters.entity);
  const statuses = statusesFor(filters.status);
  if (statuses) query = query.in("status", [...statuses]);
  if (filters.importId != null) query = query.eq("import_id", filters.importId);
  return query.order("created_at", { ascending: false });
}

/** P6: `import_logs?select=import_id,file_name,import_type,imported_at&order=imported_at.desc&limit=100`. */
export function nameReviewImportsQuery(supabase: AnyClient) {
  return supabase
    .from("import_logs")
    .select("import_id,file_name,import_type,imported_at")
    .order("imported_at", { ascending: false })
    .limit(100);
}

/**
 * P9 (§8 D13): `user_profiles?select=user_id,display_name&user_id=in.(<uuids>)`
 * — the "decided by" column. `decided_by` references `auth.users`, which
 * PostgREST cannot embed, so the names are one extra read.
 */
export function nameReviewDecidersQuery(supabase: AnyClient, userIds: readonly string[]) {
  return supabase
    .from("user_profiles")
    .select("user_id,display_name")
    .in("user_id", [...userIds]);
}

function normaliseRow(raw: Record<string, unknown>): NameReviewRow {
  const proposals = Array.isArray(raw.candidate_proposals)
    ? (raw.candidate_proposals as NameReviewProposal[])
    : [];
  const ctx =
    raw.source_context && typeof raw.source_context === "object" && !Array.isArray(raw.source_context)
      ? (raw.source_context as NameReviewSourceContext)
      : {};
  return {
    ...(raw as unknown as NameReviewRow),
    match_score: raw.match_score == null ? null : Number(raw.match_score),
    candidate_proposals: proposals.map((p) => ({
      id: Number(p.id),
      name: String(p.name ?? ""),
      score: Number(p.score ?? 0),
      is_principal: p.is_principal === true,
    })),
    source_context: ctx,
  };
}

export function useNameMatchReviews(filters: NameReviewFilters) {
  const supabase = createClient();
  return useQuery({
    queryKey: [...NAME_MATCH_REVIEWS_KEY, "list", filters.entity, filters.status, filters.importId],
    queryFn: async (): Promise<NameReviewRow[]> => {
      const { data, error } = await nameMatchReviewsQuery(supabase, filters);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(normaliseRow);
    },
    staleTime: 15_000,
  });
}

export function useNameReviewImports() {
  const supabase = createClient();
  return useQuery({
    queryKey: [...NAME_MATCH_REVIEWS_KEY, "imports"],
    queryFn: async (): Promise<NameReviewImport[]> => {
      const { data, error } = await nameReviewImportsQuery(supabase);
      if (error) throw error;
      return (data ?? []) as NameReviewImport[];
    },
    staleTime: 60_000,
  });
}

/** user_id → display name for the decided rows on screen. */
export function useNameReviewDeciders(userIds: readonly string[]) {
  const supabase = createClient();
  const ids = [...new Set(userIds)].sort();
  return useQuery({
    queryKey: [...NAME_MATCH_REVIEWS_KEY, "deciders", ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await nameReviewDecidersQuery(supabase, ids);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const row of (data ?? []) as { user_id: string; display_name: string | null }[]) {
        if (row.display_name) out[row.user_id] = row.display_name;
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });
}
