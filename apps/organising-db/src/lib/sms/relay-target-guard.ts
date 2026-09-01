/**
 * Can this phone be a relay target?
 *
 * The original rule was a flat refusal: no `sms_numbers` row — any
 * purpose, any status — could ever be a target. That is safe and
 * unusable. Every phone a staff member would naturally test a relay
 * with is already registered on the platform (their own organiser
 * number, the sandbox number, the survey number), so relays could not
 * be tested end-to-end at all without borrowing an outside handset.
 *
 * What actually needs preventing is narrower than "one of ours". A
 * forward to one of our numbers arrives back at our webhook, and the
 * webhook decides what to do with it by looking at that number:
 *
 *   1. Live relay on it  → the inbound is treated as relay traffic and
 *      forwarded on again. That is the ring, and it is the reason the
 *      guard exists.
 *   2. Live survey session on that phone → the reply is read as a
 *      survey ANSWER (the survey leg runs before the relay leg in the
 *      webhook precedence), so the relay conversation is silently
 *      eaten and the survey gets junk data.
 *   3. Neither → the message lands in the inbox as an ordinary
 *      conversation. Nothing loops; this is exactly what a test wants.
 *
 * So the guard now blocks 1 and 2 — and a relay targeting its own
 * number, which is a ring with one hop — and allows 3. The number is
 * re-checked at forward time (`stripRingDestinations`), because a
 * relay can be created on a number AFTER it was accepted as a target
 * and only the send-time check can catch that.
 *
 * Pure module — unit tested in __tests__/relay-target-guard.ts.
 */

import { matchPhoneInList } from "@/lib/sms/relay-engine";

/**
 * One of our numbers, with whatever is currently holding it. Loaded by
 * `loadOwnNumberUsage` below; shaped here so the decision stays pure.
 */
export interface OwnNumberUsage {
  number_id: number;
  phone_e164: string;
  label?: string | null;
  /** A relay on this number that has not ended (active | paused). */
  live_relay: { relay_id: number; name: string | null } | null;
  /** An invited/active survey session addressed to this phone. */
  live_survey: { survey_id: number; title: string | null } | null;
}

export type RelayTargetVerdict =
  | { allowed: true; own_number_id: number | null }
  | { allowed: false; reason: string };

function describe(usage: OwnNumberUsage): string {
  return usage.label?.trim() ? `${usage.phone_e164} (${usage.label})` : usage.phone_e164;
}

/**
 * Whether `phone` may be added as a target of the relay running on
 * `relayNumberId`. A phone that is not one of ours is always allowed —
 * that is the ordinary case, and the reason the own-number list is
 * consulted at all is the three hazards above.
 */
export function decideRelayTarget(args: {
  phone: string;
  ownNumbers: OwnNumberUsage[];
  /** The number this relay sends from; null when not yet chosen. */
  relayNumberId: number | null;
}): RelayTargetVerdict {
  const own = matchPhoneInList(args.ownNumbers, args.phone);
  if (!own) return { allowed: true, own_number_id: null };

  if (args.relayNumberId != null && own.number_id === args.relayNumberId) {
    return {
      allowed: false,
      reason: `${describe(own)} is this relay's own number — a relay cannot forward to itself.`,
    };
  }

  if (own.live_relay) {
    const name = own.live_relay.name?.trim() || `relay ${own.live_relay.relay_id}`;
    return {
      allowed: false,
      reason:
        `${describe(own)} is one of our numbers and it carries a live relay ("${name}"). ` +
        `Forwarding to it would loop relay traffic back into the platform. ` +
        `End that relay first, or pick a number with no live relay.`,
    };
  }

  if (own.live_survey) {
    const title = own.live_survey.title?.trim() || `survey ${own.live_survey.survey_id}`;
    return {
      allowed: false,
      reason:
        `${describe(own)} is one of our numbers and it has a live survey session ("${title}"). ` +
        `Replies from it would be read as survey answers, not relay replies. ` +
        `Wait for that session to finish, or use another number.`,
    };
  }

  return { allowed: true, own_number_id: own.number_id };
}

/**
 * Send-time ring belt: drop any destination that carries a live relay
 * right now.
 *
 * `decideRelayTarget` runs when a target is added, so it cannot see a
 * relay stood up on that number afterwards. This runs on every forward
 * and is the check that actually holds — the create-time one is there
 * to give the organiser an explanation instead of a silent drop.
 */
export function stripRingDestinations<T extends { phone_e164: string }>(
  destinations: T[],
  liveRelayPhones: string[],
): { kept: T[]; dropped: T[] } {
  if (liveRelayPhones.length === 0) return { kept: destinations, dropped: [] };
  const rows = liveRelayPhones.map((phone_e164) => ({ phone_e164 }));
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const d of destinations) {
    if (matchPhoneInList(rows, d.phone_e164)) dropped.push(d);
    else kept.push(d);
  }
  return { kept, dropped };
}
