import type { Database } from './database'

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
export type MetricType = 'percentage' | 'count' | 'boolean' | 'date'
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
