/** Pure membership parsing shared by worker-import parse route and import wizard UI. */

export type UnionMembershipTypeKey =
  | "financial_member"
  | "non_oa_member"
  | "non_member"
  | "resigned_member"
  | "member_pending";

// Union code → union_id (matches DB)
export const UNION_CODE_TO_ID: Record<string, number> = {
  AWU: 1,
  MUA: 2,
  AMOU: 3,
  AIMPE: 4,
  CFMEU: 5,
  AMWU: 6,
};

type MembershipPatternRule = {
  pattern: RegExp;
  membershipKey: UnionMembershipTypeKey;
  unionCode?: keyof typeof UNION_CODE_TO_ID;
  /** When membership is non_oa_member, catalogue badge_initials lookup */
  nonOaBadgeInitials?: string;
};

const MEMBERSHIP_PATTERNS: MembershipPatternRule[] = [
  {
    pattern: /financial\s+awu\s+member/i,
    membershipKey: "non_oa_member",
    unionCode: "AWU",
    nonOaBadgeInitials: "AWU-D",
  },
  {
    pattern: /financial\s+mua\s+member/i,
    membershipKey: "non_oa_member",
    unionCode: "MUA",
    nonOaBadgeInitials: "MUA",
  },
  {
    pattern: /financial\s+cfmeu\s+member/i,
    membershipKey: "non_oa_member",
    unionCode: "CFMEU",
    nonOaBadgeInitials: "CFMEU",
  },
  {
    pattern: /financial\s+amwu\s+member/i,
    membershipKey: "non_oa_member",
    unionCode: "AMWU",
    nonOaBadgeInitials: "AMWU",
  },
  {
    pattern: /financial\s+amou\s+member/i,
    membershipKey: "non_oa_member",
    unionCode: "AMOU",
    nonOaBadgeInitials: "OTHER",
  },
  {
    pattern: /financial\s+aimpe\s+member/i,
    membershipKey: "non_oa_member",
    unionCode: "AIMPE",
    nonOaBadgeInitials: "OTHER",
  },
  {
    pattern: /member[\s_-]+pending|pending[\s_-]+member|member\s*[–-]\s*pending/i,
    membershipKey: "member_pending",
  },
  { pattern: /financial\s+member/i, membershipKey: "financial_member" },
  { pattern: /\bmember\b/i, membershipKey: "financial_member" },
  { pattern: /not\s+a\s+member/i, membershipKey: "non_member" },
  { pattern: /awu\s+membership\s+archived/i, membershipKey: "resigned_member", unionCode: "AWU" },
  { pattern: /membership\s+archived/i, membershipKey: "resigned_member" },
  { pattern: /membership\s+resigned/i, membershipKey: "resigned_member" },
  { pattern: /resigned/i, membershipKey: "resigned_member" },
  { pattern: /archived/i, membershipKey: "resigned_member" },
];

export function parseMembershipStatus(raw: string): {
  membershipKey: UnionMembershipTypeKey | null;
  unionId: number | null;
  resignationDate: string | null;
  nonOaUnionBadgeInitials: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      membershipKey: null,
      unionId: null,
      resignationDate: null,
      nonOaUnionBadgeInitials: null,
    };
  }

  let membershipKey: UnionMembershipTypeKey | null = null;
  let unionId: number | null = null;
  let nonOaUnionBadgeInitials: string | null = null;

  for (const rule of MEMBERSHIP_PATTERNS) {
    if (rule.pattern.test(trimmed)) {
      membershipKey = rule.membershipKey;
      if (rule.unionCode) unionId = UNION_CODE_TO_ID[rule.unionCode] ?? null;
      if (rule.membershipKey === "non_oa_member") {
        nonOaUnionBadgeInitials = rule.nonOaBadgeInitials ?? null;
      }
      break;
    }
  }

  let resignationDate: string | null = null;
  if (membershipKey === "resigned_member") {
    const dateMatch = trimmed.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      const d = new Date(`${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
      if (!isNaN(d.getTime())) {
        resignationDate = d.toISOString().split("T")[0];
      }
    }
  }

  return { membershipKey, unionId, resignationDate, nonOaUnionBadgeInitials };
}
