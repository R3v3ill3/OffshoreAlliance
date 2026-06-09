// Shared types for the wall chart subcomponents.

import type { CampaignOuUnitBasis } from "@/types/organising-row-types";

/** Worker detail sheet Details-tab focus target (phone/email fields). */
export type WallChartWorkerContactFocusField = "phone" | "email";

export type WallChartMemberRow = {
  membership_id: number;
  worker_id: number;
  worker: WallChartWorker | null;
};

export type WallChartWorker = {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  member_role_type_id: number | null;
  is_bargaining_rep: boolean | null;
  is_hsr: boolean | null;
  union_membership_type_id: number | null;
  non_oa_union_option_id: number | null;
  canonical_occupation_id: number | null;
  employer_id: number | null;
  worksite_id: number | null;
  member_role_type: { role_name: string; role_type_id: number; display_name: string } | null;
  union_membership_type: { type_name: string; display_name?: string | null } | null;
  non_oa_union_option: {
    non_oa_union_option_id: number;
    badge_initials: string;
    display_name: string;
  } | null;
  canonical_occupation: { occupation_id: number; canonical_name: string } | null;
  employer: { employer_id: number; employer_name: string } | null;
  worksite: { worksite_id: number; worksite_name: string } | null;
};

export type WallChartRatingSummary = {
  worker_id: number;
  cumulative_rating: number | null;
  last_activity_rating: number | null;
  /** True when the worker has ≥1 supportive (numeric 1|2 or matching binary) rating in this campaign. */
  has_supportive_activity_rating: boolean;
  /** Distinct activities on which the worker has ≥1 supportive rating. */
  supportive_activity_count: number;
};

/**
 * Channels a worker can have list membership on within a campaign. Mirrors
 * `vw_campaign_worker_list_activity.channel`. `sms` has no list table yet, so
 * it is always empty until an SMS-list feature lands.
 */
export type ListActivityChannel = "phone" | "email" | "task" | "sms";

/** Ordered set of channels, used for the badge selector + tile rendering. */
export const LIST_ACTIVITY_CHANNELS: readonly ListActivityChannel[] = [
  "phone",
  "email",
  "task",
  "sms",
] as const;

/** Short, user-facing label per channel (badge selector + detail tab). */
export const LIST_ACTIVITY_CHANNEL_LABELS: Record<ListActivityChannel, string> = {
  phone: "Phone",
  email: "Email",
  task: "Activist list",
  sms: "SMS",
};

/** One row of the worker list-activity view (a single worker on a single list). */
export type WorkerListActivityRow = {
  channel: ListActivityChannel;
  campaign_id: number;
  worker_id: number;
  list_id: number;
  list_name: string | null;
  list_status: string | null;
  item_status: string | null;
  added_at: string | null;
};

/** Source of tile colouring + unit summary metrics on the wall chart. */
export type AssessmentSelection =
  | { kind: "cumulative" }
  | {
      kind: "assessment";
      activityId: number;
      title: string;
      isBinary: boolean;
      /** The binary_value that counts as a supportive outcome (e.g. 'attended', 'yes'). */
      supporterOutcomeValue: string | null;
      /** Per-level label overrides for the 1–5 scale. Keys "1"–"5". */
      ratingLabels: Record<string, string> | null;
    };

/** A single worker's rating for a specific activity, collapsed to one row. */
export type ActivityRating = {
  rating_id: number;
  worker_id: number;
  activity_id: number;
  rating: number | null;
  binary_value: string | null;
  rating_phase: string | null;
  rated_at: string | null;
  source: string | null;
  notes: string | null;
};

/** Assessment activity shown in the selector dropdown. */
export type WallChartAssessmentOption = {
  activity_id: number;
  title: string;
  is_binary: boolean;
  supporter_outcome_value: string | null;
  last_rated_at: string | null;
  created_at: string | null;
  /** False when the activity has no rows in activity_ambitions (plan link). */
  has_linked_ambition: boolean;
  /** Per-level label overrides for the 1–5 scale. Keys "1"–"5". */
  rating_labels: Record<string, string> | null;
};

export type WallChartOU = {
  ou_id: number;
  campaign_id: number;
  name: string | null;
  ou_type: string | null;
  total_workers_estimated: number | null;
  display_order?: number;
  /** Optional filter metadata when unit was derived from employer/worksite/occupation/etc. */
  unit_basis?: CampaignOuUnitBasis | null;
  /** True when this OU is a group-container header. Workers cannot be assigned directly to it. */
  is_group_container?: boolean;
  /** FK to the group container OU that owns this member unit. Null for standalone units. */
  ou_group_id?: number | null;
  parent_ou_id?: number | null;
};

export type WallChartOUAssignment = {
  ou_id: number;
  worker_id: number;
  is_primary: boolean | null;
};

export type WallChartRoleType = {
  role_type_id: number;
  role_name: string;
  display_name: string;
};

/** Friendly label for an OU type code. */
export function humanizeOuType(ouType: string | null | undefined): string {
  if (!ouType) return "Unit";
  const map: Record<string, string> = {
    shift: "Shift",
    department: "Department",
    network: "Network",
    job_type: "Job type",
    worksite: "Worksite",
    employer: "Employer",
    ethnic_community: "Community",
    crew_rotation: "Crew rotation",
    accommodation: "Accommodation",
    work_area: "Work area",
    custom: "Unit",
  };
  return map[ouType] ?? ouType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolves a display name for an OU, falling back when name is null/blank. */
export function ouDisplayName(ou: { name: string | null; ou_type: string | null; ou_id: number }): string {
  const trimmed = ou.name?.trim();
  if (trimmed) return trimmed;
  return `${humanizeOuType(ou.ou_type)} #${ou.ou_id}`;
}
