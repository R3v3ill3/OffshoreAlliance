import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sets plan_ambitions.target_date to the parent stage's planned_end_date
 * for rows that the user has not manually overridden.
 */
export async function syncAmbitionTargetDatesForCampaign(
  supabase: SupabaseClient,
  campaignId: number
): Promise<void> {
  const { data: plans, error } = await supabase
    .from('campaign_stage_plans')
    .select('plan_id, planned_end_date')
    .eq('campaign_id', campaignId)

  if (error) throw error

  for (const p of plans || []) {
    if (!p.planned_end_date) continue

    const { error: uErr } = await supabase
      .from('plan_ambitions')
      .update({ target_date: p.planned_end_date })
      .eq('plan_id', p.plan_id)
      .eq('target_date_user_overridden', false)

    if (uErr) throw uErr
  }
}
