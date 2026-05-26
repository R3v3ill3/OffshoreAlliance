/**
 * Outcome model — single source of truth for the `outcome_classification`
 * vocabulary persisted on `call_attempts`.
 *
 * The DB column accepts one of fourteen values (see migration
 * 20260613110000_outcome_model.sql). This module:
 *
 * 1. Re-exports the vocabulary as a typed enum (`OutcomeClassification`).
 * 2. Provides display metadata (label, sentiment, terminal flag) for UI.
 * 3. Derives an outcome_classification from the existing dial / call /
 *    CTA / support / membership signals captured by the dialer UI, so
 *    new code (mobile dialer) and old code (CallSessionPage doSubmit)
 *    classify identically.
 *
 * The taxonomy is intentionally narrower than the dial+call disposition
 * pair, because it represents the *organising outcome* of the conversation
 * (did we move them?) rather than the call-state outcome (did the phone
 * connect?). Reports key off this column.
 */

import type { CallDisposition, DialDisposition, SupportLevel } from "@/types/planner-types";

export const OUTCOME_CLASSIFICATIONS = [
  "agreed_to_join",
  "interested_undecided",
  "interested_callback",
  "not_interested",
  "declined_explicitly",
  "wrong_number",
  "do_not_call",
  "unable_to_reach",
  "callback_later",
  "voicemail_left",
  "referred_to_other_org",
  "existing_member_supportive",
  "existing_member_neutral",
  "other",
] as const;

export type OutcomeClassification = (typeof OUTCOME_CLASSIFICATIONS)[number];

export type OutcomeSentiment = "positive" | "neutral" | "negative" | "operational";

export interface OutcomeMeta {
  value: OutcomeClassification;
  label: string;
  /**
   * High-level mood for visual grouping. Reports use sentiment for the
   * top-line outcome rollup card.
   */
  sentiment: OutcomeSentiment;
  /** Terminal outcomes mark the contact as completed in the queue. */
  terminal: boolean;
  /** Whether the outcome implies a future callback. */
  schedulesCallback: boolean;
  shortHelp: string;
}

export const OUTCOME_META: Record<OutcomeClassification, OutcomeMeta> = {
  agreed_to_join: {
    value: "agreed_to_join",
    label: "Agreed to join",
    sentiment: "positive",
    terminal: true,
    schedulesCallback: false,
    shortHelp: "Said yes to joining the union (pending paperwork).",
  },
  interested_undecided: {
    value: "interested_undecided",
    label: "Interested, undecided",
    sentiment: "positive",
    terminal: false,
    schedulesCallback: false,
    shortHelp: "Engaged in the conversation, not ready to commit yet.",
  },
  interested_callback: {
    value: "interested_callback",
    label: "Interested, wants callback",
    sentiment: "positive",
    terminal: false,
    schedulesCallback: true,
    shortHelp: "Wants to talk again — schedule a follow-up.",
  },
  not_interested: {
    value: "not_interested",
    label: "Not interested",
    sentiment: "negative",
    terminal: true,
    schedulesCallback: false,
    shortHelp: "Heard the ask, said no.",
  },
  declined_explicitly: {
    value: "declined_explicitly",
    label: "Explicit decline",
    sentiment: "negative",
    terminal: true,
    schedulesCallback: false,
    shortHelp: "Refused outright — usually with a clear stance.",
  },
  wrong_number: {
    value: "wrong_number",
    label: "Wrong number",
    sentiment: "operational",
    terminal: true,
    schedulesCallback: false,
    shortHelp: "Number reaches someone other than the contact.",
  },
  do_not_call: {
    value: "do_not_call",
    label: "Do not call",
    sentiment: "operational",
    terminal: true,
    schedulesCallback: false,
    shortHelp: "Contact asked never to be called again.",
  },
  unable_to_reach: {
    value: "unable_to_reach",
    label: "Unable to reach",
    sentiment: "operational",
    terminal: false,
    schedulesCallback: false,
    shortHelp: "Did not get through; queue will retry later.",
  },
  callback_later: {
    value: "callback_later",
    label: "Call back later",
    sentiment: "operational",
    terminal: false,
    schedulesCallback: true,
    shortHelp: "Contact answered but asked to be called at another time.",
  },
  voicemail_left: {
    value: "voicemail_left",
    label: "Voicemail left",
    sentiment: "operational",
    terminal: false,
    schedulesCallback: false,
    shortHelp: "Left a message; queue will retry later.",
  },
  referred_to_other_org: {
    value: "referred_to_other_org",
    label: "Referred to other org",
    sentiment: "neutral",
    terminal: true,
    schedulesCallback: false,
    shortHelp: "Routed to a different union or organisation.",
  },
  existing_member_supportive: {
    value: "existing_member_supportive",
    label: "Existing member · supportive",
    sentiment: "positive",
    terminal: true,
    schedulesCallback: false,
    shortHelp: "Already a member and engaged with the campaign.",
  },
  existing_member_neutral: {
    value: "existing_member_neutral",
    label: "Existing member · neutral",
    sentiment: "neutral",
    terminal: true,
    schedulesCallback: false,
    shortHelp: "Already a member but not particularly engaged.",
  },
  other: {
    value: "other",
    label: "Other",
    sentiment: "neutral",
    terminal: true,
    schedulesCallback: false,
    shortHelp: "Doesn’t fit any of the above categories — record in notes.",
  },
};

/** Ordered list used by UI pickers / rollup tables. */
export const OUTCOME_OPTIONS: OutcomeMeta[] = OUTCOME_CLASSIFICATIONS.map((v) => OUTCOME_META[v]);

export interface DeriveOutcomeInput {
  dialDisposition: DialDisposition | null | undefined;
  callDisposition: CallDisposition | null | undefined;
  supportLevel?: SupportLevel | null;
  /** True when the user picked an explicit "Will join" CTA / outcome. */
  joinPositive?: boolean;
  /** True when the contact is an existing financial member. */
  existingMember?: boolean;
}

/**
 * Derive an `outcome_classification` from the signals captured during the
 * call. Returns `null` only when not enough information has been captured
 * to classify (caller hasn't picked a dial disposition yet).
 *
 * This is the function both UIs should call before submitting an attempt
 * so the persisted classification matches what reports surface.
 */
export function deriveOutcomeClassification(
  input: DeriveOutcomeInput,
): OutcomeClassification | null {
  const { dialDisposition, callDisposition, supportLevel, joinPositive, existingMember } = input;

  if (!dialDisposition) return null;

  switch (dialDisposition) {
    case "wrong_number":
      return "wrong_number";
    case "do_not_call":
      return "do_not_call";
    case "voicemail_left":
      return "voicemail_left";
    case "voicemail_no_message":
    case "no_answer":
    case "busy":
    case "disconnected":
      return "unable_to_reach";
    case "callback_requested":
      return "callback_later";
    case "connected":
      break;
    default:
      return "other";
  }

  if (callDisposition === "removed_from_campaign" || callDisposition === "no_longer_in_universe") {
    return "do_not_call";
  }
  if (callDisposition === "referred_to_other") {
    return "referred_to_other_org";
  }
  if (callDisposition === "partial_asked_callback") {
    return "interested_callback";
  }

  if (joinPositive) return "agreed_to_join";

  if (existingMember) {
    if (supportLevel === "strong_supporter" || supportLevel === "supporter") {
      return "existing_member_supportive";
    }
    return "existing_member_neutral";
  }

  switch (callDisposition) {
    case "completed_positive":
      return supportLevel === "strong_supporter" || supportLevel === "supporter"
        ? "interested_undecided"
        : "interested_undecided";
    case "completed_neutral":
      return "interested_undecided";
    case "completed_negative":
      return supportLevel === "hostile" ? "declined_explicitly" : "not_interested";
    case "partial_hung_up":
      return "not_interested";
    default:
      return "other";
  }
}

/** Quick lookup helper for UI badges / colours. */
export function outcomeSentiment(classification: OutcomeClassification): OutcomeSentiment {
  return OUTCOME_META[classification].sentiment;
}
