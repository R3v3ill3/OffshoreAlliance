// WP1.3 — card numbers and the "last activity" line, pure.
//
// Every number on a My campaigns card is one `useCampaignsAllStats` already
// computes for `/campaigns`; this file only reshapes it for `CompactRatingsBar`
// and formats the timestamp `campaign_last_activity()` returns. Nothing here
// recomputes a count.

import { format } from "date-fns";
import type { CampaignAggStats, CampaignRatingBuckets } from "@/lib/hooks/useCampaignsAllStats";

export type LastActivityKind = "rating" | "call" | "sms" | "list_fire";

/** M1 — `CompactRatingsBar` wants `unrated`; the stats hook says `noRating`. */
export function toRatingBarBuckets(ratings: CampaignRatingBuckets): {
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  unrated: number;
} {
  return {
    r1: ratings.r1,
    r2: ratings.r2,
    r3: ratings.r3,
    r4: ratings.r4,
    unrated: ratings.noRating,
  };
}

/** M2 — "Rated" on the card: everyone with a cumulative rating. */
export function ratedCount(ratings: CampaignRatingBuckets): number {
  return ratings.r1 + ratings.r2 + ratings.r3 + ratings.r4;
}

/** M3 — the bar's denominator is the People number, so the two cannot disagree. */
export function ratingBarTotal(stats: Pick<CampaignAggStats, "namedWorkers">): number {
  return stats.namedWorkers;
}

/** F4 — plan 3.6 words only. */
const KIND_LABEL: Record<LastActivityKind, string> = {
  rating: "Rating",
  call: "Call",
  sms: "SMS",
  list_fire: "List fired",
};

export const NO_ACTIVITY_LABEL = "No activity yet";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function isLastActivityKind(value: unknown): value is LastActivityKind {
  return value === "rating" || value === "call" || value === "sms" || value === "list_fire";
}

/**
 * F1 null → "No activity yet". F2 unparseable or in the future → the same,
 * never a negative age. F3 <24h "today", <48h "yesterday", then "N days ago"
 * up to 30, then a dd MMM yyyy date. F4 the kind prefix.
 */
export function formatLastActivity(
  at: string | null,
  kind: LastActivityKind | null,
  now: number
): string {
  if (at == null || kind == null) return NO_ACTIVITY_LABEL;
  const ts = Date.parse(at);
  if (Number.isNaN(ts) || ts > now) return NO_ACTIVITY_LABEL;

  const age = now - ts;
  let when: string;
  if (age < DAY_MS) {
    when = "today";
  } else if (age < 2 * DAY_MS) {
    when = "yesterday";
  } else {
    const days = Math.floor(age / DAY_MS);
    when = days <= 30 ? `${days} days ago` : format(new Date(ts), "dd MMM yyyy");
  }
  return `${KIND_LABEL[kind]} ${when}`;
}
