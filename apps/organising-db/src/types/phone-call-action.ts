/**
 * Local TypeScript interface mirroring the phone_call_actions table
 * from migration 20260522100000_phone_call_actions.sql.
 *
 * Generated db types will not include this table until `pnpm gen:types` runs.
 */

export type PhoneCallActionStatus = 'in_progress' | 'completed' | 'abandoned'
export type EntryBranch = 'list_first' | 'script_first'
export type VariationDimension =
  | 'membership_status'
  | 'organising_role'
  | 'occupation'
  | 'rating_band'
  | 'none'

export interface PhoneCallAction {
  action_id: number
  campaign_id: number
  created_by: string | null
  assessment_id: number | null
  variation_count: number
  variation_dimension: VariationDimension | null
  entry_branch: EntryBranch
  script_id: number | null
  list_ids: number[]
  status: PhoneCallActionStatus
  created_at: string
  updated_at: string
}

export interface PhoneCallActionInsert {
  campaign_id: number
  created_by: string | null
  assessment_id?: number | null
  variation_count: number
  variation_dimension: VariationDimension | null
  entry_branch: EntryBranch
  script_id?: number | null
  list_ids?: number[]
  status?: PhoneCallActionStatus
}
