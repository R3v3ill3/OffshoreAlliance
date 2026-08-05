/**
 * Shared types + pure helpers for the wall-chart "Import participation"
 * wizard (Action Network report CSV upload / AN API sync).
 *
 * Imported by both the client wizard components and the server routes at
 * /api/campaigns/[id]/participation-import/* so the contracts stay in
 * one place — mirrors campaign-import-shared.ts.
 */

import type { MatchDisposition, MatchMethod } from "./worker-matching";

// ─── Column mapping (CSV mode) ───────────────────────────────────────────────

export type ParticipationMappableField =
  | "email"
  | "phone"
  | "first_name"
  | "last_name"
  | "full_name"
  | "response"
  | "ignore";

export const PARTICIPATION_MAPPABLE_FIELDS: {
  value: ParticipationMappableField;
  label: string;
}[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone / Mobile" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "full_name", label: "Full Name (split)" },
  { value: "response", label: "Response / Answer (map values)" },
  { value: "ignore", label: "(Ignore)" },
];

/**
 * Infer a field from an AN report column header. AN exports use headers
 * like "email", "first_name", "last_name", "mobile_number", "phone_number",
 * "can2_phone", plus one column per question.
 */
export function autoMapParticipationHeader(header: string): ParticipationMappableField {
  const h = header.toLowerCase().replace(/[\s_-]/g, "");
  if (["email", "emailaddress", "canemail", "can2email"].includes(h)) return "email";
  if (
    [
      "mobile",
      "phone",
      "mobilenumber",
      "mobileno",
      "phonenumber",
      "phoneno",
      "cellphone",
      "cell",
      "can2phone",
      "canphone",
      "contactnumber",
      "contact",
      "mob",
    ].includes(h)
  )
    return "phone";
  if (["firstname", "givenname", "forename", "given", "first"].includes(h)) return "first_name";
  if (["lastname", "surname", "familyname", "last"].includes(h)) return "last_name";
  if (["name", "fullname", "workername"].includes(h)) return "full_name";
  return "ignore";
}

// ─── Response value → rating mapping ────────────────────────────────────────

export type ResponseValueTarget =
  | { kind: "rating"; rating: 1 | 2 | 3 | 4 | 5 }
  | { kind: "binary"; value: string }
  | { kind: "ignore" };

export interface ResponseValueMapping {
  /** Raw distinct value from the response column ("" = blank cells). */
  rawValue: string;
  count: number;
  target: ResponseValueTarget;
}

// ─── Parse route contract ────────────────────────────────────────────────────

export interface ParticipationParseResponse {
  success: true;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

// ─── Match route contract ────────────────────────────────────────────────────

export interface ParticipationMatchRequestRow {
  /** Stable row key: CSV row index or AN person id. */
  key: string;
  emails: string[];
  phones: string[];
  firstName: string;
  lastName: string;
  /** Pre-resolved worker (matched on workers.action_network_id in AN sync mode). */
  resolved_worker_id?: number | null;
}

export interface ParticipationMatchRequest {
  rows: ParticipationMatchRequestRow[];
  /** When set, existing ratings on this assessment are returned per candidate. */
  activity_id?: number | null;
}

export interface ParticipationMatchCandidate {
  worker_id: number;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  in_campaign: boolean;
  method: MatchMethod;
  existing_rating: number | null;
  existing_binary_value: string | null;
}

export interface ParticipationMatchResultRow {
  key: string;
  disposition: MatchDisposition;
  /** Best candidate first — the pre-selected match for auto/confirm rows. */
  candidates: ParticipationMatchCandidate[];
}

export interface ParticipationMatchResponse {
  success: true;
  results: ParticipationMatchResultRow[];
}

// ─── Apply route contract ────────────────────────────────────────────────────

export type ParticipationApplyRow =
  | {
      key: string;
      action: "existing";
      worker_id: number;
      add_to_campaign: boolean;
      rating: number | null;
      binary_value: string | null;
      notes?: string | null;
      /** AN sync mode: backfills workers.action_network_id when unset. */
      an_person_id?: string | null;
    }
  | {
      key: string;
      action: "create";
      new_worker: {
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
      };
      add_to_campaign: boolean;
      rating: number | null;
      binary_value: string | null;
      notes?: string | null;
      /** AN sync mode: stored as the new worker's action_network_id. */
      an_person_id?: string | null;
    }
  | { key: string; action: "skip" };

export type ParticipationApplyActivity =
  | { mode: "existing"; activity_id: number }
  | {
      mode: "new";
      title: string;
      is_binary: boolean;
      supporter_outcome_value: string | null;
      description?: string | null;
    };

export interface ParticipationApplyRequest {
  activity: ParticipationApplyActivity;
  source_kind: "an_api" | "an_report_csv";
  file_name?: string | null;
  an_resource?: {
    type: "form" | "survey" | "petition" | "event";
    id: string;
    browser_url?: string | null;
  } | null;
  /**
   * overwrite  — import wins; existing ratings on the assessment are replaced.
   * fill_blanks — workers already rated on the assessment are left untouched.
   */
  conflict_policy: "overwrite" | "fill_blanks";
  /**
   * When enabled, campaign workforce members NOT present in the import get
   * the given value. Never overwrites an existing rating regardless of
   * conflict_policy.
   */
  non_responders?: {
    enabled: boolean;
    rating: number | null;
    binary_value: string | null;
  } | null;
  /** Opaque audit blob (column map + value map + options) stored on the batch. */
  mapping?: unknown;
  rows: ParticipationApplyRow[];
  /** Preview only: compute counts + conflicts, write nothing. */
  dry_run?: boolean;
}

export interface ParticipationConflict {
  key: string;
  worker_id: number;
  worker_name: string;
  existing_rating: number | null;
  existing_binary_value: string | null;
  new_rating: number | null;
  new_binary_value: string | null;
}

export interface ParticipationApplyPreview {
  success: true;
  dry_run: true;
  to_create: number;
  to_update: number;
  to_skip: number;
  workers_to_create: number;
  memberships_to_add: number;
  non_responder_count: number;
  conflicts: ParticipationConflict[];
}

export interface ParticipationApplyResult {
  success: true;
  dry_run: false;
  batch_id: number;
  activity_id: number;
  ratings_applied: number;
  rows_created: number;
  rows_updated: number;
  rows_skipped: number;
  workers_created: number;
  memberships_added: number;
  non_responders_marked: number;
}

// ─── AN API sync (Phase 2) ───────────────────────────────────────────────────

export type AnResourceType = "form" | "survey" | "petition" | "event";

export interface AnActionListItem {
  resource_type: AnResourceType;
  id: string;
  title: string;
  browser_url: string | null;
  created_date: string | null;
  /** Participation count as reported by AN (submissions/signatures/…). */
  total_records: number | null;
  /** Assessment already linked to this action, if any (enables re-sync). */
  linked_activity_id: number | null;
  linked_activity_title: string | null;
}

export interface AnActionsResponse {
  success: true;
  actions: AnActionListItem[];
}

export interface AnFetchRequest {
  resource_type: AnResourceType;
  resource_id: string;
}

/** Participant already known to us via workers.action_network_id. */
export interface AnKnownParticipant {
  an_person_id: string;
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  responded_at: string | null;
}

export interface AnFetchResponse {
  success: true;
  total_records: number;
  truncated: boolean;
  known: AnKnownParticipant[];
  /** AN person ids that need a person fetch to get identity details. */
  unknown: { an_person_id: string; responded_at: string | null }[];
}

export interface AnResolvedPerson {
  an_person_id: string;
  emails: string[];
  phones: string[];
  given_name: string;
  family_name: string;
}

export interface AnResolvePeopleResponse {
  success: true;
  people: AnResolvedPerson[];
}
