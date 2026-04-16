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
export type StageNumber = 1 | 2 | 3 | 4 | 5 | 6
export type GateNumber = 1 | 2 | 3 | 4 | 5

export const STAGE_NAMES: Record<StageNumber, string> = {
  1: 'Contact ID & Mapping',
  2: 'Intro Comms & Education',
  3: 'Member Mobilisation',
  4: 'Develop Claims / MSD',
  5: 'Endorsement & Commence Bargaining',
  6: 'Bargaining to Win',
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

export type CtaResponse = 'accepted' | 'considering' | 'declined' | 'not_reached'
export type SupportLevel = 'strong_supporter' | 'supporter' | 'neutral' | 'unsupportive' | 'hostile'
export type OutcomeCategory = 'dial' | 'conversation' | 'cta'

export interface CallScript {
  script_id: number
  campaign_id: number
  draft_id: number | null
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
  campaign_id: number
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

export interface CallOutcomeDefinition {
  outcome_id: number
  campaign_id: number
  script_id: number | null
  name: string
  description: string | null
  outcome_category: OutcomeCategory
  maps_to_ambition_id: number | null
  is_positive: boolean
  sort_order: number
  created_at: string
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
  outcome_ids?: number[]
}

export interface CallOutcomeSummary {
  outcome_id: number
  campaign_id: number
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
