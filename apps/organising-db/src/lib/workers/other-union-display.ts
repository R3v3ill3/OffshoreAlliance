export type WorkerUnionBadgeInput = {
  unionMembershipTypeName: string | null | undefined;
  nonOaBadgeInitials?: string | null | undefined;
  nonOaDisplayName?: string | null | undefined;
};

export function isNonOaMembershipType(typeName: string | null | undefined): boolean {
  return typeName === "non_oa_member";
}

/** True when a compact union-initial badge should render (tracked other union only). */
export function shouldShowOtherUnionBadge(worker: WorkerUnionBadgeInput): boolean {
  return isNonOaMembershipType(worker.unionMembershipTypeName ?? null) && !!worker.nonOaBadgeInitials?.trim();
}

export function otherUnionBadgeShortCode(worker: WorkerUnionBadgeInput): string | null {
  const raw = worker.nonOaBadgeInitials?.trim();
  if (!isNonOaMembershipType(worker.unionMembershipTypeName ?? null) || !raw) return null;
  return raw;
}

/** Tooltip / full-line label including display name when available. */
export function otherUnionLabel(worker: WorkerUnionBadgeInput): string | null {
  const shortCode = otherUnionBadgeShortCode(worker);
  if (!shortCode) return null;
  const dn = worker.nonOaDisplayName?.trim();
  return dn ? `${shortCode}: ${dn}` : shortCode;
}

export type NonOaUnionCountEntry = {
  initials: string;
  count: number;
};

function normalizeRelation<T extends object>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

type WorkerSubsetRow = {
  union_membership_type?: { type_name: string | null } | null;
  non_oa_union_option?: { badge_initials: string | null } | null;
};

/**
 * Counts non‑OA workers in `workerSubset` who have `non_oa_union_option` set (badge only).
 * Sorted by initials; omits counts of 0 before return — caller renders only when `.length > 0`.
 */
export function countNonOaUnionsAmongWorkers(
  workerSubset: ReadonlySet<number>,
  campaignMembers: { worker_id: number; worker: unknown }[]
): NonOaUnionCountEntry[] {
  const tallies = new Map<string, number>();
  for (const m of campaignMembers) {
    if (!workerSubset.has(m.worker_id)) continue;
    const raw = normalizeRelation(m.worker as WorkerSubsetRow | null);
    if (!raw) continue;
    const umt = normalizeRelation(raw.union_membership_type ?? null);
    const nauo = normalizeRelation(raw.non_oa_union_option ?? null);
    if (umt?.type_name !== "non_oa_member") continue;
    const initials = nauo?.badge_initials?.trim();
    if (!initials) continue;
    tallies.set(initials, (tallies.get(initials) ?? 0) + 1);
  }
  return [...tallies.entries()]
    .map(([initials, count]) => ({ initials, count }))
    .filter((e) => e.count > 0)
    .sort((a, b) => a.initials.localeCompare(b.initials));
}

/** Normalises badge initials for case-insensitive / unicode-dash tolerant lookup vs `badge_initials`. */
export function normaliseNonOaBadgeKey(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, "");
}

export function lookupNonOaUnionOptionId(
  badgeInput: string | null | undefined,
  catalogue: { non_oa_union_option_id: number; badge_initials: string }[]
): number | null {
  const raw = badgeInput?.trim();
  if (!raw) return null;
  const want = normaliseNonOaBadgeKey(raw);
  for (const row of catalogue) {
    if (normaliseNonOaBadgeKey(row.badge_initials) === want) {
      return row.non_oa_union_option_id;
    }
  }
  return null;
}
