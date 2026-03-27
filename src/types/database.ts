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
  | "FLNG"
  | "Platform"
  | "Onshore_LNG"
  | "Gas_Plant"
  | "Hub"
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
  union_id: number | null;
  member_number: string | null;
  join_date: string | null;
  resignation_date: string | null;
  engagement_score: number;
  engagement_level: string;
  action_network_id: string | null;
  notes: string | null;
  is_active: boolean;
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
  source: "fuzzy" | "ai" | "merged";
  accepted: boolean;
}

export interface CategoryProposal {
  employerId: number;
  employerName: string;
  currentCategory: string | null;
  proposedCategory: string;
  confidence: WizardConfidence;
  reasoning: string;
  source: "fuzzy" | "ai" | "merged";
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
  source: "fuzzy" | "ai" | "merged";
  accepted: boolean;
  overridden: boolean;
}

export interface WizardProposals {
  employerGroups: EmployerGroupProposal[];
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
