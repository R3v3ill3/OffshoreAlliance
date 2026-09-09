/**
 * The classes organiser mode's campaign heading wears — WP1.4 fix round 2.
 *
 * Two components render that heading: `CampaignSwitcher`'s collapsed branch
 * (the real one) and the Suspense fallback `CampaignDetailHeaderBar` shows
 * while the switcher's chunk is in flight. They must look identical, so the
 * string lives in its own module: importing it costs the header bar nothing
 * — no Popover, no cmdk — and the switcher stays lazily loaded.
 */
export const SWITCHER_HEADING_CLASS = "min-w-0 truncate text-base font-semibold md:text-lg";
