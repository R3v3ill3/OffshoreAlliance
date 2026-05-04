import type { CampaignActivityTemplateKey } from "@/types/database";

export const ACTIVITY_TEMPLATE_OPTIONS: {
  key: CampaignActivityTemplateKey;
  label: string;
  defaultBinary?: boolean;
}[] = [
  { key: "respond_email", label: "Respond to email" },
  { key: "respond_sms", label: "Respond to SMS" },
  { key: "respond_phone", label: "Respond to phone call" },
  { key: "complete_survey", label: "Complete survey" },
  { key: "sign_petition", label: "Sign petition" },
  { key: "vote", label: "Vote", defaultBinary: true },
  { key: "attend_video_meeting", label: "Attend video meeting" },
  { key: "attend_worksite_meeting", label: "Attend worksite meeting" },
  { key: "attend_offsite_meeting", label: "Attend offsite meeting" },
  { key: "industrial_activity", label: "Participate in industrial activity" },
  { key: "visibility_action", label: "Visibility action" },
];

export const VOTE_SUPPORTER_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "abstain", label: "Abstained" },
] as const;

export const CAMPAIGN_SCOPE_LABELS: Record<string, string> = {
  single_employer_single_site: "Single employer, single site",
  single_employer_multi_site: "Single employer, multiple sites",
  multi_employer_single_site: "Multiple employers, single site",
  multi_employer_multi_site: "Multiple employers, multiple sites",
};

export const EA_SUBTYPE_LABELS: Record<string, string> = {
  new: "Enterprise Agreement — new",
  replacement: "Enterprise Agreement — replacement",
  boss_initiated: "Enterprise Agreement — employer initiated",
};

/** Union membership categories that count as members for density / delegate eligibility. */
export const UNION_MEMBER_LIKE_TYPE_NAMES = new Set([
  "financial_member",
  "non_oa_member",
  "member_pending",
]);

/** Collapsed campaign list / filter bucket (list-builder, wizards, assign dialogs). */
export type CampaignMembershipStatus =
  | "member"
  | "member_pending"
  | "non_member";

/**
 * Distinct filter bucket for organisers: pending is its own slice even though
 * `isWorkerMemberLike` is true for `member_pending` union type.
 */
export function getCampaignMembershipStatus(args: {
  unionMembershipTypeName: string | null | undefined;
  memberRoleName: string | null | undefined;
  isBargainingRep?: boolean | null;
}): CampaignMembershipStatus {
  const u = args.unionMembershipTypeName;
  if (u === "member_pending") return "member_pending";
  if (isWorkerMemberLike(args)) return "member";
  return "non_member";
}

/** Activism/leadership roles that imply member-like status for OA delegate eligibility. */
export const MEMBER_LIKE_ROLE_NAMES = new Set(["delegate"]);

export function isWorkerMemberLike(args: {
  unionMembershipTypeName: string | null | undefined;
  memberRoleName: string | null | undefined;
  isBargainingRep?: boolean | null;
}): boolean {
  const u = args.unionMembershipTypeName;
  if (u && UNION_MEMBER_LIKE_TYPE_NAMES.has(u)) return true;
  const r = args.memberRoleName;
  if (r && MEMBER_LIKE_ROLE_NAMES.has(r)) return true;
  if (args.isBargainingRep) return true;
  return false;
}

/**
 * Display-only default cumulative for wall chart cell colour when there is no stored rating.
 * Default 1 for workers with any leadership role (contact/activist/delegate) or bargaining rep.
 * Default 2 for union members without a leadership role. HSR alone does not affect rating.
 */
export function getWallChartDefaultCumulative(args: {
  unionMembershipTypeName: string | null | undefined;
  memberRoleName: string | null | undefined;
  isBargainingRep?: boolean | null;
}): 1 | 2 | null {
  const r = args.memberRoleName;
  if (r === "contact" || r === "Activist" || r === "delegate") return 1;
  if (args.isBargainingRep) return 1;

  const u = args.unionMembershipTypeName;
  if (u && UNION_MEMBER_LIKE_TYPE_NAMES.has(u)) return 2;

  return null;
}
