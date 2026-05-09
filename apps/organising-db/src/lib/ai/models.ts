/**
 * Centralised AI model constants — Phase I.
 *
 * All server-side Anthropic calls in this app should import from here
 * rather than inlining the model string. This makes version bumps a
 * single-line change.
 */

/** General-purpose Anthropic model used across email/SMS/SOC/report routes. */
export const AI_MODEL = 'claude-sonnet-4-20250514' as const

/** Model used specifically for phone-script generation and CTA translation. */
export const PHONE_SCRIPT_MODEL = 'claude-sonnet-4-20250514' as const
