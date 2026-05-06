/**
 * Section Planning module — TypeScript types.
 *
 * Phase 1 covers the container only (section_plans table). Subsequent phases
 * will extend this file with situation snippets, sequences, mappings, etc.
 *
 * These types are hand-authored and mirror the DB schema added in
 * supabase/migrations/20260606100000_section_plans.sql. Once @oa/db-types is
 * regenerated against the new schema, the row types here can be re-anchored
 * to Database['public']['Tables']['section_plans']['Row'] etc.
 */

export type SectionPlanTimeframeKind =
  | 'user_set'
  | 'user_set_firm'
  | 'hard_external_deadline'

export const SECTION_PLAN_TIMEFRAME_KINDS: ReadonlyArray<SectionPlanTimeframeKind> = [
  'user_set',
  'user_set_firm',
  'hard_external_deadline',
] as const

export const SECTION_PLAN_TIMEFRAME_KIND_LABELS: Record<SectionPlanTimeframeKind, string> = {
  user_set: 'Flexible — internal',
  user_set_firm: 'Internal measure, external date',
  hard_external_deadline: 'Hard external deadline',
}

export const SECTION_PLAN_TIMEFRAME_KIND_DESCRIPTIONS: Record<SectionPlanTimeframeKind, string> = {
  user_set:
    'You set both the timing and the measure. No external pressure on the date.',
  user_set_firm:
    'You set the measure (e.g. "60% workers assessed") but the date is set externally (e.g. "before the 21 May bargaining meeting").',
  hard_external_deadline:
    'Externally controlled and externally measured (e.g. an EBA ballot, a NERR window). You cannot move the date.',
}

export type SectionPlanStatus = 'draft' | 'active' | 'completed' | 'archived'

export const SECTION_PLAN_STATUSES: ReadonlyArray<SectionPlanStatus> = [
  'draft',
  'active',
  'completed',
  'archived',
] as const

export const SECTION_PLAN_STATUS_LABELS: Record<SectionPlanStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
}

/**
 * Row shape returned from `section_plans`. Matches the migration columns
 * one-to-one. `created_by` is a Supabase auth UID.
 */
export interface SectionPlanRow {
  section_plan_id: number
  campaign_id: number
  name: string
  purpose: string | null
  start_date: string // ISO date (YYYY-MM-DD)
  end_date: string
  timeframe_kind: SectionPlanTimeframeKind
  external_anchor_label: string | null
  status: SectionPlanStatus
  archived_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Minimal payload required to create a section plan via the
 * `useCreateSectionPlan` hook. The DB defaults `status` to 'active' and
 * `timeframe_kind` to 'user_set'.
 */
export interface CreateSectionPlanInput {
  campaign_id: number
  name: string
  start_date: string
  end_date: string
  purpose?: string | null
  timeframe_kind?: SectionPlanTimeframeKind
  external_anchor_label?: string | null
  status?: Exclude<SectionPlanStatus, 'archived'>
}

export interface UpdateSectionPlanInput {
  section_plan_id: number
  name?: string
  purpose?: string | null
  start_date?: string
  end_date?: string
  timeframe_kind?: SectionPlanTimeframeKind
  external_anchor_label?: string | null
  status?: SectionPlanStatus
}
