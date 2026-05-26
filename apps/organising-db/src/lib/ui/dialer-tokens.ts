/**
 * Dialer design tokens.
 *
 * Both the desktop call tracker (`components/phone/CallSessionPage`) and
 * the mobile-first shareable dialer (`components/phone/mobile/*`) share
 * these tokens so the two surfaces feel like the same product.
 *
 * Token values are expressed as Tailwind utility class strings so the
 * design language is enforced through className composition, not ad-hoc
 * inline styles. Components import the named token they need (`tokens.callButton`)
 * rather than constructing class strings themselves.
 *
 * The mobile dialer enforces:
 *  - Minimum 44px tap targets (iOS HIG) / 48dp (Material) on primary actions
 *  - Bottom 60% of viewport reserved for primary actions (thumb zone)
 *  - High contrast colour pairs (WCAG AA 4.5:1 for text, 3:1 for large)
 *  - Type ramp scaled for outdoor/dim use (no smaller than 14px body)
 */

import { outcomeSentiment, type OutcomeClassification, type OutcomeSentiment } from "@/lib/phone/outcome-model";

/** Tailwind class collections grouped by purpose. */
export const tokens = {
  /** Layout containers. */
  layout: {
    /** Mobile screen shell; full viewport with safe-area padding. */
    mobileScreen: "flex min-h-[100dvh] flex-col bg-background pb-[max(env(safe-area-inset-bottom),1rem)] pt-[max(env(safe-area-inset-top),0.5rem)]",
    /** Thumb-zone action bar pinned to the bottom of the viewport. */
    mobileActionBar: "sticky bottom-0 z-30 mt-auto flex w-full flex-col gap-2 border-t bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 backdrop-blur",
    /** Card surface used for between-call screens. */
    mobileCard: "rounded-2xl border bg-card text-card-foreground shadow-sm",
  },

  /** Type ramp — minimum 14px body, generous line-height. */
  type: {
    hero: "text-2xl font-semibold tracking-tight leading-tight",
    title: "text-lg font-semibold leading-snug",
    body: "text-sm leading-relaxed",
    caption: "text-xs uppercase tracking-wide text-muted-foreground",
    numeric: "tabular-nums",
  },

  /** Primary action buttons sized for thumb tap. */
  buttons: {
    /**
     * Oversized call button anchored at the bottom of the contact card.
     * Green, 64px tall, full width with rounded-full pill shape.
     */
    callPrimary:
      "inline-flex h-16 w-full items-center justify-center gap-2 rounded-full bg-green-600 px-6 text-base font-semibold text-white shadow-lg shadow-green-600/30 transition active:scale-[0.99] hover:bg-green-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-300 disabled:opacity-50",
    /** Standard primary action — Save & Next, Continue. */
    actionPrimary:
      "inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground shadow transition active:scale-[0.99] hover:opacity-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-50",
    /** Secondary action — Skip, Defer, Hand back. */
    actionSecondary:
      "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border bg-background px-5 text-sm font-medium text-foreground transition active:scale-[0.99] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    /** Outcome chip in a wheel or row. */
    chip:
      "inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border bg-background px-4 text-sm font-medium transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    chipSelected:
      "inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground shadow",
  },

  /** Outcome / sentiment colours. Used by chips, badges, summary cards. */
  sentiment: {
    positive: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200",
    neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    negative: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
    operational: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  } satisfies Record<OutcomeSentiment, string>,

  /** Status / lifecycle indicators. */
  status: {
    idle: "bg-slate-100 text-slate-700",
    ringing: "bg-blue-100 text-blue-700",
    connected: "bg-green-100 text-green-700",
    completing: "bg-purple-100 text-purple-700",
  },
} as const;

/** Convenience helper for outcome-sentiment colour pair. */
export function outcomeSentimentClass(classification: OutcomeClassification): string {
  return tokens.sentiment[outcomeSentiment(classification)];
}
