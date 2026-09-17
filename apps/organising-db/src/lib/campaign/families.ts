/**
 * WP3.8 — campaign families and shared assessments, the pure module
 * (docs/organiser-ux-review/wp/wp3.8.md §3.5).
 *
 * One rule, mirrored from the database helper
 * `public.campaign_family_activity_ids(integer)`: a campaign may read and rate
 * the activities it owns, plus its parent's activities whose `scope` is
 * `family`. A parent never sees a child's. Ratings are never copied — a rating
 * recorded from a child lands on the parent's activity row (RAT-a).
 *
 * Pure: no React, no Supabase. The PostgREST readers of §3.5 build their
 * `.or()` clause with `familyActivityFilter`; the client-side partition and the
 * labels live here so every surface says the same thing.
 */

export type ActivityScope = "campaign" | "family";

export type FamilyActivityLike = {
  activity_id: number;
  campaign_id: number;
  scope?: ActivityScope | string | null;
};

/** The only value of `scope` that shares an activity with the owner's children. */
export const FAMILY_SCOPE: ActivityScope = "family";

/**
 * Normalises a campaign id for interpolation into a PostgREST filter string.
 * Throws on anything that is not a positive integer (the clause is
 * interpolated into a query string, so a stray value must never reach it).
 */
function toCampaignId(value: number | string, what: string): number {
  const n = typeof value === "string" ? (value.trim() === "" ? Number.NaN : Number(value)) : value;
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`families: ${what} must be a positive integer campaign id (got ${String(value)})`);
  }
  return n;
}

/** `null`/`undefined`/blank → no parent; otherwise a validated id. */
function toParentId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return toCampaignId(value, "parentId");
}

/**
 * PostgREST `.or()` clause for "owned by campaignId, or owned by parentId with
 * scope = family".
 *
 *   no parent  → `campaign_id.eq.<cid>`
 *   parent     → `campaign_id.eq.<cid>,and(campaign_id.eq.<pid>,scope.eq.family)`
 *
 * A parent equal to the campaign itself is treated as no parent (the trigger
 * never allows it; the plain clause is the safe answer). Throws on a
 * non-integer id.
 */
export function familyActivityFilter(
  campaignId: number | string,
  parentId: number | string | null | undefined
): string {
  const cid = toCampaignId(campaignId, "campaignId");
  const pid = toParentId(parentId);
  if (pid === null || pid === cid) return `campaign_id.eq.${cid}`;
  return `campaign_id.eq.${cid},and(campaign_id.eq.${pid},scope.eq.${FAMILY_SCOPE})`;
}

/** True when `activity` is owned by `campaignId`. */
export function isOwnedActivity(activity: FamilyActivityLike, campaignId: number | string): boolean {
  const cid = Number(campaignId);
  return Number.isInteger(cid) && activity.campaign_id === cid;
}

/**
 * True when `activity` is visible to `campaignId` as a shared (family)
 * activity of `parentId`: it is the parent's row and its scope is `family`.
 * Never true without a parent, and never when the campaign is its own parent.
 */
export function isFamilyActivity(
  activity: FamilyActivityLike,
  campaignId: number | string,
  parentId: number | string | null | undefined
): boolean {
  if (parentId === null || parentId === undefined) return false;
  const cid = Number(campaignId);
  const pid = Number(parentId);
  if (!Number.isInteger(cid) || !Number.isInteger(pid) || pid === cid) return false;
  return activity.campaign_id === pid && activity.scope === FAMILY_SCOPE;
}

/**
 * Owned first (input order), then family (input order); drops anything else —
 * a sibling's row, a grandparent's row, a `campaign`-scoped row of the parent.
 * The client-side mirror of `campaign_family_activity_ids()`.
 */
export function partitionFamilyActivities<T extends FamilyActivityLike>(
  rows: readonly T[],
  campaignId: number | string,
  parentId: number | string | null | undefined
): { owned: T[]; family: T[] } {
  const owned: T[] = [];
  const family: T[] = [];
  for (const row of rows) {
    if (isOwnedActivity(row, campaignId)) owned.push(row);
    else if (isFamilyActivity(row, campaignId, parentId)) family.push(row);
  }
  return { owned, family };
}

/** "Shared from Fugro" / "Shared from parent campaign" (wp3.8.md §3.7 terminology). */
export function familyLabel(parentName: string | null | undefined): string {
  const name = parentName?.trim();
  return name ? `Shared from ${name}` : "Shared from parent campaign";
}

/** "Shared with 1 campaign" / "Shared with 3 campaigns". */
export function sharedWithLabel(childCount: number): string {
  const n = Number.isFinite(childCount) && childCount > 0 ? Math.floor(childCount) : 0;
  return `Shared with ${n} ${n === 1 ? "campaign" : "campaigns"}`;
}

/**
 * The trigger's exception names (`campaigns_enforce_one_level()`, wp3.8.md
 * §3.1 item 5). PostgREST carries the name in `message` and the SQLSTATE in
 * `code` (`23514` check_violation, `42501` for SET-a).
 */
export const FAMILY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  campaign_family_self: "A campaign cannot be part of itself.",
  campaign_family_child_has_children:
    "A campaign that has child campaigns cannot itself be part of another campaign (one level).",
  campaign_family_parent_has_parent: "The chosen parent is itself part of a campaign (one level).",
  campaign_family_parent_kind:
    "That campaign cannot be a parent: it is an SMS episode, the standing campaign or archived — and a campaign with child campaigns cannot become an SMS episode or the standing campaign.",
  campaign_family_child_kind: "An SMS episode or the standing campaign cannot be part of a family.",
  campaign_family_parent_not_writable:
    "You need write access to the parent campaign to make this campaign part of it.",
};

const FAMILY_ERROR_TOKEN = /campaign_family_[a-z_]+/u;

/**
 * Maps a `campaign_family_*` refusal to the sentence an organiser sees; the
 * CHECK constraint's own refusal (`campaigns_parent_not_self`, SQLSTATE
 * 23514) reads as the self case. Anything else passes `message` through
 * unchanged, so a failed save still surfaces the database's own words.
 */
export function familyErrorMessage(code: string | null | undefined, message: string): string {
  const haystack = `${code ?? ""} ${message ?? ""}`;
  const token = FAMILY_ERROR_TOKEN.exec(haystack)?.[0];
  if (token && FAMILY_ERROR_MESSAGES[token]) return FAMILY_ERROR_MESSAGES[token];
  if (haystack.includes("campaigns_parent_not_self")) return FAMILY_ERROR_MESSAGES.campaign_family_self;
  return message;
}
