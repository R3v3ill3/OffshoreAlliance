/**
 * Narrowed TypeScript types for the phone_call_actions table.
 *
 * The Supabase-generated types (packages/db-types/generated.ts) now include
 * this table, but use `string` for enum columns (entry_branch, status,
 * variation_dimension). These interfaces narrow to the known union values so
 * call sites have proper type-checking. The generated types are used for
 * Supabase client calls; these interfaces are used for business logic.
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
