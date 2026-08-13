/**
 * Server-only: look up a sms_numbers row against the live Mobile
 * Message sender catalogue. Mock provider has no real catalogue —
 * skip the check so local/dev chat and surveys still work.
 */
import { getSmsProvider, type SenderId } from '@/lib/sms/provider'
import {
  inboundCheckForPhone,
  NOT_DEDICATED_SENDER_MESSAGE,
  SENDER_TYPE_UNVERIFIED_MESSAGE,
} from '@/lib/sms/sender-inbound'

const CACHE_TTL_MS = 30_000

let cache: {
  at: number
  senders: SenderId[]
  providerName: string
} | null = null

export async function loadProviderSenderCatalogue(): Promise<{
  senders: SenderId[]
  providerName: string
}> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { senders: cache.senders, providerName: cache.providerName }
  }
  const provider = await getSmsProvider()
  const senders = await provider.listSenders()
  cache = { at: Date.now(), senders, providerName: provider.name }
  return { senders, providerName: provider.name }
}

/** Returns the shared 409 copy, or null when the number can receive replies. */
export async function dedicatedNumberRequiredForNumberId(
  db: { from: (table: string) => any },
  numberId: number,
): Promise<string | null> {
  const { data, error } = await db
    .from('sms_numbers')
    .select('phone_e164')
    .eq('number_id', numberId)
    .maybeSingle()
  if (error) throw error
  if (!data?.phone_e164) return NOT_DEDICATED_SENDER_MESSAGE
  try {
    const { senders, providerName } = await loadProviderSenderCatalogue()
    if (providerName === 'mock') return null
    return inboundCheckForPhone(data.phone_e164 as string, senders)
  } catch (err) {
    console.error('dedicated-number sender check failed:', err)
    return SENDER_TYPE_UNVERIFIED_MESSAGE
  }
}
