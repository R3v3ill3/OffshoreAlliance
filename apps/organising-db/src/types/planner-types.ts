import type { Database } from '@/types/database'

// Re-export database row types for convenience
export type Tables = Database['public']['Tables']
export type Views = Database['public']['Views']

export type Agreement = Tables['agreements']['Row']
export type Employer = Tables['employers']['Row']
export type Worksite = Tables['worksites']['Row']
export type Organiser = Tables['organisers']['Row']
export type Campaign = Tables['campaigns']['Row']
export type UserProfile = Tables['user_profiles']['Row']
export type Sector = Tables['sectors']['Row']

// New planning tables
export type CampaignStagePlan = Tables['campaign_stage_plans']['Row']
export type PlanAmbition = Tables['plan_ambitions']['Row']
export type PlanWhereToPlay = Tables['plan_where_to_play']['Row']
export type PlanTheoryOfWinning = Tables['plan_theory_of_winning']['Row']
export type PlanCapacity = Tables['plan_capacities']['Row']
export type PlanManagementSystem = Tables['plan_management_systems']['Row']

// Assessment linkage
export type ActivityAmbition = Tables['activity_ambitions']['Row']
export type ActivityEvent = Tables['activity_events']['Row']
export type RatingLevelRow = Tables['rating_level']['Row']

// Assessment capture sources
export type SmsInteraction = Tables['sms_interactions']['Row']
export type EmailCtaResponse = Tables['email_cta_responses']['Row']
export type PetitionSignature = Tables['petition_signatures']['Row']
export type MeetingAttendance = Tables['meeting_attendance']['Row']

// Ambition rollup views
export type WorkerAmbitionRating = Views['worker_ambition_rating']['Row']
export type AmbitionProgress = Views['ambition_progress']['Row']
export type AmbitionActivityContribution = Views['ambition_activity_contribution']['Row']

export type MeetingAttendanceStatus =
  | 'attending'
  | 'not_attending'
  | 'attended'
  | 'did_not_attend'
  | 'abstain'
  | 'unknown'

// Options tables
export type AmbitionOption = Tables['ambition_options']['Row']
export type WtpCategory = Tables['wtp_categories']['Row']
export type WtpOption = Tables['wtp_options']['Row']
export type CapacityOption = Tables['capacity_options']['Row']
export type ManagementSystemOption = Tables['management_system_options']['Row']

// Gate tables
export type GateDefinition = Tables['gate_definitions']['Row']
export type GateCriterion = Tables['gate_criteria']['Row']
export type GateAssessment = Tables['gate_assessments']['Row']

// Timeline tables
export type CampaignTimeline = Tables['campaign_timelines']['Row']
export type StageTimelineTarget = Tables['stage_timeline_targets']['Row']
export type ReportingSnapshot = Tables['reporting_snapshots']['Row']

// Computed / composite types
export type StageNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
export type Phase1StageNumber = 1 | 2 | 3 | 4 | 5 | 6
export type Phase2StageNumber = 7 | 8 | 9 | 10 | 11
export type GateNumber = 1 | 2 | 3 | 4 | 5

export const STAGE_NAMES: Record<StageNumber, string> = {
  1: 'Contact ID & Mapping',
  2: 'Intro Comms & Education',
  3: 'Member Mobilisation',
  4: 'Develop Claims / MSD',
  5: 'Endorsement & Commence Bargaining',
  6: 'Bargaining to Win',
  7: 'Bargaining Commences',
  8: 'Testing the Employer',
  9: 'Strength Assessment & Decision',
  10: 'Protected Industrial Action',
  11: 'Settlement & Ratification',
}

/**
 * High-level bargaining campaign lifecycle phase. Mirrors
 * the campaign_phase_enum DB type added in
 * 20260510100000_campaign_phase_enum.sql.
 *
 * preparing_to_bargain = Stages 1–6  (Playing to Win / P2W)
 * bargaining_to_win    = Stages 7–11 (Bargaining to Win / B2W)
 * post_settlement      = After ratification (no active stage plans)
 */
export type Phase = 'preparing_to_bargain' | 'bargaining_to_win' | 'post_settlement'

export const PHASE_NAMES: Record<Phase, string> = {
  preparing_to_bargain: 'Preparing to Bargain',
  bargaining_to_win: 'Bargaining to Win',
  post_settlement: 'Post Settlement',
}

/**
 * Maps each stage number to its phase.
 * Invariant: stages 1–6 are preparing_to_bargain; 7–11 are bargaining_to_win.
 * Mirrors the DB-level invariant enforced by enforce_stage_phase_invariant().
 */
export const STAGE_PHASE_MAP: Record<StageNumber, Phase> = {
  1: 'preparing_to_bargain',
  2: 'preparing_to_bargain',
  3: 'preparing_to_bargain',
  4: 'preparing_to_bargain',
  5: 'preparing_to_bargain',
  6: 'preparing_to_bargain',
  7: 'bargaining_to_win',
  8: 'bargaining_to_win',
  9: 'bargaining_to_win',
  10: 'bargaining_to_win',
  11: 'bargaining_to_win',
}

export const GATE_NAMES: Record<GateNumber, string> = {
  1: 'Member Engagement Threshold',
  2: 'Engagement Ready Assessment',
  3: 'Log of Claims Survey Participation',
  4: 'Ready for Bargaining',
  5: 'Strike Ready',
}

export type CapacityStatus = 'needed' | 'available' | 'gap' | 'in_progress'
export type GateOutcome = 'passed' | 'failed' | 'override_approved' | 'deferred'
export type PlanStatus = 'draft' | 'active' | 'completed' | 'blocked'
export type GateEnforcementType = 'hard' | 'soft'
export type MetricType = 'percentage' | 'count' | 'boolean' | 'date' | 'range' | 'text'
export type VariableType = 'number' | 'percentage' | 'text' | 'date'
export type FrequencyType = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'as_needed'
export type SnapshotType = 'daily' | 'weekly' | 'gate_review' | 'manual'

/**
 * An ambition is either a campaign-setup item (not tracked per worker —
 * e.g. "100% of names/emails/phones", "identify 10–30 worker units") or a
 * worker-assessable item whose progress is aggregated from per-worker
 * ratings via activity_ambitions. Only worker_assessable ambitions may
 * be linked to campaign_activities.
 */
export type AmbitionScope = 'campaign_setup' | 'worker_assessable'

export const AMBITION_SCOPE_LABELS: Record<AmbitionScope, string> = {
  campaign_setup: 'Campaign setup (not per-worker)',
  worker_assessable: 'Worker-assessable (tracked per worker)',
}

/** Ratings captured before vs after a scheduled event (meeting, vote, etc.). */
export type RatingPhase = 'expected' | 'actual'

/**
 * Canonical 1..5 + unassessed (0) rating scale. Mirrors the seeded
 * rating_level table so the UI has a synchronous source of truth
 * without needing a query to render colours/labels.
 */
export type RatingLevelCode =
  | 'unassessed'
  | 'supportive_leader'
  | 'supporter'
  | 'neutral'
  | 'opposed'
  | 'oppositional_leader'

export type RatingLevelValue = 0 | 1 | 2 | 3 | 4 | 5

export interface RatingLevelDef {
  value: RatingLevelValue
  code: RatingLevelCode
  label: string
  shortLabel: string
  description: string
  isSupportive: boolean
  tailwindBg: string
  colourToken: 'zinc' | 'sky' | 'emerald' | 'amber' | 'red' | 'red-dark'
}

export const RATING_LEVELS: RatingLevelDef[] = [
  {
    value: 0,
    code: 'unassessed',
    label: 'Unassessed',
    shortLabel: 'Unassessed',
    description: 'No assessment recorded yet for this worker on this activity / ambition.',
    isSupportive: false,
    tailwindBg: 'bg-zinc-300/80 dark:bg-zinc-600/80',
    colourToken: 'zinc',
  },
  {
    value: 1,
    code: 'supportive_leader',
    label: 'Supportive leader',
    shortLabel: 'Leader',
    description: 'Actively encourages other workers to engage; takes on asks.',
    isSupportive: true,
    tailwindBg: 'bg-sky-600/35',
    colourToken: 'sky',
  },
  {
    value: 2,
    code: 'supporter',
    label: 'Supporter',
    shortLabel: 'Supporter',
    description: 'Supports the campaign / position but not actively organising others.',
    isSupportive: true,
    tailwindBg: 'bg-emerald-600/35',
    colourToken: 'emerald',
  },
  {
    value: 3,
    code: 'neutral',
    label: 'Neutral',
    shortLabel: 'Neutral',
    description: 'Undecided; not yet engaged with the campaign.',
    isSupportive: false,
    tailwindBg: 'bg-amber-600/35',
    colourToken: 'amber',
  },
  {
    value: 4,
    code: 'opposed',
    label: 'Opposed',
    shortLabel: 'Opposed',
    description: 'Individually opposes the campaign / position.',
    isSupportive: false,
    tailwindBg: 'bg-red-600/35',
    colourToken: 'red',
  },
  {
    value: 5,
    code: 'oppositional_leader',
    label: 'Oppositional leader',
    shortLabel: 'Opp. leader',
    description: 'Actively encourages other workers to oppose or disengage.',
    isSupportive: false,
    tailwindBg: 'bg-red-700/50',
    colourToken: 'red-dark',
  },
]

/** Map a numeric rating (1..5 or NULL → 0 unassessed) to its definition. */
export function ratingLevelFor(value: number | null | undefined): RatingLevelDef {
  if (value == null) return RATING_LEVELS[0]
  const rounded = Math.round(value) as RatingLevelValue
  return RATING_LEVELS.find((r) => r.value === rounded) ?? RATING_LEVELS[0]
}

// AI Theory of Winning types
export interface GapAnalysisItem {
  gap_type: 'missing_wtp' | 'unsupported_ambition' | 'model_gap' | 'capacity_gap'
  description: string
  severity: 'high' | 'medium' | 'low'
  recommendation: string
}

export interface RiskAssessmentItem {
  risk: string
  likelihood: 'high' | 'medium' | 'low'
  impact: 'high' | 'medium' | 'low'
  mitigation: string
}

export interface TheoryOfWinningRequest {
  campaign_id: number
  plan_id: number
  stage_number: number
  stage_name: string
  ambitions: {
    text: string
    target_value?: string
    target_unit?: string
    category: string
  }[]
  where_to_play: {
    category: string
    option_text: string
    is_exclusion: boolean
    priority: number
    rationale?: string
  }[]
  capacities: {
    category: string
    option_text: string
    status: string
  }[]
  campaign_context: {
    employer_name: string
    worksite_names: string[]
    agreement_name: string
    agreement_expiry?: string
    sector: string
    is_greenfield: boolean
    days_to_pabo?: number
    /** Bargaining campaign classification from campaigns.campaign_type */
    campaign_type?: string
    /** From campaigns.enterprise_agreement_subtype (e.g. agreement renewal) */
    enterprise_agreement_subtype?: string | null
  }
  previous_stage_theory?: string
  /**
   * Optional pre-rendered Situation Analysis context block (see
   * apps/organising-db/src/lib/situation-analysis/serialise.ts). When
   * present, gives the model organiser-confirmed strategic context
   * (employer state, top issues with heat, predicted playbook,
   * workforce populations) so theory-of-winning output is grounded in
   * the campaign's actual situation rather than generic patterns.
   */
  situation_analysis_context?: string
}

export interface TheoryOfWinningResponse {
  if_then_statement: string
  gap_analysis: GapAnalysisItem[]
  risk_assessment: RiskAssessmentItem[]
  member_agency_assessment: string
  employer_response_considerations: string
}

// Extended types with relations
export interface StagePlanWithData extends CampaignStagePlan {
  ambitions: PlanAmbition[]
  where_to_play: PlanWhereToPlay[]
  theory_of_winning: PlanTheoryOfWinning[]
  capacities: PlanCapacity[]
  management_systems: PlanManagementSystem[]
}

export interface CampaignWithTimeline extends Campaign {
  timeline?: CampaignTimeline & {
    stage_targets: StageTimelineTarget[]
  }
  agreement?: Agreement & {
    employer_name?: string
    sector_name?: string
  }
  stage_plans: CampaignStagePlan[]
  gates: GateDefinition[]
}

export interface GateWithCriteria extends GateDefinition {
  criteria: GateCriterion[]
  latest_assessment?: GateAssessment
}

// Default gate criteria templates
export const DEFAULT_GATE_CRITERIA = {
  1: [
    { criterion_name: 'Contact Rate', metric_type: 'percentage' as MetricType, target_value: '60', description: 'Percentage of identified contacts successfully reached', is_hard_gate: false },
    { criterion_name: 'Response Rate', metric_type: 'percentage' as MetricType, target_value: '40', description: 'Percentage of contacted workers who responded/engaged', is_hard_gate: false },
    { criterion_name: 'Mapping Completion', metric_type: 'percentage' as MetricType, target_value: '80', description: 'Percentage of worksite/crew mapping completed', is_hard_gate: false },
    { criterion_name: 'Contact Details Verified', metric_type: 'percentage' as MetricType, target_value: '50', description: 'Percentage of contacts with verified name, phone, email', is_hard_gate: false },
  ],
  2: [
    { criterion_name: 'Education Participation', metric_type: 'percentage' as MetricType, target_value: '50', description: 'Percentage of contacts who attended an education/info session', is_hard_gate: false },
    { criterion_name: 'Shared Responsibility Commitment', metric_type: 'percentage' as MetricType, target_value: '40', description: 'Percentage of engaged contacts who\'ve confirmed shared responsibility', is_hard_gate: false },
    { criterion_name: 'WOC Established', metric_type: 'boolean' as MetricType, target_value: 'true', description: 'At least one WOC established on a key worksite', is_hard_gate: false },
    { criterion_name: 'Engagement Quality Score', metric_type: 'percentage' as MetricType, target_value: '60', description: 'Percentage of contacts rated as actively engaged (not just contacted)', is_hard_gate: false },
  ],
  3: [
    { criterion_name: 'Log of Claims Survey Completion', metric_type: 'percentage' as MetricType, target_value: '60', description: 'Percentage of members who completed the Log of Claims survey', is_hard_gate: false },
    { criterion_name: 'Membership Density', metric_type: 'percentage' as MetricType, target_value: '50', description: 'Union membership as percentage of workers on agreement scope', is_hard_gate: false },
    { criterion_name: 'Active WOCs', metric_type: 'count' as MetricType, target_value: '2', description: 'Number of active WOCs across worksites', is_hard_gate: false },
    { criterion_name: 'Delegate Coverage', metric_type: 'percentage' as MetricType, target_value: '50', description: 'Percentage of mapped areas with an active member contact', is_hard_gate: false },
  ],
  4: [
    { criterion_name: 'Claims Endorsement', metric_type: 'percentage' as MetricType, target_value: '70', description: 'Percentage of members who endorsed the final Log of Claims', is_hard_gate: false },
    { criterion_name: 'Bargaining Reps Nominated', metric_type: 'boolean' as MetricType, target_value: 'true', description: 'Bargaining representatives formally nominated', is_hard_gate: false },
    { criterion_name: 'MSD Achieved (if required)', metric_type: 'percentage' as MetricType, target_value: '50', description: 'Majority Support Determination — 50%+ is NON-NEGOTIABLE if MSD is required', is_hard_gate: true },
    { criterion_name: 'Strike Readiness Indicator', metric_type: 'percentage' as MetricType, target_value: '60', description: 'Percentage of members indicating willingness to take protected action', is_hard_gate: false },
  ],
  5: [
    { criterion_name: 'Strike Readiness Assessment', metric_type: 'percentage' as MetricType, target_value: '70', description: 'Formal strike readiness assessment score', is_hard_gate: false },
    { criterion_name: 'Communication Network Tested', metric_type: 'boolean' as MetricType, target_value: 'true', description: '2-way communication network tested and functional', is_hard_gate: false },
    { criterion_name: 'WOC Coverage', metric_type: 'percentage' as MetricType, target_value: '80', description: 'Percentage of key worksites with active WOC', is_hard_gate: false },
    { criterion_name: 'PABO Preparation Complete', metric_type: 'boolean' as MetricType, target_value: 'true', description: 'PABO application materials prepared and ready to file', is_hard_gate: false },
  ],
} as const

// Communication Draft types
export type CommsPlatform = 'email' | 'sms' | 'phone_script'
export type DraftStatus = 'generating' | 'draft' | 'approved' | 'sent' | 'failed'
export type SendVia = 'action_network' | 'yabbr' | 'manual'

export interface CommsDraftRequest {
  campaign_id: number
  plan_id: number
  stage_number: number
  stage_name: string
  platform: CommsPlatform
  campaign_context: {
    employer_name: string
    worksite_names: string[]
    agreement_name: string
    agreement_expiry?: string
    sector: string
    campaign_type?: string
    organiser_name?: string
    organiser_phone?: string
    staff_name?: string
    staff_email?: string
    staff_phone?: string
    staff_role?: string
  }
  wtp_selections: {
    tone: string[]
    audience: string[]
    platforms: string[]
    engagement_intensity?: string
    contact_method_priority?: string[]
  }
  template_examples?: {
    title: string
    subject_line?: string
    body_text: string
  }[]
  custom_instructions?: string
  /**
   * Optional pre-rendered Situation Analysis context block (see
   * apps/organising-db/src/lib/situation-analysis/serialise.ts). When
   * present, comms drafts inherit organiser-confirmed predicted
   * employer playbook moves (→ inoculation lines), top issues with
   * heat (→ agitation hooks), and workforce populations (→ audience
   * pacing). This is the explicit SOC pay-off of the wizard step.
   */
  situation_analysis_context?: string
}

export interface CommsDraftResponse {
  platform: CommsPlatform
  subject?: string
  body_text: string
  body_html?: string
  variables_used: string[]
  tone_applied: string
  audience_targeted: string
  estimated_character_count: number
}

// ============================================================
// Phone Call Operations types
// ============================================================

export type ScriptStatus = 'draft' | 'active' | 'archived'
export type ScriptSectionType =
  | 'opening'
  | 'introduction'
  | 'discovery'
  | 'education'
  | 'ask'
  | 'objection_handling'
  | 'close'
  | 'custom'

export type CallListStatus = 'draft' | 'active' | 'completed' | 'paused'
export type CallListPriorityStrategy =
  | 'sequential'
  | 'priority_score'
  | 'random'
  | 'least_recently_contacted'

export type CallListItemStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'deferred'

export type DialDisposition =
  | 'connected'
  | 'no_answer'
  | 'voicemail_left'
  | 'voicemail_no_message'
  | 'busy'
  | 'disconnected'
  | 'wrong_number'
  | 'do_not_call'
  | 'callback_requested'

export type CallDisposition =
  | 'completed_positive'
  | 'completed_neutral'
  | 'completed_negative'
  | 'partial_hung_up'
  | 'partial_asked_callback'
  | 'referred_to_other'
  | 'removed_from_campaign'
  | 'no_longer_in_universe'

export type CtaResponse = 'accepted' | 'considering' | 'declined' | 'not_reached'
export type SupportLevel = 'strong_supporter' | 'supporter' | 'neutral' | 'unsupportive' | 'hostile'
export type OutcomeCategory = 'dial' | 'conversation' | 'cta'

export type OutcomeSideEffect = 'none' | 'set_membership_pending'

export interface CallScript {
  script_id: number
  campaign_id: number | null
  draft_id: number | null
  base_script_id: number | null
  title: string
  version: number
  status: ScriptStatus
  call_objective: string | null
  estimated_duration_minutes: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CallScriptSection {
  section_id: number
  script_id: number
  sort_order: number
  section_type: ScriptSectionType
  title: string
  body_text: string
  talking_points: string[]
  prompt_text: string | null
  expected_outcomes: string[]
  is_optional: boolean
  created_at: string
  updated_at: string
}

export interface CallList {
  list_id: number
  campaign_id: number | null
  script_id: number | null
  name: string
  description: string | null
  status: CallListStatus
  source_filters: Record<string, unknown> | null
  priority_strategy: CallListPriorityStrategy
  total_items: number
  completed_items: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CallListItem {
  item_id: number
  list_id: number
  worker_id: number
  sort_order: number
  priority_score: number
  status: CallListItemStatus
  assigned_to: string | null
  attempts_count: number
  last_attempt_at: string | null
  best_disposition: string | null
  next_call_at: string | null
  notes: string | null
  /**
   * Soft-claim timestamp (ISO). Populated when a caller has reserved this
   * item via `claim_next_call_list_item`. Cleared on attempt or release.
   */
  claimed_at?: string | null
  claimed_by_session_label?: string | null
  claimed_by_worker_id?: number | null
  created_at: string
  updated_at: string
}

export interface CallAttempt {
  attempt_id: number
  list_item_id: number
  script_id: number | null
  caller_user_id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  dial_disposition: DialDisposition
  call_disposition: CallDisposition | null
  overall_notes: string | null
  callback_datetime: string | null
  support_level_assessed: SupportLevel | null
  follow_up_action: string | null
  cta_response: CtaResponse | null
  created_at: string
}

export interface CallStepOutcome {
  step_outcome_id: number
  attempt_id: number
  section_id: number
  reached: boolean
  outcome_value: string | null
  notes: string | null
  duration_seconds: number | null
  sort_order: number
  created_at: string
}

export type OutcomeResponseType = 'checkbox' | 'text' | 'select' | 'number'

export interface CallOutcomeDefinition {
  outcome_id: number
  campaign_id: number | null
  script_id: number | null
  /** FK to campaign_activities when this outcome maps to an assessment activity. */
  activity_id: number | null
  name: string
  description: string | null
  outcome_category: OutcomeCategory
  maps_to_ambition_id: number | null
  /** Explicit rating (1..5) produced by this outcome. Overrides legacy composite. */
  maps_to_rating_level: number | null
  /** Optional binary value (e.g. yes/no/DNP) recorded alongside the rating. */
  maps_to_binary_value: string | null
  is_positive: boolean
  sort_order: number
  response_type: OutcomeResponseType
  response_options: { value: string; label: string }[] | null
  side_effect: OutcomeSideEffect
  side_effect_payload: Record<string, unknown> | null
  created_at: string
}

export interface OutcomeEntry {
  outcome_id: number
  response_value?: string | null
}

export interface CallScriptWithSections extends CallScript {
  sections?: CallScriptSection[]
  call_script_sections?: CallScriptSection[]
}

export interface CallListWithStats extends CallList {
  script?: CallScript | null
  total_attempts?: number
  connect_rate_pct?: number
  positive_calls?: number
  /** All script_ids ever linked to this list via call_list_scripts. */
  linked_script_ids?: number[]
  linked_script_count?: number
  /** The script_id marked is_current = true in call_list_scripts (mirrored on call_lists.script_id). */
  current_script_id?: number | null
  /** When the list query includes ?script_id=X, whether this list has been linked to that script before. */
  previously_linked?: boolean
  /** When ?script_id=X is supplied, whether that script is currently the current wave for this list. */
  is_current_for_script?: boolean
}

export interface CallListItemWithWorker extends CallListItem {
  worker: {
    worker_id: number
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    occupation: string | null
    address: string | null
    suburb: string | null
    state: string | null
    postcode: string | null
    employer_id: number | null
    worksite_id: number | null
    union_membership_type_id?: number | null
    /** Resolved from union_membership_types.type_name for call UI (membership ask routing). */
    union_membership_type_name?: string | null
    employer_name: string | null
    worksite_name: string | null
  }
  connection?: {
    connection_id: number
    connection_status: string
    support_level: string | null
    contact_count: number
    last_contacted_at: string | null
    notes: string | null
  } | null
  recent_attempts?: CallAttempt[]
  /**
   * Cross-list dedup hint — most-recent attempt for this worker on this
   * campaign from a DIFFERENT call list. Surfaced to the caller as a
   * "called recently on List X by Alice" badge so we avoid double-dialling
   * the same worker through parallel lists.
   */
  cross_list_status?: {
    campaign_id: number
    worker_id: number
    list_id: number
    list_name: string
    last_attempt_id: number
    last_attempt_at: string
    last_dial_disposition: string | null
    last_call_disposition: string | null
    last_outcome_classification: string | null
    last_caller_session_label: string | null
  } | null
}

export interface CapturedObjectionPayload {
  objection_id: number | null
  custom_label?: string
  outcome: 'fully_resolved' | 'partially_resolved' | 'not_resolved'
  notes?: string
}

export interface CapturedIssuePayload {
  issue_label: string
  heat: 1 | 2 | 3 | 4 | 5
  source_top_issue_index?: number | null
  notes?: string
}

export interface RecordCallAttemptRequest {
  list_item_id: number
  script_id: number | null
  dial_disposition: DialDisposition
  call_disposition?: CallDisposition | null
  overall_notes?: string | null
  callback_datetime?: string | null
  support_level_assessed?: SupportLevel | null
  follow_up_action?: string | null
  cta_response?: CtaResponse | null
  duration_seconds?: number | null
  step_outcomes?: {
    section_id: number
    reached: boolean
    outcome_value?: string | null
    notes?: string | null
    duration_seconds?: number | null
    sort_order: number
  }[]
  /**
   * Overall call outcome classification (D1 taxonomy). Single-select from
   * the canonical vocabulary on call_attempts.outcome_classification.
   */
  outcome_classification?: string | null
  outcome_ids?: number[]
  objections?: CapturedObjectionPayload[]
  issues?: CapturedIssuePayload[]
  /**
   * Per-CTA ratings captured during the call. Each entry persists a
   * call_attempt_cta_ratings row and (when the linked ambition has an
   * activity_id) propagates to campaign_activity_ratings via
   * record_assessment_event().
   */
  cta_ratings?: CapturedCtaRatingPayload[]
  /**
   * Per-call assessment ratings — one per assessment the driver selected
   * at session setup (phone_call_actions.selected_assessment_ids). Persisted
   * to call_attempt_assessment_ratings; non-null ratings also propagate to
   * campaign_activity_ratings.
   */
  assessment_ratings?: CapturedAssessmentRatingPayload[]
  /**
   * Orchestrator session this attempt belongs to. When set the audit row
   * in worker_activity_log is tagged so session reports can attribute it.
   */
  action_id?: number | null
}

export interface CapturedAssessmentRatingPayload {
  /** FK to campaign_activities.activity_id (an assessment row). */
  activity_id: number
  /** 1..5 inclusive; null = the driver left this assessment unrated. */
  rating?: number | null
  notes?: string | null
}

export interface CapturedCtaRatingPayload {
  /** FK to call_script_cta_ambitions.id */
  cta_ambition_id: number
  /** 1..5 inclusive (campaign_activity_ratings.rating). Null when only binary_value is recorded. */
  rating?: number | null
  /** yes / no / unsure / abstain (campaign_activity_ratings.binary_value). Null when only rating is recorded. */
  binary_value?: string | null
  notes?: string | null
}

export interface CallOutcomeSummary {
  outcome_id: number
  campaign_id: number | null
  script_id: number | null
  name: string
  outcome_category: OutcomeCategory
  maps_to_ambition_id: number | null
  is_positive: boolean
  times_recorded: number
  unique_contacts: number
  connected_attempts_with_outcome: number
}

export interface CallCampaignSummary {
  campaign_id: number
  list_id: number
  list_name: string
  list_status: CallListStatus
  total_items: number
  completed_items: number
  priority_strategy: CallListPriorityStrategy
  script_id: number | null
  script_title: string | null
  total_attempts: number
  unique_contacts_attempted: number
  connected_count: number
  no_answer_count: number
  voicemail_count: number
  bad_number_count: number
  dnc_count: number
  connect_rate_pct: number
  cta_accepted: number
  cta_considering: number
  cta_declined: number
  positive_calls: number
  neutral_calls: number
  negative_calls: number
  avg_call_duration_seconds: number | null
  callbacks_pending: number
}

export interface StructureScriptRequest {
  draft_id?: number
  body_text?: string
  campaign_context?: {
    employer_name: string
    agreement_name: string
    stage_name: string
  }
}

export interface StructureScriptResponse {
  sections: Omit<CallScriptSection, 'section_id' | 'script_id' | 'created_at' | 'updated_at'>[]
}
