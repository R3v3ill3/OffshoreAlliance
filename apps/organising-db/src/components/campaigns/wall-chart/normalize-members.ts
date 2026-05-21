import type { WallChartMemberRow, WallChartWorker } from "./types";

/**
 * Raw shape coming back from Supabase for the `campaign-members-full` query.
 * Joined rows are returned as either object or one-element array depending on
 * the Supabase client version / nested-select shape, so every join is treated
 * as "unknown" and the consumer-side normalizer flattens it.
 */
export type RawCampaignMemberRow = {
  membership_id: number;
  worker_id: number;
  worker: unknown;
};

type RawJoinObject = Record<string, unknown> | null | undefined;

function pickOne<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

type RawWorkerLoose = {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  member_role_type_id: number | null;
  is_bargaining_rep: boolean | null;
  is_hsr: boolean | null;
  union_membership_type_id: number | null;
  non_oa_union_option_id: number | null;
  canonical_occupation_id: number | null;
  employer_id: number | null;
  worksite_id: number | null;
  member_role_type: unknown;
  union_membership_type: unknown;
  non_oa_union_option: unknown;
  canonical_occupation: unknown;
  employer: unknown;
  worksite: unknown;
};

export function normalizeCampaignMemberRows(
  rows: RawCampaignMemberRow[]
): WallChartMemberRow[] {
  return rows.map((row) => {
    const w = pickOne<RawWorkerLoose>(row.worker);
    if (!w) {
      return { membership_id: row.membership_id, worker_id: row.worker_id, worker: null };
    }
    const mt = pickOne<{
      role_name: string;
      role_type_id: number;
      display_name: string;
    }>(w.member_role_type);
    const um = pickOne<{ type_name: string; display_name?: string | null }>(
      w.union_membership_type
    );
    const nauoRaw = pickOne<RawJoinObject>(w.non_oa_union_option);
    const nauo =
      nauoRaw &&
      typeof nauoRaw === "object" &&
      "badge_initials" in nauoRaw &&
      typeof (nauoRaw as { badge_initials: unknown }).badge_initials === "string"
        ? (nauoRaw as {
            non_oa_union_option_id: number;
            badge_initials: string;
            display_name: string;
          })
        : null;
    const occ = pickOne<{ occupation_id: number; canonical_name: string }>(
      w.canonical_occupation
    );
    const emp = pickOne<{ employer_id: number; employer_name: string }>(w.employer);
    const ws = pickOne<{ worksite_id: number; worksite_name: string }>(w.worksite);
    const worker: WallChartWorker = {
      worker_id: w.worker_id,
      first_name: w.first_name,
      last_name: w.last_name,
      email: w.email,
      phone: w.phone,
      notes: w.notes,
      member_role_type_id: w.member_role_type_id,
      is_bargaining_rep: w.is_bargaining_rep,
      is_hsr: w.is_hsr,
      union_membership_type_id: w.union_membership_type_id,
      non_oa_union_option_id: w.non_oa_union_option_id ?? null,
      canonical_occupation_id: w.canonical_occupation_id,
      employer_id: w.employer_id,
      worksite_id: w.worksite_id,
      member_role_type: mt,
      union_membership_type: um,
      non_oa_union_option: nauo,
      canonical_occupation: occ,
      employer: emp,
      worksite: ws,
    };
    return { membership_id: row.membership_id, worker_id: row.worker_id, worker };
  });
}

/** The Supabase `select(...)` projection string used by both wall chart and list view. */
export const CAMPAIGN_MEMBERS_FULL_SELECT = `membership_id, worker_id,
  worker:workers(
    worker_id, first_name, last_name, email, phone, notes,
    member_role_type_id, is_bargaining_rep, is_hsr,
    union_membership_type_id,
    non_oa_union_option_id,
    canonical_occupation_id,
    employer_id, worksite_id,
    member_role_type:member_role_types(role_name, role_type_id, display_name),
    union_membership_type:union_membership_types(type_name, display_name),
    non_oa_union_option:non_oa_union_options!workers_non_oa_union_option_id_fkey(
      non_oa_union_option_id, badge_initials, display_name
    ),
    canonical_occupation:occupations!workers_canonical_occupation_id_fkey(occupation_id, canonical_name),
    employer:employers!workers_employer_id_fkey(employer_id, employer_name),
    worksite:worksites!workers_worksite_id_fkey(worksite_id, worksite_name)
  )` as const;
