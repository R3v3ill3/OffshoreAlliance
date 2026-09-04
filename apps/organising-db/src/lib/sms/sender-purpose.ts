/**
 * Dedicated-number purposes from Administration → SMS.
 *
 * Relay and survey purposes have webhook precedence over inbox
 * routing. Blast and chat must not send from them or replies never
 * land as conversations. Survey senders may use a survey-purpose
 * number (preferred) or an organiser number (with a warning).
 *
 * One exception, and only one: a LAUNCH TEXT may send from the relay
 * number it advertises, because there every reply reaching the target
 * is the point. `relayAwareSenderMessage` is the check that knows it;
 * the decision itself lives in `relay-launch.ts`.
 */

import { isPermittedRelaySender } from '@/lib/sms/relay-launch'

/**
 * A structurally-typed Supabase client: the relay tables are not in the
 * generated Database types, so these lookups cannot use the typed
 * client without inventing a schema for them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SenderPurposeDb = { from: (table: string) => any }

export const INBOX_UNSAFE_PURPOSES = ['relay', 'survey'] as const

export type InboxUnsafePurpose = (typeof INBOX_UNSAFE_PURPOSES)[number]

export function isInboxUnsafePurpose(
  purpose: string | null | undefined,
): purpose is InboxUnsafePurpose {
  return purpose === 'relay' || purpose === 'survey'
}

export const INBOX_UNSAFE_SENDER_MESSAGE =
  'This number is reserved for surveys or relays — pick an organiser number so replies land in Inbox.'

export function inboxUnsafePurposeError(
  purpose: string | null | undefined,
): string | null {
  return isInboxUnsafePurpose(purpose) ? INBOX_UNSAFE_SENDER_MESSAGE : null
}

/** Returns the shared 409 copy if this number is reserved for surveys/relays. */
export async function inboxUnsafeSenderMessage(
  db: SenderPurposeDb,
  numberId: number,
): Promise<string | null> {
  const { data, error } = await db
    .from('sms_numbers')
    .select('purpose')
    .eq('number_id', numberId)
    .maybeSingle()
  if (error) throw error
  return inboxUnsafePurposeError(data?.purpose as string | null)
}

/**
 * The same 409 check, but aware of launch texts: a relay-purpose
 * number is an acceptable blast sender when — and only when — the list
 * is a launch text for the relay that owns that exact number
 * (`sms_lists.relay_id`). Every other case, including another relay's
 * number and any survey number, gets the shared copy above.
 *
 * Use this on any sms_lists route that knows the list's relay link;
 * `inboxUnsafeSenderMessage` stays correct for every other caller.
 */
export async function relayAwareSenderMessage(
  db: SenderPurposeDb,
  args: { senderNumberId: number; listRelayId: number | null | undefined },
): Promise<string | null> {
  const { data: numberRow, error } = await db
    .from('sms_numbers')
    .select('purpose')
    .eq('number_id', args.senderNumberId)
    .maybeSingle()
  if (error) throw error

  let relayNumberId: number | null = null
  if (args.listRelayId != null) {
    const { data: relay, error: relayErr } = await db
      .from('sms_relays')
      .select('number_id')
      .eq('relay_id', args.listRelayId)
      .maybeSingle()
    if (relayErr) throw relayErr
    relayNumberId = (relay?.number_id as number | null) ?? null
  }

  return isPermittedRelaySender({
    senderNumberId: args.senderNumberId,
    senderPurpose: numberRow?.purpose as string | null,
    listRelayId: args.listRelayId,
    relayNumberId,
  })
    ? null
    : INBOX_UNSAFE_SENDER_MESSAGE
}

export function filterInboxSafeSenders<T extends { purpose: string }>(
  senders: T[],
): T[] {
  return senders.filter((s) => !isInboxUnsafePurpose(s.purpose))
}

/** Survey picker: relay numbers are claimed by live relays. */
export function filterSurveySenders<T extends { purpose: string }>(
  senders: T[],
): T[] {
  return senders.filter((s) => s.purpose !== 'relay')
}

export function surveySenderSortKey(s: {
  purpose: string
  is_mine?: boolean
}): number {
  if (s.purpose === 'survey') return 0
  if (s.is_mine) return 1
  if (s.purpose === 'organiser') return 2
  if (s.purpose === 'spare') return 3
  return 4
}

export function surveySenderPurposeHint(purpose: string): string {
  if (purpose === 'survey') return ' (survey)'
  if (purpose === 'organiser') return ' (organiser inbox)'
  if (purpose === 'spare') return ' (spare)'
  return ` (${purpose})`
}

/** Warn-only: surveys may send from organiser/spare numbers. */
export function surveySenderPurposeWarning(
  purpose: string | null | undefined,
): string | null {
  if (purpose === 'relay') {
    return 'Relay numbers are reserved for live relays — pick a survey or organiser number so replies stay in the survey session.'
  }
  if (purpose === 'organiser') {
    return 'Replies to this inbox number are treated as survey answers while a session is live — they will not appear as ordinary inbox messages until the session ends.'
  }
  if (purpose === 'spare') {
    return 'This spare number is not reserved for surveys. Prefer a survey-purpose number so inbox routing stays clear.'
  }
  return null
}
