// === Phase 6 additions (Wave 4 Agent H) ===
// PIA (Protected Industrial Action) domain types

import type { Json } from '@oa/db-types'

export interface PiaAction {
  action_id: number
  campaign_id: number
  pabo_id: number | null
  pabo_question_id: number | null
  action_type: string
  escalation_level: number
  notice_given_at: string | null
  action_starts_at: string | null
  action_ends_at: string | null
  target_population_definition: Json | null
  participation_target_count: number | null
  is_concluded: boolean
  concluded_at: string | null
  outcome_summary: Json | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PiaSeedPack {
  pack_key: string
  label: string
  description: string | null
  action_types: string[]
}

export interface PiaParticipationRow {
  action_id: number
  campaign_id: number
  action_type: string
  escalation_level: number
  action_starts_at: string | null
  is_concluded: boolean
  total_pledged: number
  total_participated: number
  participation_rate: number
  percent_membership: number
}

export interface WorkerEscalationTierRow {
  campaign_id: number
  worker_id: number
  current_tier: number
  last_action_at: string | null
  last_action_type: string | null
  next_recommended_ask: string
}

export interface CreatePiaActionInput {
  action_type: string
  escalation_level: number
  pabo_id?: number | null
  pabo_question_id?: number | null
  notice_given_at?: string | null
  action_starts_at?: string | null
  action_ends_at?: string | null
  target_population_definition?: Json | null
  participation_target_count?: number | null
  notes?: string | null
}

export interface ConcludePiaActionInput {
  action_id: number
  concluded_at?: string | null
  outcome_summary?: Json | null
  notes?: string | null
}

// Escalation tier labels for display
export const ESCALATION_TIER_LABELS: Record<number, string> = {
  0: 'Not yet asked',
  1: 'Pledge signed',
  2: 'PABO voted yes',
  3: 'Work ban / 4hr stoppage',
  4: '24–48hr / swing stoppage',
  5: 'Indefinite strike',
}

// Action type display labels
export const PIA_ACTION_TYPE_LABELS: Record<string, string> = {
  bargaining_pledge_signed: 'Bargaining Pledge Signed',
  pabo_pledge_vote_yes: 'PABO Pledge: Vote Yes',
  pabo_voted_yes: 'PABO Voted Yes',
  work_ban_helideck: 'Work Ban: Helideck',
  work_ban_lifting_gear: 'Work Ban: Lifting Gear',
  work_ban_permits: 'Work Ban: Permits',
  work_ban: 'Work Ban',
  overtime_ban: 'Overtime Ban',
  stoppage_swing_meeting: 'Stoppage: Swing Meeting',
  stoppage_4hr: 'Stoppage: 4-hour',
  stoppage_12hr: 'Stoppage: 12-hour',
  stoppage_24hr: 'Stoppage: 24-hour',
  stoppage_48hr: 'Stoppage: 48-hour',
  indefinite_strike: 'Indefinite Strike',
  picket_solidarity: 'Picket / Solidarity Action',
  eba_vote_yes: 'EBA Vote Yes',
}
// === End Phase 6 additions ===
