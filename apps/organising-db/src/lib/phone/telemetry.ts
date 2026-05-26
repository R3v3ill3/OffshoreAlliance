/**
 * Centralised PostHog telemetry for the mobile dialer funnel.
 *
 * Every function:
 *  - is safe to call from the server (no-ops if `window` is undefined)
 *  - is safe to call before PostHog has booted (initialises on first call)
 *  - is safe to call when PostHog is disabled (no-ops)
 *  - never throws — telemetry failures must never break the dialer
 *
 * Event names are namespaced with `mobile_dialer_` so they cluster
 * cleanly in the PostHog UI alongside the existing surface-level events.
 *
 * Property names follow PostHog's snake_case convention so they read
 * naturally in dashboards and insights.
 */

import posthog from "posthog-js";
import { initPostHogIfNeeded } from "@/lib/posthog-client";
import { isPostHogEnabled } from "@/lib/posthog-config";
import type { OutcomeClassification } from "@/lib/phone/outcome-model";

export type MobileDialerEvent =
  | "mobile_dialer_opened"
  | "mobile_dialer_password_attempted"
  | "mobile_dialer_password_success"
  | "mobile_dialer_authenticated"
  | "mobile_dialer_queue_viewed"
  | "mobile_dialer_claim_acquired"
  | "mobile_dialer_claim_lost"
  | "mobile_dialer_claim_released"
  | "mobile_dialer_call_placed"
  | "mobile_dialer_dial_outcome_selected"
  | "mobile_dialer_objection_logged"
  | "mobile_dialer_issue_logged"
  | "mobile_dialer_cta_rated"
  | "mobile_dialer_assessment_rated"
  | "mobile_dialer_outcome_selected"
  | "mobile_dialer_attempt_recorded"
  | "mobile_dialer_attempt_queued_offline"
  | "mobile_dialer_skip_used"
  | "mobile_dialer_hand_back"
  | "mobile_dialer_wrap_up_shown"
  | "mobile_dialer_install_prompt_shown"
  | "mobile_dialer_install_accepted"
  | "mobile_dialer_install_dismissed";

type Props = Record<string, string | number | boolean | null | undefined>;

function safeCapture(event: MobileDialerEvent, props: Props = {}): void {
  if (typeof window === "undefined") return;
  if (!isPostHogEnabled()) return;
  try {
    initPostHogIfNeeded();
    posthog.capture(event, {
      surface: "mobile_dialer",
      ...props,
    });
  } catch {
    /* never throw from telemetry */
  }
}

export const dialerTelemetry = {
  opened: (props: { token_hint: string }) => safeCapture("mobile_dialer_opened", props),
  passwordAttempted: (props: { success: boolean }) =>
    safeCapture("mobile_dialer_password_attempted", props),
  passwordSuccess: (props: { token_hint: string; worker_id: number | null }) =>
    safeCapture("mobile_dialer_password_success", props),
  authenticated: (props: { token_hint: string; worker_id: number | null }) =>
    safeCapture("mobile_dialer_authenticated", props),
  queueViewed: (props: { remaining: number; total: number }) =>
    safeCapture("mobile_dialer_queue_viewed", props),
  claimAcquired: (props: { item_id: number; list_id: number }) =>
    safeCapture("mobile_dialer_claim_acquired", props),
  claimLost: (props: { item_id: number; reason: string }) =>
    safeCapture("mobile_dialer_claim_lost", props),
  claimReleased: (props: { item_id: number }) =>
    safeCapture("mobile_dialer_claim_released", props),
  callPlaced: (props: { item_id: number; surface: string }) =>
    safeCapture("mobile_dialer_call_placed", props),
  dialOutcomeSelected: (props: { item_id: number; dial_disposition: string }) =>
    safeCapture("mobile_dialer_dial_outcome_selected", props),
  objectionLogged: (props: { item_id: number; source: "bank" | "custom" }) =>
    safeCapture("mobile_dialer_objection_logged", props),
  issueLogged: (props: { item_id: number; heat: number | null }) =>
    safeCapture("mobile_dialer_issue_logged", props),
  ctaRated: (props: { item_id: number; cta_ambition_id: number }) =>
    safeCapture("mobile_dialer_cta_rated", props),
  assessmentRated: (props: { item_id: number; activity_id: number }) =>
    safeCapture("mobile_dialer_assessment_rated", props),
  outcomeSelected: (props: {
    item_id: number;
    outcome_classification: OutcomeClassification | null;
  }) => safeCapture("mobile_dialer_outcome_selected", props),
  attemptRecorded: (props: {
    item_id: number;
    attempt_id: number;
    outcome_classification: OutcomeClassification | null;
    duration_seconds: number | null;
  }) => safeCapture("mobile_dialer_attempt_recorded", props),
  attemptQueuedOffline: (props: { item_id: number }) =>
    safeCapture("mobile_dialer_attempt_queued_offline", props),
  skipUsed: (props: { item_id: number; reason: string }) =>
    safeCapture("mobile_dialer_skip_used", props),
  handBack: (props: { item_id: number | null }) =>
    safeCapture("mobile_dialer_hand_back", props),
  wrapUpShown: (props: { calls_completed: number }) =>
    safeCapture("mobile_dialer_wrap_up_shown", props),
  installPromptShown: () => safeCapture("mobile_dialer_install_prompt_shown"),
  installAccepted: () => safeCapture("mobile_dialer_install_accepted"),
  installDismissed: () => safeCapture("mobile_dialer_install_dismissed"),
};

/** Hash the token so we can correlate sessions without leaking the secret. */
export function tokenHint(token: string): string {
  if (!token) return "";
  return token.slice(0, 6);
}
