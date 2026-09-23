"use client";

import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { NameReviewEntity } from "@/lib/hooks/useNameMatchReviews";

/**
 * DA0.3 Name Reviews — search existing employers or worksites **and their
 * aliases** before anything can be created (plan §2.5, D5). A hit through an
 * alias maps to the alias's canonical row. Strings P2–P5 of plan §2.6.4.
 *
 * Inactive rows are returned on purpose: the resolver treats them as exact /
 * alias targets (reuse an inactive record rather than duplicate it), so the
 * reviewer may map to one too; the list marks them.
 */

export const NAME_ENTITY_SEARCH_MIN = 2;
const LIMIT = 20;

export interface NameEntitySearchHit {
  /** The canonical row's id — what a "Map to this" decision sends. */
  id: number;
  /** The canonical row's name. */
  name: string;
  /** How the typed text matched. */
  via: "name" | "trading_name" | "alias";
  /** The alias or trading name that matched, when `via` is not `name`. */
  matchedText: string | null;
  /** Worksite type, for worksites. */
  detail: string | null;
  isActive: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/**
 * The typed text as a PostgREST `ilike` pattern (`*` is PostgREST's
 * wildcard). Characters the `or=(…)` grammar reserves — `,` `(` `)` `"` `\`
 * — become `_` (a one-character wildcard), so "Acme (WA), Pty" still finds
 * "Acme (WA), Pty" without a quoting layer. `%` / `_` / `*` typed by the
 * reviewer stay wildcards, which only widens the search.
 */
export function ilikePattern(q: string): string {
  return `*${q.trim().replace(/[,()"\\]/g, "_")}*`;
}

/** P2 — employers by name or trading name. */
export function employerSearchQuery(supabase: AnyClient, q: string) {
  const p = ilikePattern(q);
  return supabase
    .from("employers")
    .select("employer_id,employer_name,trading_name,is_active")
    .or(`employer_name.ilike.${p},trading_name.ilike.${p}`)
    .order("employer_name", { ascending: true })
    .limit(LIMIT);
}

/** P3 — employer aliases, with the canonical employer embedded. */
export function employerAliasSearchQuery(supabase: AnyClient, q: string) {
  return supabase
    .from("employer_name_aliases")
    .select("id,alias_name,employer_id,employers(employer_id,employer_name,is_active)")
    .ilike("alias_name", ilikePattern(q))
    .limit(LIMIT);
}

/** P4 — worksites by name. */
export function worksiteSearchQuery(supabase: AnyClient, q: string) {
  return supabase
    .from("worksites")
    .select("worksite_id,worksite_name,worksite_type,is_active")
    .ilike("worksite_name", ilikePattern(q))
    .order("worksite_name", { ascending: true })
    .limit(LIMIT);
}

/** P5 — worksite aliases, with the canonical worksite embedded. */
export function worksiteAliasSearchQuery(supabase: AnyClient, q: string) {
  return supabase
    .from("worksite_name_aliases")
    .select("id,alias_name,worksite_id,worksites(worksite_id,worksite_name,is_active)")
    .ilike("alias_name", ilikePattern(q))
    .limit(LIMIT);
}

interface EmployerRow {
  employer_id: number;
  employer_name: string;
  trading_name: string | null;
  is_active: boolean | null;
}
interface WorksiteRow {
  worksite_id: number;
  worksite_name: string;
  worksite_type: string | null;
  is_active: boolean | null;
}
interface EmployerAliasRow {
  id: number;
  alias_name: string;
  employer_id: number;
  employers: { employer_id: number; employer_name: string; is_active: boolean | null } | null;
}
interface WorksiteAliasRow {
  id: number;
  alias_name: string;
  worksite_id: number;
  worksites: { worksite_id: number; worksite_name: string; is_active: boolean | null } | null;
}

/**
 * Direct hits first (in the server's name order), then alias hits whose
 * canonical row was not already a direct hit. One entry per canonical id.
 */
export function mergeSearchHits(
  entity: NameReviewEntity,
  q: string,
  direct: EmployerRow[] | WorksiteRow[],
  aliases: EmployerAliasRow[] | WorksiteAliasRow[]
): NameEntitySearchHit[] {
  const needle = q.trim().toLowerCase();
  const out: NameEntitySearchHit[] = [];
  const seen = new Set<number>();
  if (entity === "employer") {
    for (const e of direct as EmployerRow[]) {
      if (seen.has(e.employer_id)) continue;
      seen.add(e.employer_id);
      const byName = e.employer_name.toLowerCase().includes(needle);
      out.push({
        id: e.employer_id,
        name: e.employer_name,
        via: byName || !e.trading_name ? "name" : "trading_name",
        matchedText: byName || !e.trading_name ? null : e.trading_name,
        detail: null,
        isActive: e.is_active !== false,
      });
    }
    for (const a of aliases as EmployerAliasRow[]) {
      if (seen.has(a.employer_id)) continue;
      seen.add(a.employer_id);
      out.push({
        id: a.employer_id,
        name: a.employers?.employer_name ?? `Employer #${a.employer_id}`,
        via: "alias",
        matchedText: a.alias_name,
        detail: null,
        isActive: a.employers?.is_active !== false,
      });
    }
  } else {
    for (const w of direct as WorksiteRow[]) {
      if (seen.has(w.worksite_id)) continue;
      seen.add(w.worksite_id);
      out.push({
        id: w.worksite_id,
        name: w.worksite_name,
        via: "name",
        matchedText: null,
        detail: w.worksite_type,
        isActive: w.is_active !== false,
      });
    }
    for (const a of aliases as WorksiteAliasRow[]) {
      if (seen.has(a.worksite_id)) continue;
      seen.add(a.worksite_id);
      out.push({
        id: a.worksite_id,
        name: a.worksites?.worksite_name ?? `Worksite #${a.worksite_id}`,
        via: "alias",
        matchedText: a.alias_name,
        detail: null,
        isActive: a.worksites?.is_active !== false,
      });
    }
  }
  return out;
}

/**
 * Caller debounces `query`. Disabled below two characters; the page treats
 * a *settled* empty result for the typed text as the signal that "Create
 * new" may be offered.
 */
export function useNameEntitySearch(entity: NameReviewEntity, query: string) {
  const supabase = createClient();
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["name-entity-search", entity, trimmed],
    enabled: trimmed.length >= NAME_ENTITY_SEARCH_MIN,
    queryFn: async (): Promise<NameEntitySearchHit[]> => {
      if (entity === "employer") {
        const [direct, aliases] = await Promise.all([
          employerSearchQuery(supabase, trimmed),
          employerAliasSearchQuery(supabase, trimmed),
        ]);
        if (direct.error) throw direct.error;
        if (aliases.error) throw aliases.error;
        return mergeSearchHits(
          entity,
          trimmed,
          (direct.data ?? []) as unknown as EmployerRow[],
          (aliases.data ?? []) as unknown as EmployerAliasRow[]
        );
      }
      const [direct, aliases] = await Promise.all([
        worksiteSearchQuery(supabase, trimmed),
        worksiteAliasSearchQuery(supabase, trimmed),
      ]);
      if (direct.error) throw direct.error;
      if (aliases.error) throw aliases.error;
      return mergeSearchHits(
        entity,
        trimmed,
        (direct.data ?? []) as unknown as WorksiteRow[],
        (aliases.data ?? []) as unknown as WorksiteAliasRow[]
      );
    },
    staleTime: 30_000,
  });
}
