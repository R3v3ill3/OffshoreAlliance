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

// ─── Extra CSV column mappings (multi-target) ────────────────────────────────

/** How a cell in an extra-mapping column is interpreted. */
export type ExtraMatchMode = "truthy" | "contains" | "exact";

export const EXTRA_MATCH_MODES: { value: ExtraMatchMode; label: string; help: string }[] = [
  {
    value: "truthy",
    label: "Checked / yes",
    help: "Matches Action Network checkbox columns (1) and yes/true/checked.",
  },
  {
    value: "contains",
    label: "Contains text",
    help: "Matches when the cell contains a phrase — use for combined multi-select answers.",
  },
  {
    value: "exact",
    label: "Map each value",
    help: "List distinct answers and map each one, same as the main response column.",
  },
];

/** Values AN checkbox / yes-no columns commonly store when the option is selected. */
const TRUTHY_CELLS = new Set([
  "1",
  "yes",
  "y",
  "true",
  "t",
  "checked",
  "x",
  "on",
  "selected",
]);

export function isTruthyCell(raw: string): boolean {
  return TRUTHY_CELLS.has(raw.trim().toLowerCase());
}

/**
 * Case-insensitive substring match. Splits the cell on common multi-select
 * separators first so "Be a contact, Ask others" matches "be a contact"
 * without also matching a shorter token that is only part of another option
 * when the token itself is present as a whole segment.
 *
 * Falls back to a raw substring check so organisers can still match a phrase
 * inside a sentence-length answer.
 */
export function cellContainsToken(raw: string, token: string): boolean {
  const needle = token.trim().toLowerCase();
  if (!needle) return false;
  const cell = raw.trim().toLowerCase();
  if (!cell) return false;
  const segments = cell.split(/[,;/|]|\band\b/).map((s) => s.trim()).filter(Boolean);
  if (segments.some((s) => s === needle || s.includes(needle))) return true;
  return cell.includes(needle);
}

export type ExtraMatchSpec =
  | { mode: "truthy" }
  | { mode: "contains"; token: string }
  | { mode: "exact"; valueMappings: ResponseValueMapping[] };

/**
 * Resolve one extra-mapping cell to a rating/binary/ignore target.
 * `matchedTarget` is used for truthy and contains modes (the value to record
 * when the cell hits). Exact mode uses the per-value map.
 */
export function resolveExtraCell(
  raw: string,
  spec: ExtraMatchSpec,
  matchedTarget: ResponseValueTarget
): ResponseValueTarget {
  if (spec.mode === "truthy") {
    return isTruthyCell(raw) ? matchedTarget : { kind: "ignore" };
  }
  if (spec.mode === "contains") {
    return cellContainsToken(raw, spec.token) ? matchedTarget : { kind: "ignore" };
  }
  const value = raw.trim();
  const mapping = spec.valueMappings.find((m) => m.rawValue === value);
  return mapping?.target ?? { kind: "ignore" };
}

export function targetToRatingFields(target: ResponseValueTarget): {
  rating: number | null;
  binary_value: string | null;
} {
  if (target.kind === "rating") return { rating: target.rating, binary_value: null };
  if (target.kind === "binary") return { rating: null, binary_value: target.value };
  return { rating: null, binary_value: null };
}

export const LEADERSHIP_ROLE_NAMES = ["contact", "activist", "delegate"] as const;

export function isLeadershipRoleName(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  return (LEADERSHIP_ROLE_NAMES as readonly string[]).includes(roleName.trim().toLowerCase());
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

/** Extra assessment write for one matched worker (CSV multi-target). */
export interface ParticipationApplyExtraHit {
  activity_key: string;
  rating: number | null;
  binary_value: string | null;
  notes?: string | null;
}

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
      extra?: ParticipationApplyExtraHit[];
      /** Guarded Contact promotion when the mapped column matched. */
      promote_contact?: boolean;
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
      extra?: ParticipationApplyExtraHit[];
      promote_contact?: boolean;
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
  /**
   * Additional assessments written in the same CSV import. Each `key` is
   * referenced from `rows[].extra[].activity_key`. Ignored for AN API sync.
   */
  extra_activities?: Array<{
    key: string;
    activity: ParticipationApplyActivity;
  }>;
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
   * conflict_policy. Applies to the primary assessment only.
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
  /** Set on extra-assessment conflicts so the review table can show which mapping. */
  activity_label?: string | null;
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
  extra_ratings_to_create: number;
  extra_ratings_to_update: number;
  extra_conflicts: ParticipationConflict[];
  contacts_to_promote: number;
  contacts_already_leader: number;
}

export interface ParticipationApplyResult {
  success: true;
  dry_run: false;
  batch_id: number;
  activity_id: number;
  extra_activity_ids: number[];
  ratings_applied: number;
  extra_ratings_applied: number;
  rows_created: number;
  rows_updated: number;
  rows_skipped: number;
  workers_created: number;
  memberships_added: number;
  non_responders_marked: number;
  contacts_promoted: number;
  contacts_already_leader: number;
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
