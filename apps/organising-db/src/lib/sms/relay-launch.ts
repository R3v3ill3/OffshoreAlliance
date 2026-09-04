/**
 * Launch texts — the blast that invites members to text a relay
 * (sms_lists.relay_id, migration 20260904120000).
 *
 * Everything decision-shaped lives here so the relay sheet, the blast
 * sheet, the three sms-list routes and the dispatch cron cannot drift
 * on the two rules that matter:
 *
 *   1. A relay-purpose number is normally an unusable sender (its
 *      webhook leg outranks conversational routing, so replies never
 *      become inbox threads). The ONE exception is a launch text sent
 *      from the relay's own number — where that is the point, because
 *      every reply is then a message to the target.
 *   2. A launch text must not go out while its relay is still paused:
 *      members who take up the invitation get RELAY_PAUSED_REPLY and
 *      are never forwarded, so the whole send is wasted.
 *
 * Deliberately a leaf module below `sender-purpose.ts` (which builds
 * the server-side sender check on top of `isPermittedRelaySender`).
 */

import { TEMPLATE_TOKEN_RE } from "@/lib/comms/template-variables";
import { toDisplay, toE164 } from "@/lib/phone/normalise-phone";
import { matchPhoneInList, RELAY_PAUSED_REPLY } from "@/lib/sms/relay-engine";

// ─── Seed-time tokens ───────────────────────────────────────────────

/** `{{relay_number}}` → the display form, e.g. "0400 100 014". */
export const RELAY_NUMBER_TOKEN = "relay_number";
/** `{{relay_sms_link}}` → a tap-to-text link, e.g. "sms:+61400100014". */
export const RELAY_SMS_LINK_TOKEN = "relay_sms_link";

/**
 * The shape of a good launch text, deliberately campaign-neutral: no
 * employer, person, site or issue is named, so the organiser replaces
 * the specifics rather than the structure. Square-bracket text is a
 * placeholder they must fill in (the blast sheet warns while any is
 * left); `{{first_name}}` is the composer's own merge field and
 * resolves at dispatch, while the two relay tokens resolve at seed
 * time. "Offshore Alliance" closes it so the composer's compliance
 * checklist reports the organisation name present.
 */
export const DEFAULT_RELAY_LAUNCH_TEMPLATE = `Hey {{first_name}}. [One or two lines on what has happened and why it matters.]
Text {{relay_number}} — it goes straight to [who] with your name and site on the end. Keep it polite, keep it short, make it your own. A few starters:

* "[Starter 1]"
* "[Starter 2]"
* "[Starter 3]"

Text {{relay_number}} now.
Offshore Alliance`;

/**
 * Resolve the two relay tokens and leave every other `{{token}}`
 * exactly as written — the blast composer's own merge fields belong to
 * the dispatch cron, which knows nothing about relays.
 *
 * Seed time rather than dispatch time because a relay's number is
 * fixed for its life (`number_id NOT NULL`, never reassigned; ending
 * a relay releases the number), so there is nothing to gain by
 * deferring it, and `relay_number` is therefore NOT in
 * ALL_TEMPLATE_VARIABLES.
 */
export function renderRelayLaunchBody(
  template: string,
  relayPhoneE164: string,
): string {
  if (!template) return "";
  const display = toDisplay(relayPhoneE164);
  const link = `sms:${toE164(relayPhoneE164) ?? relayPhoneE164}`;
  return template.replace(TEMPLATE_TOKEN_RE, (match, key: string) => {
    if (key === RELAY_NUMBER_TOKEN) return display;
    if (key === RELAY_SMS_LINK_TOKEN) return link;
    return match;
  });
}

// ─── "Does this text actually carry the number?" ────────────────────

/**
 * Phone-shaped runs in free text: digits with at most one separator
 * between them, optionally `+`-led. Catches "0400 100 014",
 * "+61400100014" and the tail of "sms:+61400100014" alike.
 */
const PHONE_CANDIDATE_RE = /\+?\d(?:[\s().-]?\d){7,}/g;

/**
 * True when the body carries the relay number in any tolerant form
 * (display, E.164, national `04…`, or an `sms:` link to it). Warn-only
 * in the UI: a launch text that never names the number leaves members
 * with nowhere to write.
 *
 * Matching is delegated to `matchPhoneInList` so this agrees with the
 * webhook's own idea of "same number" rather than inventing a second
 * one.
 */
export function launchBodyMentionsRelayNumber(
  body: string,
  relayPhoneE164: string,
): boolean {
  if (!body || !relayPhoneE164) return false;
  const rows = [{ phone_e164: relayPhoneE164 }];
  for (const run of body.match(PHONE_CANDIDATE_RE) ?? []) {
    if (matchPhoneInList(rows, run)) return true;
    // Two numbers written side by side scan as a single run; slide the
    // significant-digit window over it rather than missing both.
    const digits = run.replace(/\D/g, "");
    if (digits.length <= 12) continue;
    for (let i = 0; i + 9 <= digits.length; i += 1) {
      for (const len of [9, 10, 11] as const) {
        if (i + len > digits.length) continue;
        if (matchPhoneInList(rows, digits.slice(i, i + len))) return true;
      }
    }
  }
  return false;
}

// ─── Sender choice ──────────────────────────────────────────────────

export type RelayLaunchSenderMode = "different_number" | "relay_number";

/**
 * Is this number an acceptable sender for this blast?
 *
 * Survey-purpose numbers never are (a live session eats the replies).
 * Relay-purpose numbers are the interesting case: acceptable only when
 * the list is a launch text for the relay that owns that exact number
 * — any other relay's number is the same misrouting bug as before.
 * Every other purpose (organiser, spare, …) is somebody else's rule,
 * so this returns true and lets the existing checks speak.
 *
 * The two rejected purposes are `INBOX_UNSAFE_PURPOSES` in
 * `sender-purpose.ts`, named here rather than imported to keep this
 * module a leaf below the server helper built on it.
 */
export function isPermittedRelaySender(args: {
  senderNumberId: number | null | undefined;
  senderPurpose: string | null | undefined;
  listRelayId: number | null | undefined;
  relayNumberId: number | null | undefined;
}): boolean {
  if (args.senderPurpose === "survey") return false;
  if (args.senderPurpose !== "relay") return true;
  if (args.listRelayId == null) return false;
  if (args.senderNumberId == null || args.relayNumberId == null) return false;
  return args.senderNumberId === args.relayNumberId;
}

/**
 * Shown wherever the organiser picks the relay number as the launch
 * text's sender — exported so the sheet and any server 4xx use
 * identical words.
 */
export const RELAY_NUMBER_SENDER_WARNING =
  'Every reply to this text is treated as a message to the target and forwarded automatically — including "who is this?" and "thanks". STOP still opts the member out. Only choose this if you want every reply to reach the target.';

/** Default name for a launch blast: "<relay name> — launch text". */
export function relayLaunchBlastName(relayName: string): string {
  const base = (relayName ?? "").trim();
  return base ? `${base} — launch text` : "Launch text";
}

// ─── Queue gate ─────────────────────────────────────────────────────

/**
 * A launch text may only be queued once its relay is active. Members
 * who act on an invitation to a paused relay get the paused auto-reply
 * and their message is never forwarded — the send is spent and the
 * moment is gone.
 */
export function relayLaunchQueueBlocker(
  relayStatus: "active" | "paused" | "ended" | null,
): string | null {
  if (relayStatus === "active") return null;
  if (relayStatus === "paused") {
    return `Activate the relay before sending its launch text — until then a member who texts in gets "${RELAY_PAUSED_REPLY}" and their message is never forwarded.`;
  }
  if (relayStatus === "ended") {
    return "This relay has ended and its number has been released, so a launch text for it can no longer be sent.";
  }
  return "The relay this launch text belongs to could not be found.";
}

// ─── Dispatch-time mirroring ────────────────────────────────────────

/**
 * Should a dispatched blast be mirrored into inbox conversations?
 *
 * No, for a launch text sent from the relay's own number: replies to it
 * are member messages to the relay target, handled by the webhook's
 * relay leg, and a mirrored thread would be an inbox conversation no
 * organiser ever answers. `sms_send_log` is untouched either way — the
 * send still happened.
 */
export function shouldMirrorBlastConversations(args: {
  listRelayId: number | null | undefined;
  senderNumberId: number | null | undefined;
  relayNumberId: number | null | undefined;
}): boolean {
  if (args.listRelayId == null) return true;
  if (args.senderNumberId == null || args.relayNumberId == null) return true;
  return args.senderNumberId !== args.relayNumberId;
}
