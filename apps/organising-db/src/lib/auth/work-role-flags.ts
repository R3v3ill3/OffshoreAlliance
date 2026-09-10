import type { UserProfile, WorkRole } from "@/types/organising-row-types";

/**
 * work_role values the database treats as "lead or above" — the work_role arm
 * of is_coordinator_or_lead() (baseline B:3692-3704). Shared by the auth
 * context and by server routes so there is exactly one definition (WP1.6).
 */
export const LEAD_WORK_ROLES: readonly WorkRole[] = [
  "lead_organiser",
  "coordinator",
  "industrial_coordinator",
] as const;

export type WorkRoleFlags = {
  /**
   * work_role is lead_organiser, coordinator or industrial_coordinator.
   * Mirrors is_coordinator_or_lead() minus its role='admin' arm, which callers
   * combine with isAdmin themselves. coordinator and industrial_coordinator
   * count on purpose: the flag answers "may this account act as a lead?", and
   * that is the database's answer.
   */
  isLeadOrganiser: boolean;
  /** Any organiser-shaped work_role, lead included — the audience for organiser mode (WP1.1). */
  isOrganiser: boolean;
};

export function deriveWorkRoleFlags(
  profile: Pick<UserProfile, "work_role"> | null | undefined
): WorkRoleFlags {
  const workRole = profile?.work_role ?? null;
  const isLead = workRole != null && LEAD_WORK_ROLES.includes(workRole);
  return {
    isLeadOrganiser: isLead,
    isOrganiser: workRole === "organiser" || isLead,
  };
}
