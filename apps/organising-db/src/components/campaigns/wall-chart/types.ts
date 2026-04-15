// Shared types for the wall chart subcomponents.

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
  member_role_type_id: number | null;
  is_bargaining_rep: boolean | null;
  is_hsr: boolean | null;
  union_membership_type_id: number | null;
  canonical_occupation_id: number | null;
  member_role_type: { role_name: string; role_type_id: number; display_name: string } | null;
  union_membership_type: { type_name: string; display_name?: string | null } | null;
  canonical_occupation: { occupation_id: number; canonical_name: string } | null;
};

export type WallChartRatingSummary = {
  worker_id: number;
  cumulative_rating: number | null;
  last_activity_rating: number | null;
};

export type WallChartOU = {
  ou_id: number;
  campaign_id: number;
  name: string | null;
  ou_type: string | null;
  total_workers_estimated: number | null;
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
