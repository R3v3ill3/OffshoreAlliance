/**
 * Organiser-UX telemetry (WP0.2).
 *
 * One event-name union, one `track()`, and one typed wrapper per event, so the
 * phase-0 navigation/wall-chart baseline is defined in a single place.
 *
 * The shape deliberately mirrors `src/lib/phone/telemetry.ts` so there is one
 * telemetry idiom in this codebase rather than two. Every function:
 *  - is safe to call from the server (no-ops if `window` is undefined)
 *  - is safe to call before PostHog has booted (initialises on first call)
 *  - is safe to call when PostHog is disabled (no-ops)
 *  - never throws — telemetry must never break a wall-chart handler
 *
 * PRIVACY RULE — read this before adding a property.
 * No event property may carry a worker's name, phone number, email address,
 * address, notes, or any free text a worker or organiser typed. Every property
 * is an integer id, an enum drawn from a closed union, a boolean, a count, or a
 * duration in milliseconds. In particular `wallchart_first_interaction` carries
 * `campaign_id` but *no* `worker_id`, and `wallchart_filter_applied` carries
 * filter *key names* ("occupations") and a count, never the selected occupation
 * ids or membership-type ids — those are small-cardinality values that can
 * re-identify a worker when combined with `campaign_id`.
 *
 * This is why the wrappers below take closed object types rather than
 * `Record<string, unknown>`, and why the builders are exported separately: the
 * rule is asserted executably in `__tests__/events.test.ts`.
 */

import posthog from "posthog-js";
import { initPostHogIfNeeded } from "@/lib/posthog-client";
import { isPostHogEnabled } from "@/lib/posthog-config";

export type OrganiserUxEvent =
  | "campaign_tab_opened"
  | "wallchart_group_selected"
  | "wallchart_filter_applied"
  | "wallchart_first_interaction";

/**
 * Allowed property value shapes. Widened from `phone/telemetry.ts` by
 * `string[]` only, for `filter_keys` (a list of closed-union key names).
 */
export type EventProps = Record<
  string,
  string | number | boolean | null | undefined | string[]
>;

/** Every event from this module carries `surface: "organiser_ux"`. */
export const ORGANISER_UX_SURFACE = "organiser_ux";

/** Where the login timestamp came from. See `session-timing.ts`. */
export type LoginSource = "login_form" | "session_restored";

/** `login_source` as it travels on the event (no stamp → "unknown"). */
export type LoginSourceProp = LoginSource | "unknown";

/** The wall-chart gesture that counted as the organiser's first interaction. */
export type Interaction = "tile_click" | "drag" | "rating" | "filter";

export function track(event: OrganiserUxEvent, props: EventProps = {}): void {
  if (typeof window === "undefined") return;
  if (!isPostHogEnabled()) return;
  try {
    initPostHogIfNeeded();
    posthog.capture(event, {
      surface: ORGANISER_UX_SURFACE,
      ...props,
    });
  } catch {
    /* never throw from telemetry */
  }
}

// ---------------------------------------------------------------------------
// campaign_tab_opened
// ---------------------------------------------------------------------------

export type CampaignTabOpenedProps = {
  campaign_id: number;
  tab: string;
  sub: string | null;
};

export function buildCampaignTabOpenedProps(p: {
  campaign_id: number;
  tab: string;
  sub?: string | null;
}): CampaignTabOpenedProps {
  return {
    campaign_id: p.campaign_id,
    tab: p.tab,
    sub: p.sub ?? null,
  };
}

export function trackCampaignTabOpened(p: {
  campaign_id: number;
  tab: string;
  sub?: string | null;
}): void {
  track("campaign_tab_opened", buildCampaignTabOpenedProps(p));
}

/**
 * The de-duplication key for one resolved tab open.
 *
 * `campaign_tab_opened` is emitted from an effect keyed on the *raw* URL params
 * (`?tab=`/`?sub=`), so it re-runs after the campaign page's legacy redirect
 * rewrites the URL. The redirect does not change the *resolved* pair, so the
 * pre- and post-redirect renders produce the same key here and the caller can
 * emit exactly once by comparing against the last key it emitted.
 *
 * `sub` is normalised so `null` and `undefined` cannot key differently.
 */
export function tabOpenKey(
  campaignId: number,
  tab: string,
  sub: string | null | undefined
): string {
  return `${campaignId}|${tab}|${sub ?? ""}`;
}

// ---------------------------------------------------------------------------
// wallchart_group_selected
// ---------------------------------------------------------------------------

/** Which group control produced the event. Phase 0 has exactly one. */
export type GroupSelectionControl = "assessment_charts_ou_type";

export type WallchartGroupSelectedProps = {
  campaign_id: number;
  ou_type: string | null;
  previous_ou_type: string | null;
  group_count: number;
  control: GroupSelectionControl;
};

export function buildWallchartGroupSelectedProps(p: {
  campaign_id: number;
  ou_type: string | null;
  previous_ou_type: string | null;
  group_count: number;
  control: GroupSelectionControl;
}): WallchartGroupSelectedProps {
  return {
    campaign_id: p.campaign_id,
    ou_type: p.ou_type,
    previous_ou_type: p.previous_ou_type,
    group_count: p.group_count,
    control: p.control,
  };
}

export function trackWallchartGroupSelected(p: {
  campaign_id: number;
  ou_type: string | null;
  previous_ou_type: string | null;
  group_count: number;
  control: GroupSelectionControl;
}): void {
  track("wallchart_group_selected", buildWallchartGroupSelectedProps(p));
}

// ---------------------------------------------------------------------------
// wallchart_filter_applied
// ---------------------------------------------------------------------------

/** Which filter bar produced the event. */
export type FilterScope = "unit" | "unassigned" | "all";

export type WallchartFilterAppliedProps = {
  campaign_id: number;
  scope: FilterScope;
  /** Closed-union dimension names only — never the selected ids. */
  filter_keys: string[];
  filter_count: number;
  sort_key: string;
};

export function buildWallchartFilterAppliedProps(p: {
  campaign_id: number;
  scope: FilterScope;
  filter_keys: readonly string[];
  sort_key: string;
}): WallchartFilterAppliedProps {
  const keys = [...p.filter_keys];
  return {
    campaign_id: p.campaign_id,
    scope: p.scope,
    filter_keys: keys,
    // Derived, never passed in, so the count can never disagree with the list.
    filter_count: keys.length,
    sort_key: p.sort_key,
  };
}

export function trackWallchartFilterApplied(p: {
  campaign_id: number;
  scope: FilterScope;
  filter_keys: readonly string[];
  sort_key: string;
}): void {
  track("wallchart_filter_applied", buildWallchartFilterAppliedProps(p));
}

// ---------------------------------------------------------------------------
// wallchart_first_interaction
// ---------------------------------------------------------------------------

export type WallchartFirstInteractionProps = {
  campaign_id: number;
  /** null when there is no usable login stamp (see `msSinceLogin`). */
  ms_since_login: number | null;
  interaction: Interaction;
  login_source: LoginSourceProp;
};

export function buildWallchartFirstInteractionProps(
  p: WallchartFirstInteractionProps
): WallchartFirstInteractionProps {
  return {
    campaign_id: p.campaign_id,
    ms_since_login: p.ms_since_login,
    interaction: p.interaction,
    login_source: p.login_source,
  };
}

export function trackWallchartFirstInteraction(
  p: WallchartFirstInteractionProps
): void {
  track("wallchart_first_interaction", buildWallchartFirstInteractionProps(p));
}
