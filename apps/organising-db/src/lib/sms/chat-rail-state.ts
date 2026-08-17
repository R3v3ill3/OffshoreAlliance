/**
 * Rail state for the 3-pane chat workspace (Phase 10, brief §E0
 * decision 8c).
 *
 * The roster rail colour-codes each row by a SINGLE state, but no
 * single column carries it: `sms_list_items.status` knows about the
 * send (pending / sent / failed / opted_out) and
 * `sms_conversations.state` knows about the conversation
 * (messaged / needs_response / convo / closed). This module merges the
 * two into one ladder so the rail, its sort, and its "Needs reply"
 * filter all read from one place.
 *
 * Palette rule (brief §E0): these states drive DESATURATED background
 * tints. RATING_LEVELS colours mean *rating* and are rendered as a
 * separate saturated chip — a green row must never ambiguously mean
 * both "supportive" and "replied".
 *
 * Unit tested in __tests__/chat-rail-state.test.ts.
 */

import type { SmsConversationState, SmsListItemStatus } from "@/types/sms";

export type SmsRailState =
  | "not_messaged"
  | "sending"
  | "messaged"
  | "new_reply"
  | "needs_response"
  | "in_conversation"
  | "closed"
  | "opted_out"
  | "failed";

/** The board fields the rail derives its state from. */
export interface RailItemLike {
  status: SmsListItemStatus;
  sms_opt_out: boolean;
  conversation_state: SmsConversationState | null;
  unread_count: number;
}

/**
 * Merge item status + conversation state into one rail state.
 *
 * Precedence, highest first — the first match wins:
 *
 *   opted_out       a member who must not be contacted outranks every
 *                   other signal, including an unread reply (a STOP
 *                   keyword arrives as an inbound message).
 *   failed          a provider failure needs fixing before anything else
 *                   about the row matters.
 *   new_reply       unread inbound — the one state that pulses.
 *   needs_response  seen but unanswered (unread cleared by mark_read).
 *   in_conversation / closed / messaged — plain conversation states.
 *   sending / not_messaged — no conversation yet.
 */
export function deriveRailState(item: RailItemLike): SmsRailState {
  if (item.sms_opt_out || item.status === "opted_out" || item.status === "blocked") {
    return "opted_out";
  }
  if (item.status === "failed") return "failed";

  if (item.conversation_state != null) {
    if (item.conversation_state !== "closed" && item.unread_count > 0) {
      return "new_reply";
    }
    switch (item.conversation_state) {
      case "needs_response":
        return "needs_response";
      case "convo":
        return "in_conversation";
      case "closed":
        return "closed";
      case "messaged":
        return "messaged";
      // A worker-matched board row is never 'triage'; treat both
      // remaining states as "opener sent, nothing back yet".
      case "triage":
      case "needs_message":
        return "messaged";
    }
  }

  if (item.status === "sending" || item.status === "queued") return "sending";
  if (item.status === "sent" || item.status === "delivered") return "messaged";
  return "not_messaged";
}

/**
 * Sort weight — lower sorts first. Default rail order puts the rows
 * needing the organiser's attention at the top, then the ones in
 * flight, then the work not yet started, then the dead ends.
 */
const RANK: Record<SmsRailState, number> = {
  new_reply: 0,
  needs_response: 1,
  in_conversation: 2,
  failed: 3,
  messaged: 4,
  sending: 5,
  not_messaged: 6,
  closed: 7,
  opted_out: 8,
};

export function railStateRank(state: SmsRailState): number {
  return RANK[state];
}

/**
 * The "Needs reply" filter: rows where the member is waiting on us.
 * `in_conversation` is deliberately excluded — an active back-and-forth
 * with nothing unread is not outstanding work.
 */
export function isActionable(state: SmsRailState): boolean {
  return state === "new_reply" || state === "needs_response";
}

/** True while the row should pulse (brief §E0: unread inbound only). */
export function shouldPulse(state: SmsRailState): boolean {
  return state === "new_reply";
}
