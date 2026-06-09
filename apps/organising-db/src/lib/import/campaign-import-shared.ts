/**
 * Shared types and pure helpers for the "Import Campaign Lists" wizard.
 *
 * The campaign-list import differs from the single-employer worker import in
 * one key way: the source file packs an EMPLOYER and (optionally) a VESSEL /
 * worksite into a single "Company Name" column using a colon convention, e.g.
 *
 *   "OSM Maritime: Siem Thiima"  -> employer "OSM Maritime", vessel "Siem Thiima"
 *   "Dof Subsea Australia"       -> employer "Dof Subsea Australia", vessel null
 *
 * These helpers are imported by both the client wizard and the server
 * analyse/apply routes so the parsing rules stay in one place.
 */

import type { UnionMembershipTypeKey } from "@/lib/workers/worker-import-membership";

export type ImportConfidence = "high" | "medium" | "low";

// ─── Company-name → employer / vessel split ──────────────────────────────────

export interface SplitCompany {
  /** Employer portion (before the first colon), trimmed. "" when blank. */
  employer: string;
  /** Vessel / worksite portion (after the first colon), or null when absent. */
  vessel: string | null;
}

/** Split a "Company Name" cell into employer + optional vessel on the first colon. */
export function splitCompanyName(raw: string | null | undefined): SplitCompany {
  const value = (raw ?? "").trim();
  if (!value) return { employer: "", vessel: null };
  const idx = value.indexOf(":");
  if (idx === -1) return { employer: value, vessel: null };
  const employer = value.slice(0, idx).trim();
  const vessel = value.slice(idx + 1).trim();
  return { employer: employer || value, vessel: vessel || null };
}

/**
 * Resolve the best worksite/vessel candidate for a row: prefer the colon-vessel
 * embedded in Company Name, fall back to the separate Employee Worksite column.
 */
export function resolveVesselCandidate(
  companyName: string | null | undefined,
  worksiteColumn: string | null | undefined
): string {
  const { vessel } = splitCompanyName(companyName);
  if (vessel) return vessel;
  return (worksiteColumn ?? "").trim();
}

// ─── Generic / junk worksite detection ───────────────────────────────────────

const GENERIC_WORKSITE_VALUES = new Set([
  "",
  "various",
  "various vessels",
  "various tidewater vessels",
  "multiple",
  "offshore",
  "offshore vessel",
  "offshore vessels",
  "offshore ships",
  "offshore supply vessel",
  "offshore oil and gas",
  "offshore oil & gas",
  "vessel",
  "vessels",
  "vessel crew",
  "ship",
  "ships",
  "rig",
  "psv",
  "ahts",
  "osv/ahts",
  "tbd",
  "tba",
  "undefined yet",
  "undefined",
  "n/a",
  "na",
  "none",
  "unknown",
  "oil and gas",
  "oil & gas",
]);

/**
 * Whether a vessel/worksite string is too generic to be a real named unit.
 * Generic values are routed to an employer-level "Unspecified vessel" bucket
 * rather than creating a junk worksite/OU.
 */
export function isGenericWorksite(name: string | null | undefined): boolean {
  const v = (name ?? "").trim().toLowerCase().replace(/[’']/g, "");
  if (!v) return true;
  return GENERIC_WORKSITE_VALUES.has(v);
}

// ─── Membership account-status suggestion ────────────────────────────────────

/**
 * Best-guess mapping from a free-text "Member Account Status" value to an OA
 * union_membership_types key. The raw status is always preserved in the worker
 * record's notes; this only seeds the value-mapping step so the user has fewer
 * clicks. `confident` rows are pre-confirmed; everything else is surfaced for
 * explicit user confirmation.
 */
export function suggestMembershipKey(raw: string | null | undefined): {
  key: UnionMembershipTypeKey | null;
  confident: boolean;
} {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return { key: null, confident: false };
  if (/prospective|pending/.test(v)) return { key: "member_pending", confident: true };
  if (/resign|archiv/.test(v)) return { key: "resigned_member", confident: true };
  if (/not\s+a\s+member|non[\s-]?member/.test(v)) return { key: "non_member", confident: true };
  if (/active/.test(v)) return { key: "financial_member", confident: true };
  // Lapsing / ambiguous states — suggest financial but require confirmation.
  if (/stopped\s*payment|suspend|no\s*contact|arrears|lapsed/.test(v)) {
    return { key: "financial_member", confident: false };
  }
  return { key: null, confident: false };
}

// ─── Column mapping ──────────────────────────────────────────────────────────

export type CampaignMappableField =
  | "reference_id"
  | "first_name"
  | "last_name"
  | "full_name"
  | "company_name" // employer (+ optional vessel after a colon)
  | "worksite" // separate worksite / vessel column
  | "occupation"
  | "membership_status"
  | "phone"
  | "email"
  | "notes"
  | "ignore";

export const CAMPAIGN_MAPPABLE_FIELDS: { value: CampaignMappableField; label: string }[] = [
  { value: "reference_id", label: "Reference ID / Member Number" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "full_name", label: "Full Name (split)" },
  { value: "company_name", label: "Company Name (employer : vessel)" },
  { value: "worksite", label: "Worksite / Vessel" },
  { value: "occupation", label: "Job Title / Occupation" },
  { value: "membership_status", label: "Member Account Status (map values)" },
  { value: "phone", label: "Phone / Mobile" },
  { value: "email", label: "Email" },
  { value: "notes", label: "Notes / Comments" },
  { value: "ignore", label: "(Ignore)" },
];

/** Infer a field from a column header. Mirrors the worker-import auto-mapper. */
export function autoMapCampaignHeader(header: string): CampaignMappableField {
  const h = header.toLowerCase().replace(/[\s_-]/g, "");
  if (
    ["referenceid", "refid", "membernumber", "memberno", "memberid", "refno", "referenceno"].includes(h)
  )
    return "reference_id";
  if (["firstname", "givenname", "forename", "given", "first"].includes(h)) return "first_name";
  if (["lastname", "surname", "familyname", "last"].includes(h)) return "last_name";
  if (["name", "fullname", "workername", "employeename"].includes(h)) return "full_name";
  if (
    ["companyname", "company", "employer", "employername", "organisation", "organization"].includes(h)
  )
    return "company_name";
  if (
    ["worksite", "site", "location", "worklocation", "vessel", "employeeworksite", "ship"].includes(h)
  )
    return "worksite";
  if (["occupation", "jobtitle", "job", "trade", "position", "role", "worktitle"].includes(h))
    return "occupation";
  if (
    ["membership", "membershipstatus", "status", "memberstatus", "memberaccountstatus", "accountstatus"].includes(
      h
    )
  )
    return "membership_status";
  if (["mobile", "phone", "mobilenumber", "mobileno", "phonenumber", "phoneno", "contact", "mob"].includes(h))
    return "phone";
  if (["email", "emailaddress"].includes(h)) return "email";
  if (["notes", "note", "comments", "comment", "remarks"].includes(h)) return "notes";
  return "ignore";
}

// ─── Analyse request / response contracts ────────────────────────────────────

export interface CampaignAnalyseRequest {
  /** One entry per worker row: the raw company-name + worksite-column values. */
  rows: { companyName: string; worksite: string }[];
  /** Distinct job-title values with counts. */
  occupationValues: { value: string; count: number }[];
  /** Distinct account-status values with counts. */
  statusValues: { value: string; count: number }[];
}

export interface MatchProposal<TName extends string> {
  matchedId: number | null;
  matchedName: TName | null;
  confidence: ImportConfidence;
  isNew: boolean;
  score: number;
}

export interface VesselProposal {
  /** Stable key: `${employerKey}||${canonicalName}`. */
  key: string;
  canonicalName: string;
  variants: string[];
  count: number;
  isGeneric: boolean;
  match: MatchProposal<string>;
}

export interface EmployerProposal {
  /** Stable key: the cluster canonical name. */
  key: string;
  canonicalName: string;
  variants: string[];
  count: number;
  match: MatchProposal<string>;
  vessels: VesselProposal[];
}

export interface OccupationAnalyseProposal {
  rawValue: string;
  count: number;
  matchedOccupationId: number | null;
  matchedOccupationName: string | null;
  createName: string | null;
  confidence: ImportConfidence;
}

export interface StatusAnalyseProposal {
  rawValue: string;
  count: number;
  membershipKey: UnionMembershipTypeKey | null;
  confident: boolean;
}

export interface CampaignAnalyseResponse {
  success: true;
  employers: EmployerProposal[];
  occupations: OccupationAnalyseProposal[];
  statuses: StatusAnalyseProposal[];
  /** Per input row (same order): which employer/vessel cluster it belongs to. */
  rowAssignments: { employerKey: string; vesselKey: string }[];
}

// ─── Apply request / response contracts ──────────────────────────────────────

export interface ApplyEmployer {
  key: string;
  canonicalName: string;
  variants: string[];
  action: "match" | "create";
  matchedEmployerId: number | null;
  newCategory: string | null;
  /** When set, fold this employer's rows into another employer key. */
  mergeIntoKey?: string | null;
}

export interface ApplyVessel {
  key: string;
  employerKey: string;
  canonicalName: string;
  variants: string[];
  isGeneric: boolean;
  action: "match" | "create" | "unspecified";
  matchedWorksiteId: number | null;
  newWorksiteType: string | null;
  mergeIntoKey?: string | null;
}

export interface ApplyOccupation {
  rawValue: string;
  action: "match" | "create" | "skip";
  matchedOccupationId: number | null;
  createName: string | null;
}

export interface ApplyStatus {
  rawValue: string;
  membershipTypeId: number | null;
}

export interface CampaignImportWorkerRow {
  rowIndex: number;
  referenceId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  rawStatus: string;
  rawOccupation: string | null;
  notes: string | null;
  /** Cluster keys linking the worker to the resolved employer + vessel. */
  employerKey: string;
  vesselKey: string;
  /** Dedup decision. */
  action: "create" | "update" | "skip";
  existingWorkerId?: number;
}

export interface CampaignImportApplyRequest {
  fileName: string;
  /** Existing campaign to import into, or null to create a new one. */
  campaignId: number | null;
  /** Provided when campaignId is null. */
  newCampaign?: {
    name: string;
    campaign_type: string;
    status: string;
    organiser_id: number | null;
  } | null;
  /** Whether to build the two-tier (employer group → vessel unit) OU structure. */
  buildOus: boolean;
  /** Name for the campaign_worker_list that captures every imported worker. */
  listName: string;
  employers: ApplyEmployer[];
  vessels: ApplyVessel[];
  occupations: ApplyOccupation[];
  statuses: ApplyStatus[];
  rows: CampaignImportWorkerRow[];
}

export interface CampaignImportApplyResponse {
  success: boolean;
  campaignId: number | null;
  listId: number | null;
  stats: {
    employersCreated: number;
    worksitesCreated: number;
    workersCreated: number;
    workersUpdated: number;
    workersSkipped: number;
    groupsCreated: number;
    unitsCreated: number;
    assignmentsCreated: number;
    listItemsCreated: number;
  };
  errors: string[];
}
