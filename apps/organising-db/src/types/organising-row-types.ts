export type UserRole = "admin" | "user" | "viewer";

export type WorkRole =
  | "coordinator"
  | "lead_organiser"
  | "organiser"
  | "industrial_officer"
  | "industrial_coordinator"
  | "specialist";

export type AgreementOrgRole = "organiser" | "lead" | "industrial_officer";

export type AgreementStatus = "Current" | "Expired" | "Under_Negotiation" | "Terminated";

export type WorksiteType =
  | "FPSO"
  | "FPU"
  | "FLNG"
  | "Platform"
  | "Onshore_LNG"
  | "Gas_Plant"
  | "Drill_Centre"
  | "Region"
  | "Heliport"
  | "Pipeline"
  | "Airfield"
  | "Onshore_Facilities"
  | "CPF"
  | "Gas_Field"
  | "Other";

export type EmployerCategory =
  | "Producer"
  | "Major_Contractor"
  | "Subcontractor"
  | "Labour_Hire"
  | "Specialist"
  | "Principal_Employer";

export type EbaStatusCategory =
  | "expiry_lt_6m"
  | "expiry_6_12m"
  | "expiry_12_24m"
  | "expiry_gt_24m"
  | "first_bargaining"
  | "expired_eba"
  | "no_eba_no_bargaining";

export type EmployerRoleType =
  | "Owner"
  | "Operator"
  | "Principal_Contractor"
  | "Subcontractor"
  | "Labour_Hire"
  | "Other";

export type EngagementType =
  | "direct_employment"
  | "contractor"
  | "subcontractor"
  | "labour_hire";

export type ScopeSource = "manual" | "auto";

export type DuesIncreaseType = "Fixed" | "WPI" | "CPI" | "FWC" | "Other";

export type CampaignType = "bargaining" | "organising" | "mobilisation" | "political";
export type CampaignStatus = "planning" | "active" | "completed" | "suspended";

export type EnterpriseAgreementSubtype = "new" | "replacement" | "boss_initiated";

export type CampaignScopeType =
  | "single_employer_single_site"
  | "single_employer_multi_site"
  | "multi_employer_single_site"
  | "multi_employer_multi_site";

/**
 * Role an attached agreement plays for a campaign (campaign_agreements.relationship_type).
 * - replaced: existing EA being superseded by this campaign
 * - new: fresh EA being created/negotiated
 * - related: in scope but not central
 */
export type CampaignAgreementRelationshipType = "replaced" | "new" | "related";

export interface CampaignAgreementRow {
  id: number;
  campaign_id: number;
  agreement_id: number;
  relationship_type: CampaignAgreementRelationshipType;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type CampaignActivityKind = "task" | "assessment";

export type ActivityRatingSource = "staff" | "leader_form";

export type CampaignOuType =
  | "shift"
  | "department"
  | "network"
  | "job_type"
  | "worksite"
  | "employer"
  | "ethnic_community"
  | "crew_rotation"
  | "accommodation"
  | "work_area"
  | "custom";

/**
 * Dimension a sub-unit was split out of (stored on CampaignOuUnitBasis.dimension).
 * Maps loosely to ou_type but tracked separately so the SplitUnitDialog can
 * suggest sensible names from the parent's worker pool.
 */
export type CampaignOuSplitDimension =
  | "occupation"
  | "shift"
  | "work_area"
  | "roster_panel"
  | "tag"
  | "activist"
  | "custom";

/** Optional JSONB on campaign_organising_units recording the filter that built the unit. */
export interface CampaignOuUnitBasis {
  employer_id?: number;
  worksite_id?: number;
  canonical_occupation_id?: number;
  occupation_group_id?: number;
  shift_id?: number;
  work_area_id?: number;
  roster_panel_id?: number;
  /** When this OU is a sub-unit, the parent OU it was split out of. */
  parent_ou_id?: number;
  /** Categorical dimension this sub-unit was split on. */
  dimension?: CampaignOuSplitDimension;
  /** The literal value (or option id) the dimension matched. */
  value?: string | number | null;
  /** When dimension = "tag", the tag category we grouped on. */
  tag_category?: string | null;
  /** When dimension = "activist", the leader worker id this network rolls under. */
  leader_worker_id?: number;
  custom?: boolean;
}

/**
 * The four canonical campaign-wide goal categories. Stage-level
 * plan_ambitions can opt-in to roll up to one of these via
 * plan_ambitions.parent_campaign_ambition_id.
 */
export type CampaignAmbitionCategory =
  | "membership"
  | "member_leaders"
  | "activism"
  | "industrial_outcomes";

/** Phase 6: kinds of plan revisions we capture in plan_revision_notes. */
export type PlanRevisionType =
  | "schedule_change"
  | "scope_change"
  | "ambition_change"
  | "capacity_change"
  | "management_change"
  | "where_to_play_change"
  | "theory_change"
  | "other";

export interface PlanRevisionNoteRow {
  revision_id: number;
  campaign_id: number;
  stage_number_affected: number;
  revision_type: PlanRevisionType;
  notes: string;
  triggers_downstream_shift: boolean;
  revised_by: string | null;
  revised_at: string;
}

export interface CampaignAmbitionRow {
  campaign_ambition_id: number;
  campaign_id: number;
  category: CampaignAmbitionCategory;
  subcategory: string | null;
  label: string;
  target_value: string | null;
  target_value_max: string | null;
  target_unit: string | null;
  target_date: string | null;
  current_value: string | null;
  current_value_overridden: boolean;
  current_value_override_reason: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type WorkplanTaskType = "discovery" | "outreach" | "mapping" | "engagement" | "admin" | "other";

export type WorkplanTaskStatus = "planned" | "in_progress" | "completed" | "blocked" | "cancelled";

export type WorkplanStatus = "not_started" | "in_progress" | "completed";

export type OuCandidateSource = "wtp_worksite" | "wtp_sector" | "wtp_employer" | "wtp_contact_group" | "manual" | "field_discovery";

export type OuCandidateStatus = "suggested" | "accepted" | "rejected" | "merged";

export type OuSource = "manual" | "wtp_seeded" | "generated" | "field_discovery";

export type CampaignTaskListStatus = "draft" | "active" | "completed";

/** Predefined assessment / task templates (template_key on campaign_activities). */
export type CampaignActivityTemplateKey =
  | "respond_email"
  | "respond_sms"
  | "respond_phone"
  | "complete_survey"
  | "sign_petition"
  | "vote"
  | "attend_video_meeting"
  | "attend_worksite_meeting"
  | "attend_offsite_meeting"
  | "industrial_activity"
  | "visibility_action";

export type ActionType =
  | "door_knock"
  | "phone_call"
  | "text_blast"
  | "meeting"
  | "petition"
  | "rally"
  | "worksite_visit"
  | "sign_up"
  | "survey"
  | "custom";

export type ActionResultType =
  | "contacted"
  | "not_home"
  | "refused"
  | "signed"
  | "attended"
  | "left_message"
  | "wrong_number"
  | "moved"
  | "other";

export type CommunicationChannel = "sms" | "email" | "phone" | "in_person";
export type CommunicationDirection = "inbound" | "outbound";

export type WorkType =
  | "production"
  | "construction"
  | "decommissioning"
  | "brownfields"
  | "service_provision"
  | "maintenance";

export type ProjectStatus =
  | "planning"
  | "active"
  | "commissioning"
  | "operational"
  | "decommissioning"
  | "completed"
  | "absorbed";

export type ProgramStatus =
  | "planning"
  | "active"
  | "completed"
  | "on_hold"
  | "cancelled";

export type AgreementScope =
  | "site_specific"
  | "project_specific"
  | "sector_wide"
  | "company_wide";

export type UniverseRuleType =
  | "agreement"
  | "worksite"
  | "employer"
  | "member_role"
  | "sector"
  | "project"
  | "work_type"
  | "onshore_offshore";

export interface Sector {
  sector_id: number;
  sector_name: string;
  description: string | null;
}

export interface Union {
  union_id: number;
  union_code: string;
  union_name: string;
  is_oa_member: boolean;
}

export interface MemberRoleType {
  role_type_id: number;
  role_name: string;
  display_name: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface UnionMembershipType {
  union_membership_type_id: number;
  type_name: string;
  display_name: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface Employer {
  employer_id: number;
  employer_name: string;
  trading_name: string | null;
  abn: string | null;
  employer_category: EmployerCategory | null;
  parent_company: string | null;
  parent_employer_id: number | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  state: string | null;
  postcode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Worksite {
  worksite_id: number;
  worksite_name: string;
  worksite_type: WorksiteType;
  operator_id: number | null;
  principal_employer_id: number | null;
  parent_worksite_id: number | null;
  location_description: string | null;
  latitude: number | null;
  longitude: number | null;
  basin: string | null;
  is_offshore: boolean;
  is_active: boolean;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agreement {
  agreement_id: number;
  decision_no: string;
  agreement_name: string;
  short_name: string | null;
  sector_id: number | null;
  employer_id: number | null;
  industry_classification: string | null;
  date_of_decision: string | null;
  commencement_date: string | null;
  expiry_date: string | null;
  status: AgreementStatus;
  is_greenfield: boolean;
  is_variation: boolean;
  fwc_link: string | null;
  supersedes_id: number | null;
  variation_of_id: number | null;
  agreement_scope: AgreementScope | null;
  notes: string | null;
  source_sheet: string | null;
  created_at: string;
  updated_at: string;
}

export interface DuesIncrease {
  increase_id: number;
  agreement_id: number;
  increase_number: number;
  effective_date: string | null;
  increase_type: DuesIncreaseType | null;
  percentage: number | null;
  minimum_pct: number | null;
  maximum_pct: number | null;
  raw_description: string | null;
}

export interface Organiser {
  organiser_id: number;
  organiser_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface Worker {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  date_of_birth: string | null;
  gender: string | null;
  occupation: string | null;
  classification: string | null;
  employer_id: number | null;
  worksite_id: number | null;
  project_id: number | null;
  member_role_type_id: number | null;
  union_membership_type_id: number | null;
  union_id: number | null;
  member_number: string | null;
  join_date: string | null;
  resignation_date: string | null;
  action_network_id: string | null;
  notes: string | null;
  is_active: boolean;
  is_hsr: boolean | null;
  is_bargaining_rep: boolean | null;
  /** FK to worker_shift_options.id (nullable). */
  shift_id: number | null;
  /** FK to worker_work_area_options.id (nullable). */
  work_area_id: number | null;
  /** FK to worker_roster_panel_options.id (nullable). */
  roster_panel_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  campaign_id: number;
  name: string;
  description: string | null;
  campaign_type: CampaignType;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  organiser_id: number | null;
  notes: string | null;
  enterprise_agreement_subtype: EnterpriseAgreementSubtype | null;
  replaced_agreement_id: number | null;
  campaign_scope: CampaignScopeType | null;
  total_worker_estimate: number | null;
  sector_wide: boolean;
  msd_required?: boolean;
  plan_timeframe_weeks?: number | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignUniverse {
  universe_id: number;
  campaign_id: number;
  name: string;
  description: string | null;
}

export interface CampaignUniverseRule {
  rule_id: number;
  universe_id: number;
  rule_type: UniverseRuleType;
  rule_entity_id: number;
  include: boolean;
}

export interface CampaignAction {
  action_id: number;
  campaign_id: number;
  action_type: ActionType;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  universe_id: number | null;
  assigned_organiser_id: number | null;
  created_at: string;
}

export interface CampaignActionResult {
  result_id: number;
  action_id: number;
  worker_id: number;
  organiser_id: number | null;
  result_type: ActionResultType;
  notes: string | null;
  action_date: string;
}

export interface CampaignEmployer {
  id: number;
  campaign_id: number;
  employer_id: number;
  created_at: string;
}

export interface CampaignWorksite {
  id: number;
  campaign_id: number;
  worksite_id: number | null;
  sector_wide: boolean;
  created_at: string;
}

export interface CampaignWorkerMembership {
  membership_id: number;
  campaign_id: number;
  worker_id: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignActivity {
  activity_id: number;
  campaign_id: number;
  title: string;
  description: string | null;
  template_key: string | null;
  activity_kind: CampaignActivityKind;
  is_binary: boolean;
  supporter_outcome_value: string | null;
  is_custom: boolean;
  created_at: string;
}

export interface CampaignActivityRating {
  rating_id: number;
  activity_id: number;
  worker_id: number;
  rating: number;
  binary_value: string | null;
  notes: string | null;
  rated_at: string;
  source: ActivityRatingSource;
  rated_by_user_id: string | null;
}

export interface CampaignOrganisingUnit {
  ou_id: number;
  campaign_id: number;
  ou_type: CampaignOuType;
  name: string;
  total_workers_estimated: number | null;
  source_metadata: Record<string, unknown> | null;
  anchor_worker_id: number | null;
  commonality_logic: string | null;
  target_size: number | null;
  source: OuSource;
  /** When set, this OU is a sub-unit nested under another OU (one level only). */
  parent_ou_id: number | null;
  display_order: number;
  unit_basis: CampaignOuUnitBasis | null;
  created_at: string;
  updated_at: string;
}

/** Reusable shift label assignable to workers.shift_id. */
export interface WorkerShiftOption {
  id: number;
  name: string;
  employer_id: number | null;
  worksite_id: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Reusable work area / department label assignable to workers.work_area_id. */
export interface WorkerWorkAreaOption {
  id: number;
  name: string;
  employer_id: number | null;
  worksite_id: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Reusable roster / panel / crew label assignable to workers.roster_panel_id. */
export interface WorkerRosterPanelOption {
  id: number;
  name: string;
  employer_id: number | null;
  worksite_id: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Per-parent roll-up from campaign_unit_hierarchy_summary view. */
export interface CampaignUnitHierarchySummaryRow {
  campaign_id: number;
  parent_ou_id: number;
  parent_name: string;
  parent_ou_type: CampaignOuType;
  child_count: number;
  child_ou_ids: number[];
  aggregate_assigned_workers: number;
}

/** Argument shape for the split_campaign_organising_unit RPC. */
export interface SplitOuSubUnitInput {
  name: string;
  ou_type: CampaignOuType;
  unit_basis?: CampaignOuUnitBasis | null;
  total_workers_estimated?: number | null;
}

export interface SplitOuAssignmentInput {
  /** Index into the parallel SplitOuSubUnitInput[] array passed alongside. */
  sub_index: number;
  worker_id: number;
}

export interface SplitOuRpcArgs {
  p_parent_ou_id: number;
  p_sub_units: SplitOuSubUnitInput[];
  p_assignments: SplitOuAssignmentInput[];
  p_keep_in_parent?: boolean;
}

export interface SplitOuRpcResultRow {
  sub_index: number;
  ou_id: number;
}

export interface CampaignWorkerOu {
  id: number;
  ou_id: number;
  worker_id: number;
  is_primary: boolean;
  created_at: string;
}

export interface CampaignStageWorkplanTask {
  task_id: number;
  campaign_id: number;
  stage_number: number;
  plan_ambition_id: number | null;
  title: string;
  description: string | null;
  task_type: WorkplanTaskType;
  status: WorkplanTaskStatus;
  assigned_organiser_id: number | null;
  assigned_ou_id: number | null;
  due_date: string | null;
  completed_at: string | null;
  priority: number;
  outcome_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignOuCandidate {
  candidate_id: number;
  campaign_id: number;
  suggested_name: string;
  suggested_ou_type: CampaignOuType;
  source: OuCandidateSource;
  source_wtp_id: number | null;
  status: OuCandidateStatus;
  accepted_ou_id: number | null;
  estimated_workers: number | null;
  commonality_logic: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignOuCoverageSummary {
  campaign_id: number;
  total_ous: number;
  sized_ous: number;
  ous_with_contact: number;
  ous_with_activist: number;
  ous_with_delegate: number;
  ous_with_anchor: number;
  total_estimated_workers: number;
  total_assigned_workers: number;
}

export interface WorkplanProgressRow {
  campaign_id: number;
  stage_number: number;
  plan_ambition_id: number | null;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  blocked_tasks: number;
  planned_tasks: number;
  cancelled_tasks: number;
  completion_pct: number;
}

export interface CampaignTaskList {
  task_list_id: number;
  campaign_id: number;
  activity_id: number;
  leader_worker_id: number | null;
  leader_organiser_id: number | null;
  status: CampaignTaskListStatus;
  title: string | null;
  created_at: string;
}

export interface CampaignTaskListItem {
  id: number;
  task_list_id: number;
  worker_id: number | null;
  sort_order: number;
  created_at: string;
}

export interface CampaignLeaderToken {
  token_id: number;
  task_list_id: number;
  token_hash: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface CampaignProspectiveWorker {
  prospective_id: number;
  campaign_id: number;
  task_list_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  rating: number | null;
  merged_worker_id: number | null;
  created_at: string;
}

export interface CampaignWorkerRatingSummaryRow {
  campaign_id: number;
  worker_id: number;
  cumulative_rating: number | null;
  last_activity_rating: number | null;
}

export interface Document {
  document_id: number;
  title: string;
  document_type: string;
  file_path: string;
  agreement_id: number | null;
  employer_id: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface OrganiserPatch {
  patch_id: number;
  organiser_id: number;
  patch_name: string;
  description: string | null;
}

export interface CommunicationsLog {
  log_id: number;
  worker_id: number;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  content: string | null;
  yabbr_message_id: string | null;
  action_network_id: string | null;
  sent_by: number | null;
  sent_at: string;
}

export interface UserProfile {
  user_id: string;
  role: UserRole;
  work_role: WorkRole | null;
  reports_to: string | null;
  display_name: string;
  phone: string | null;
  organiser_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgreementOrganiser {
  id: number;
  agreement_id: number;
  organiser_id: number;
  is_primary: boolean;
  agreement_role: AgreementOrgRole;
}

export interface Tag {
  tag_id: number;
  tag_name: string;
  tag_category: string | null;
  color: string | null;
}

// View types with joined data
export interface AgreementWithRelations extends Agreement {
  sector?: Sector;
  employer?: Employer;
  unions?: Union[];
  worksites?: Worksite[];
  organisers?: (AgreementOrganiser & { organiser?: Organiser })[];
  dues_increases?: DuesIncrease[];
  scopes?: (AgreementScopeRecord & { work_scope?: WorkScope })[];
}

export interface WorkerWithRelations extends Worker {
  employer?: Employer;
  worksite?: Worksite;
  project?: Project;
  member_role_type?: MemberRoleType;
  union?: Union;
  agreements?: Agreement[];
}

export interface WorksiteWithRelations extends Worksite {
  operator?: Employer;
  parent_worksite?: Worksite;
  child_worksites?: Worksite[];
  programs?: Program[];
  projects?: Project[];
  agreements?: Agreement[];
  employer_roles?: (EmployerWorksiteRole & { employer?: Employer })[];
  scopes?: (WorksiteScope & { work_scope?: WorkScope; employer?: Employer })[];
}

export interface EmployerWithRelations extends Employer {
  sectors?: Sector[];
  agreements?: Agreement[];
  worksite_roles?: (EmployerWorksiteRole & { worksite?: Worksite })[];
  scopes?: (EmployerScopeRecord & { work_scope?: WorkScope })[];
}

export interface EmployerWorksiteRole {
  id: number;
  employer_id: number;
  worksite_id: number;
  role_type: EmployerRoleType;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

export interface Program {
  program_id: number;
  program_name: string;
  description: string | null;
  principal_employer_id: number | null;
  program_status: ProgramStatus;
  start_date: string | null;
  expected_end_date: string | null;
  actual_end_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProgramWorksite {
  id: number;
  program_id: number;
  worksite_id: number;
  is_current: boolean;
  is_primary: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

export interface Project {
  project_id: number;
  project_name: string;
  worksite_id: number;
  work_type: WorkType;
  project_status: ProjectStatus;
  start_date: string | null;
  expected_end_date: string | null;
  actual_end_date: string | null;
  absorbed_into_project_id: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectEmployer {
  id: number;
  project_id: number;
  employer_id: number;
  role_type: EmployerRoleType | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
}

export interface ProjectAgreement {
  id: number;
  project_id: number;
  agreement_id: number;
  notes: string | null;
}

export interface WorkScope {
  scope_id: number;
  scope_name: string;
  parent_scope_id: number | null;
  description: string | null;
  is_whole_of_project: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkScopeWithChildren extends WorkScope {
  children?: WorkScopeWithChildren[];
}

export interface WorksiteScope {
  id: number;
  worksite_id: number;
  scope_id: number;
  employer_id: number | null;
  engagement_type: EngagementType | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

export interface WorksiteContract {
  contract_id: number;
  worksite_id: number;
  program_id: number | null;
  project_id: number | null;
  scope_id: number;
  contractor_employer_id: number;
  agreement_id: number | null;
  engagement_type: EngagementType | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerAssignment {
  assignment_id: number;
  worker_id: number;
  contract_id: number;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployerScopeRecord {
  id: number;
  employer_id: number;
  scope_id: number;
  is_current: boolean;
  source: ScopeSource;
}

export interface AgreementScopeRecord {
  id: number;
  agreement_id: number;
  scope_id: number;
}

export interface ProjectWithRelations extends Project {
  worksite?: Worksite;
  employers?: (ProjectEmployer & { employer?: Employer })[];
  agreements?: (ProjectAgreement & { agreement?: Agreement })[];
  absorbed_into?: Project;
}

export interface WorksiteContractWithRelations extends WorksiteContract {
  worksite?: Worksite;
  program?: Program;
  project?: Project;
  work_scope?: WorkScope;
  contractor_employer?: Employer;
  agreement?: Agreement;
}

export interface WorkerAssignmentWithRelations extends WorkerAssignment {
  worker?: Worker;
  contract?: WorksiteContract;
}

export interface ImportLog {
  import_id: number;
  file_name: string;
  import_type: string;
  records_created: number;
  records_updated: number;
  errors: string | null;
  imported_by: string | null;
  imported_at: string;
}

// ---------- Employer Wizard types ----------

export type WizardConfidence = "high" | "medium" | "low";

export interface EmployerGroupProposal {
  proposedParentName: string;
  existingParentId: number | null;
  isNewParent: boolean;
  memberEmployerIds: number[];
  confidence: WizardConfidence;
  source: "fuzzy" | "ai" | "combined";
  accepted: boolean;
}

export interface CategoryProposal {
  employerId: number;
  employerName: string;
  currentCategory: string | null;
  proposedCategory: string;
  confidence: WizardConfidence;
  reasoning: string;
  source: "fuzzy" | "ai" | "combined";
  accepted: boolean;
  overridden: boolean;
}

export interface WorksitePeProposal {
  worksiteId: number;
  worksiteName: string;
  worksiteType: string;
  currentPrincipalEmployerId: number | null;
  currentPrincipalEmployerName: string | null;
  proposedPrincipalEmployerId: number;
  proposedPrincipalEmployerName: string;
  confidence: WizardConfidence;
  reasoning: string;
  source: "fuzzy" | "ai" | "combined";
  accepted: boolean;
  overridden: boolean;
}

export interface DuplicateMergeProposal {
  survivorEmployerId: number;
  memberEmployerIds: number[];
  canonicalName: string;
  aliasNames: string[];
  confidence: WizardConfidence;
  source: "fuzzy" | "ai";
  accepted: boolean;
}

export interface WizardProposals {
  employerGroups: EmployerGroupProposal[];
  duplicateMerges: DuplicateMergeProposal[];
  categoryAssignments: CategoryProposal[];
  worksitePeAssignments: WorksitePeProposal[];
}

export interface WizardApplyResult {
  success: boolean;
  parents_created?: number;
  employers_updated?: number;
  worksites_updated?: number;
  error?: string;
  conflicts?: { type: string; id: number; field: string; expected: string; actual: string }[];
  message?: string;
}

// View: worksite_employer_eba_status
// One row per current (employer, worksite) pair with computed EBA status category.
export interface WorksiteEmployerEbaStatus {
  employer_id: number;
  worksite_id: number;
  employer_name: string;
  worksite_name: string;
  principal_employer_id: number | null;
  principal_employer_name: string | null;
  parent_employer_id: number | null;
  eba_status_category: EbaStatusCategory;
  max_current_expiry: string | null;
  has_current: boolean;
  has_expired: boolean;
  has_bargaining: boolean;
}

// View: principal_employer_eba_summary
// Aggregated EBA coverage counts and percentages per Principal Employer.
export interface PrincipalEmployerEbaSummary {
  principal_employer_id: number;
  principal_employer_name: string;
  total_pairs: number;
  count_no_eba: number;
  count_first_bargaining: number;
  count_expired: number;
  count_lt_6m: number;
  count_6_12m: number;
  count_12_24m: number;
  count_gt_24m: number;
  pct_no_eba: number;
  pct_first_bargaining: number;
  pct_expired: number;
  pct_lt_6m: number;
  pct_6_12m: number;
  pct_12_24m: number;
  pct_gt_24m: number;
}

export interface OrganisingUniverseRow {
  worksite_id: number;
  worksite_name: string;
  worksite_type: WorksiteType;
  is_offshore: boolean;
  parent_worksite_id: number | null;
  parent_worksite_name: string | null;
  principal_employer_id: number | null;
  principal_employer_name: string | null;
  project_id: number | null;
  project_name: string | null;
  work_type: WorkType | null;
  project_status: ProjectStatus | null;
  employer_id: number | null;
  employer_name: string | null;
  employer_category: EmployerCategory | null;
  parent_employer_id: number | null;
  agreement_id: number | null;
  agreement_name: string | null;
  agreement_short_name: string | null;
  agreement_status: AgreementStatus | null;
  agreement_scope: AgreementScope | null;
  agreement_expiry: string | null;
  sector_id: number | null;
  sector_name: string | null;
  worker_count: number;
}

// ---------- Campaign Permission System types ----------

export type PermissionStatus = "active" | "revoked" | "expired";
export type PermissionRequestStatus = "pending" | "approved" | "denied";

export interface CampaignEditPermission {
  permission_id: number;
  campaign_id: number;
  campaign_name?: string;
  granted_by: string;
  granted_by_organiser_id?: number;
  granted_by_name?: string;
  granted_to: string;
  granted_to_organiser_id?: number;
  granted_to_name?: string;
  granted_at: string;
  is_persistent: boolean;
  reason: string | null;
  status: PermissionStatus;
  revoked_at: string | null;
  revoked_by: string | null;
}

export interface CampaignPermissionRequest {
  request_id: number;
  campaign_id: number;
  campaign_name?: string;
  requested_by: string;
  requested_by_organiser_id?: number;
  requested_by_name?: string;
  requested_by_email?: string;
  reason: string | null;
  status: PermissionRequestStatus;
  requested_at: string;
  reviewed_by?: string;
  reviewed_at?: string | null;
  response_reason?: string | null;
  approved_permission_id?: number;
}

export interface MyCampaignPermission {
  campaign_id: number;
  campaign_name: string;
  access_type: "permission" | "creator" | "assigned";
  granted_by_name: string;
  granted_at: string;
}

// RLS helper function results (from RPC calls)
export interface PermissionRequestResult {
  success: boolean;
  message?: string;
  request_id?: number;
  campaign_name?: string;
  owner_id?: string;
  leads_to_notify?: string[];
}

export interface PermissionGrantResult {
  success: boolean;
  message?: string;
  permission_id?: number;
  campaign_id?: number;
}

export interface PermissionRevokeResult {
  success: boolean;
  message?: string;
}
