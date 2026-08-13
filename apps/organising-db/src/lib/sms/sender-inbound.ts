/**
 * Whether a Mobile Message sender can receive replies into OA.
 *
 * Dedicated / shared numbers hit the inbound webhook (chat, surveys,
 * inbox). Own-mobile ("handset") senders deliver replies to the SIM.
 * Alphanumeric sender IDs are one-way.
 *
 * MM GET /v1/senders types (docs): `own`, `alpha`. Our mock and some
 * accounts also emit `dedicated_number` / `shared_number`.
 */
import { toE164 } from '@/lib/phone/normalise-phone'
import type { SenderId } from '@/lib/sms/provider/types'

export type SenderInboundKind = 'inbound' | 'handset' | 'one_way' | 'unknown'

export const HANDSET_SENDER_MESSAGE =
  'This is an organiser handset (own mobile), not a dedicated Mobile Message number. Replies go to the physical phone, not the console. Pick a dedicated number from Administration → SMS.'

export const ONE_WAY_SENDER_MESSAGE =
  'This sender cannot receive replies. Chat and surveys need a dedicated Mobile Message number.'

export const NOT_DEDICATED_SENDER_MESSAGE =
  'This number is not a dedicated Mobile Message number. Replies will go to the handset, not the console. Assign a dedicated number in Administration → SMS.'

export const SENDER_TYPE_UNVERIFIED_MESSAGE =
  'Could not verify this number with Mobile Message. Chat and surveys need a dedicated MM number (not a personal handset). Try again in a moment.'

/** Digit key for matching OA E.164 (`+614…`) to MM (`614…` / `0412…`). */
export function senderMatchKey(raw: string | null | undefined): string {
  if (raw == null) return ''
  const e164 = toE164(raw)
  if (e164) return e164.replace(/\D/g, '')
  return String(raw).replace(/\D/g, '')
}

export function classifyProviderSenderType(
  type: string | null | undefined,
  sender: string,
): SenderInboundKind {
  const t = (type ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')

  if (
    t === 'own' ||
    t.startsWith('own_') ||
    t === 'personal' ||
    t === 'handset' ||
    t === 'verified_mobile'
  ) {
    return 'handset'
  }

  if (
    t === 'alpha' ||
    t === 'alphanumeric' ||
    t === 'sender_id' ||
    t === 'custom' ||
    t === 'custom_sender' ||
    t.startsWith('alpha')
  ) {
    return 'one_way'
  }

  if (
    t === 'dedicated' ||
    t === 'dedicated_number' ||
    t === 'shared' ||
    t === 'shared_number' ||
    t.startsWith('dedicated') ||
    t.startsWith('shared')
  ) {
    return 'inbound'
  }

  const digits = senderMatchKey(sender)
  if (digits.length < 8) return 'one_way'
  // Numeric sender with no type — MM-issued numbers are dedicated;
  // own-mobiles are typed `own`.
  if (!t) return 'inbound'
  return 'unknown'
}

export function matchProviderSender(
  phoneE164: string,
  senders: SenderId[],
): SenderId | undefined {
  const key = senderMatchKey(phoneE164)
  if (!key) return undefined
  return senders.find((s) => senderMatchKey(s.sender) === key)
}

/**
 * Error copy if this phone cannot receive replies into OA, else null.
 * Empty catalogue → unverified (do not treat every OA number as a handset).
 */
export function inboundCheckForPhone(
  phoneE164: string,
  senders: SenderId[],
): string | null {
  if (senders.length === 0) return SENDER_TYPE_UNVERIFIED_MESSAGE
  const match = matchProviderSender(phoneE164, senders)
  if (!match) return NOT_DEDICATED_SENDER_MESSAGE
  const kind = classifyProviderSenderType(match.type, match.sender)
  if (kind === 'inbound') return null
  if (kind === 'handset') return HANDSET_SENDER_MESSAGE
  if (kind === 'one_way') return ONE_WAY_SENDER_MESSAGE
  return NOT_DEDICATED_SENDER_MESSAGE
}

/** Client-side: senders route already classified `supports_inbound`. */
export function inboundUnsafeClientMessage(sender?: {
  supports_inbound?: boolean | null
  provider_type?: string | null
  phone_e164?: string
} | null): string | null {
  if (!sender || sender.supports_inbound !== false) return null
  const kind = classifyProviderSenderType(
    sender.provider_type,
    sender.phone_e164 ?? '',
  )
  if (kind === 'handset') return HANDSET_SENDER_MESSAGE
  if (kind === 'one_way') return ONE_WAY_SENDER_MESSAGE
  return NOT_DEDICATED_SENDER_MESSAGE
}
