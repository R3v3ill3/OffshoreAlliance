/**
 * Phase 2 smoke fixture — verifies Bargaining to Win data flow.
 * Run with: npx tsx scripts/smoke-phase2.ts
 *
 * Prereqs: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars set.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

async function check(label: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn()
    console.log(`✓ ${label}`, result != null ? '' : '(null)')
  } catch (e) {
    console.error(`✗ ${label}`, e)
    process.exitCode = 1
  }
}

async function main() {
  await check('campaigns table accessible', () =>
    supabase.from('campaigns').select('campaign_id').limit(1).throwOnError()
  )
  await check('bargaining_strength_assessments table accessible', () =>
    supabase.from('bargaining_strength_assessments').select('assessment_id').limit(1).throwOnError()
  )
  await check('bargaining_decision_points table accessible', () =>
    supabase.from('bargaining_decision_points').select('decision_id').limit(1).throwOnError()
  )
  await check('pabo_applications table accessible', () =>
    supabase.from('pabo_applications').select('pabo_id').limit(1).throwOnError()
  )
  await check('member_endorsement_votes table accessible', () =>
    supabase.from('member_endorsement_votes').select('vote_id').limit(1).throwOnError()
  )
  await check('pia_actions table accessible', () =>
    supabase.from('pia_actions').select('action_id').limit(1).throwOnError()
  )
  await check('intractable_bargaining_tracker table accessible', () =>
    supabase.from('intractable_bargaining_tracker').select('tracker_id').limit(1).throwOnError()
  )
  await check('v_bargaining_progress view accessible', () =>
    supabase.from('v_bargaining_progress').select('*').limit(1).throwOnError()
  )
  await check('v_worker_escalation_tier view accessible', () =>
    supabase.from('v_worker_escalation_tier').select('*').limit(1).throwOnError()
  )
  await check('v_pia_participation_by_action view accessible', () =>
    supabase.from('v_pia_participation_by_action').select('*').limit(1).throwOnError()
  )
  await check('gate_definitions has Phase 2 gates (9, 10)', async () => {
    const { data } = await supabase
      .from('gate_definitions')
      .select('gate_number')
      .in('gate_number', [9, 10])
      .throwOnError()
    if (!data?.length) throw new Error('No Phase 2 gates found in gate_definitions')
    return data
  })
  await check('campaign_phase_enum usable (bargaining_to_win)', async () => {
    const { data } = await supabase
      .from('campaigns')
      .select('campaign_id, current_phase')
      .eq('current_phase', 'bargaining_to_win')
      .limit(5)
      .throwOnError()
    return `${data?.length ?? 0} campaigns in bargaining phase`
  })
}

main().catch(console.error)
