import type {
  EmployerInteractionState,
  EmployerRelationshipType,
  HrSentiment,
  IssueHeat,
  WorkforceEventScale,
  WorkforceEventType,
} from "./constants";

/**
 * Top-level row shape of `campaign_situation_analyses`. We define this
 * locally rather than waiting for db-types regen so the wizard step can
 * compile against a canonical shape today; once the generated row type
 * lands it can be substituted with no caller changes.
 */
export interface CampaignSituationAnalysis {
  situation_id: number;
  campaign_id: number;
  version: number;
  is_current: boolean;

  employer_interaction_state: EmployerInteractionState | null;
  employer_state_notes: string | null;
  balloted_count: number | null;

  top_issues: TopIssue[];
  upcoming_workforce_changes: WorkforceChange[];
  employer_relationships: EmployerRelationshipEntry[];
  hr_posture: HrPosture;
  union_history: UnionHistory;

  strategic_context_summary: string | null;
  company_playbook: CompanyPlaybookMove[];
  workforce_populations: WorkforcePopulation[];
  leverage_and_maths: LeverageAndMaths;
  information_gaps: InformationGap[];

  ai_generated: boolean;
  ai_model: string | null;
  ai_prompt_snapshot: Record<string, unknown> | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TopIssue {
  /** Stable client-side draft id; not persisted. */
  draft_id?: string;
  label: string;
  heat: IssueHeat;
  notes?: string;
  /** Phase 3: OA (union) negotiating position on this issue. */
  oa_position?: string;
  /** Phase 3: Employer's negotiating position on this issue. */
  employer_position?: string;
}

export interface WorkforceChange {
  draft_id?: string;
  event_type: WorkforceEventType;
  label: string;
  expected_date?: string | null;
  scale?: WorkforceEventScale | null;
  notes?: string;
}

export interface EmployerRelationshipEntry {
  draft_id?: string;
  /** When set, references employers.employer_id. Null for "external" peers we don't yet model. */
  related_employer_id: number | null;
  related_employer_name: string;
  relationship_type: EmployerRelationshipType;
  /** Free-text describing recent behaviour in contractor campaigns, sister-site benchmarks, etc. */
  recent_behaviour?: string;
  notes?: string;
  /** TRUE when the row was auto-populated from employers.parent_employer_id. */
  auto_populated?: boolean;
}

export interface HrContact {
  name: string;
  role?: string;
  posture?: HrSentiment | null;
  notes?: string;
}

export interface HrPosture {
  sentiment?: HrSentiment | null;
  contacts?: HrContact[];
  notes?: string;
}

export interface PriorBallotOutcome {
  /** ISO date or year string. */
  when?: string;
  outcome: string;
  yes_pct?: number;
  no_pct?: number;
  notes?: string;
}

export interface PriorCampaignSummary {
  /** When this rows was auto-populated from a campaigns row. */
  source_campaign_id?: number;
  name: string;
  outcome?: string;
  notes?: string;
}

export interface UnionHistory {
  prior_eba_count?: number;
  prior_ballot_outcomes?: PriorBallotOutcome[];
  prior_campaigns?: PriorCampaignSummary[];
  delegate_structure?: string;
  notes?: string;
}

export interface CompanyPlaybookMove {
  move: string;
  why: string;
  /** "Where this play breaks" — feeds inoculation copy. */
  disruption_point?: string;
}

export interface WorkforcePopulation {
  name: string;
  approx_size?: number;
  source_of_evidence?: string;
  /** Strategic emphasis for this population in the SOC, mirroring §2.3 of the field guide. */
  soc_emphasis?: string;
}

export interface LeverageAndMaths {
  timing_constraints?: string;
  vote_arithmetic?: string;
  regulatory_window?: string;
}

export interface InformationGap {
  question: string;
  why_it_matters?: string;
}

/**
 * A prior employer-run or union-run ballot recorded as part of the
 * bargaining context section of the situation analysis.
 */
export interface PriorEmployerBallot {
  ballot_kind?: 'agreement_approval' | 'protected_action' | 'other';
  /** ISO date when the ballot was conducted. */
  conducted_at?: string;
  yes_count?: number;
  no_count?: number;
  total_eligible?: number;
  outcome?: 'passed' | 'failed' | 'withdrawn';
  notes?: string;
}

/**
 * A key dispute in the bargaining context, representing a contested issue
 * between the union and the employer.
 */
export interface KeyDispute {
  topic: string;
  notes?: string;
}

/**
 * Organiser's estimate of worker support, stored as a JSONB object in the DB.
 * The `context` field clarifies what the estimate is measuring, since the
 * strategic interpretation differs significantly between the three scenarios.
 */
export interface WorkerSupportEstimate {
  /** Clarifies what this estimate is measuring. */
  context?: 'general_support' | 'employer_agreement_ballot' | 'pabo_industrial_action';
  /** Percentage of workers estimated to be supportive (0–100). */
  percent_supportive_estimated?: number;
  /** How the organiser arrived at this estimate. */
  basis_of_estimate?: string;
  notes?: string;
}

/**
 * Draft state used by the wizard step: a CampaignSituationAnalysis with
 * server-set columns (id, version, audit) optional/absent, suitable for
 * upsert from the client.
 */
export interface SituationAnalysisDraft {
  situation_id: number | null;
  employer_interaction_state: EmployerInteractionState | null;
  employer_state_notes: string;
  balloted_count: number | null;

  top_issues: TopIssue[];
  upcoming_workforce_changes: WorkforceChange[];
  employer_relationships: EmployerRelationshipEntry[];
  hr_posture: HrPosture;
  union_history: UnionHistory;

  strategic_context_summary: string;
  company_playbook: CompanyPlaybookMove[];
  workforce_populations: WorkforcePopulation[];
  leverage_and_maths: LeverageAndMaths;
  information_gaps: InformationGap[];

  // ── Bargaining context (Phase 2) ────────────────────────────────────────
  /** NERR (Notice of Employee Representational Rights) status. */
  nerr_status?: 'not_issued' | 'issued' | 'superseded' | 'unknown';
  /** ISO date when the NERR was issued. Only relevant when nerr_status === 'issued'. */
  nerr_issued_at?: string;
  /** Mirrors the bargaining_phase_state DB enum; tracks the current bargaining phase. */
  bargaining_phase_state?: string;
  /** Whether the employer is expected to put their proposed agreement to a vote (s437 agreement approval ballot). none / signalled / imminent / unknown. */
  employer_ballot_intent?: 'none' | 'signalled' | 'imminent' | 'unknown';
  /** Structured history of prior employer-initiated ballots. */
  prior_employer_ballots?: PriorEmployerBallot[];
  /** Key disputed issues between the union and employer during bargaining. */
  key_disputes?: KeyDispute[];
  /** Organiser's estimate of worker support. See WorkerSupportEstimate for context field usage. */
  worker_support_estimate?: WorkerSupportEstimate;
}

export function emptySituationAnalysisDraft(): SituationAnalysisDraft {
  return {
    situation_id: null,
    employer_interaction_state: null,
    employer_state_notes: "",
    balloted_count: null,
    top_issues: [],
    upcoming_workforce_changes: [],
    employer_relationships: [],
    hr_posture: {},
    union_history: {},
    strategic_context_summary: "",
    company_playbook: [],
    workforce_populations: [],
    leverage_and_maths: {},
    information_gaps: [],
    nerr_status: undefined,
    nerr_issued_at: undefined,
    bargaining_phase_state: undefined,
    employer_ballot_intent: undefined,
    prior_employer_ballots: [],
    key_disputes: [],
    worker_support_estimate: undefined,
  };
}

/** Validate that the survey has the minimum required content to advance. */
export function isSituationAnalysisComplete(
  draft: SituationAnalysisDraft
): boolean {
  if (!draft.employer_interaction_state) return false;
  if (
    !draft.top_issues.some(
      (issue) => issue.label && issue.label.trim().length > 0
    )
  ) {
    return false;
  }
  return true;
}
