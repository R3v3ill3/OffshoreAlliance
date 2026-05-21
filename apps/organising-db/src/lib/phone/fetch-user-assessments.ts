/**
 * Fetch the list of campaign assessments the user can rate against during
 * a phone call.
 *
 * Why this isn't just a single `campaign_activities WHERE kind='assessment'`
 * query: `useCallOutcomes.ts` auto-creates a `campaign_activities` row
 * (kind='assessment', title="Phone Campaign — <script>") every time a
 * script's outcomes are saved, so it has an activity_id to attach to
 * `call_outcome_definitions`. Those shadow rows are an implementation
 * detail — they shouldn't appear in user-facing assessment pickers.
 *
 * The reliable filter is "the activity is not referenced by any
 * `call_outcome_definitions` row". Genuine user-created assessments
 * (via the CreateAssessmentDialog or the Workforce → Assessments tab)
 * never have a call_outcome_definitions row pointing at them.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface UserAssessmentRow {
  activity_id: number
  title: string
  is_binary?: boolean | null
}

export async function fetchUserAssessments(
  supabase: SupabaseClient,
  campaignId: number,
): Promise<UserAssessmentRow[]> {
  // 1. All campaign_activities of kind='assessment' for this campaign.
  const { data: activities, error: actErr } = await supabase
    .from('campaign_activities')
    .select('activity_id, title, is_binary, activity_kind')
    .eq('campaign_id', campaignId)
    .eq('activity_kind', 'assessment')
    .order('created_at', { ascending: false })
  if (actErr) throw actErr
  const rows = (activities ?? []) as Array<{
    activity_id: number
    title: string
    is_binary: boolean | null
    activity_kind: string
  }>

  if (rows.length === 0) return []

  // 2. All call_outcome_definitions.activity_id values for this campaign.
  //    Any activity id appearing here is a script-shadow and should be
  //    excluded.
  const { data: outcomeRefs, error: outErr } = await supabase
    .from('call_outcome_definitions')
    .select('activity_id')
    .eq('campaign_id', campaignId)
    .not('activity_id', 'is', null)
  if (outErr) throw outErr
  const shadowIds = new Set(
    (outcomeRefs ?? [])
      .map((r) => (r as { activity_id: number | null }).activity_id)
      .filter((id): id is number => id != null),
  )

  return rows
    .filter((r) => !shadowIds.has(r.activity_id))
    .map((r) => ({
      activity_id: r.activity_id,
      title: r.title,
      is_binary: r.is_binary,
    }))
}
