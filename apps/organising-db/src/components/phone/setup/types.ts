/**
 * Shared TypeScript types for the phone-call setup editors.
 *
 * These mirror the columns of the new tables added in migration
 * 20260522100000_phone_call_actions.sql without relying on generated
 * db-types (which will not yet include the new tables).
 */

// ─── call_script_cta_ambitions mirror ────────────────────────────────────────

export type CtaTargetResponse = 'accepted' | 'considering' | 'declined' | 'not_reached'
export type CtaSupportLevel =
  | 'strong_supporter'
  | 'supporter'
  | 'neutral'
  | 'unsupportive'
  | 'hostile'

export interface CallCtaAmbition {
  /** Populated once the row is persisted to call_script_cta_ambitions. */
  id?: number
  /** FK to call_outcome_definitions.outcome_id — null for custom/free-form ambitions. */
  outcome_definition_id?: number | null
  /** Denormalised label (required). */
  cta_label: string
  target_response?: CtaTargetResponse | null
  /** 1–5 inclusive, matching call_script_cta_ambitions.target_min_rating CHECK. */
  target_min_rating?: number | null
  target_binary?: boolean | null
  target_support_level?: CtaSupportLevel | null
  /** 0–100 percentage threshold. */
  min_call_threshold_pct?: number | null
  notes?: string | null
}

// ─── call_objections (editing model) ─────────────────────────────────────────

export interface SelectedObjection {
  /** FK to call_objections.objection_id — null for custom objections not yet saved. */
  objection_id?: number | null
  /** Label of the objection (required if objection_id is null). */
  custom_label?: string
  description?: string | null
}

// ─── call_issue_observations (setup model) ───────────────────────────────────

export type IssueHeatValue = 1 | 2 | 3 | 4 | 5

export interface ExpectedIssue {
  issue_label: string
  heat: IssueHeatValue
  /** Index into campaign_situation_analyses.top_issues JSONB, if sourced from there. */
  source_top_issue_index?: number | null
  notes?: string
}

// ─── seed_campaign_top_issues_from_call payload shape ────────────────────────

export interface TopIssueForSeeding {
  label: string
  heat: number
  notes?: string
}
