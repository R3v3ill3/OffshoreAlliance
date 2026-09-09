'use client'

/**
 * Data hooks for the Actions hub: SMS, email and call lists, merged
 * into one list of `HubActionRow`.
 *
 * Three queries rather than one combined route, deliberately — but not
 * because the SMS one is shared: `useSmsActivity` has exactly one
 * consumer, this hook. It is kept separate because its cache key is
 * the prefix `['sms-activity']` that every SMS mutation invalidates
 * (`useSmsActionOps.ts`, `SmsCreateActionPage.tsx`), and
 * because three queries fail independently: a slow or failing email or
 * calls read cannot blank the SMS rows, and the page reports the gap
 * instead of hiding it. It also already polls while a send is in
 * flight, which a combined route would have to reproduce.
 */
import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import { useAuth } from '@/lib/supabase/auth-context'
import { useSmsActivity } from '@/lib/hooks/useSmsHub'
import {
  HUB_SOURCE_LIMIT,
  mergeHubRows,
  pendingModerationTotal,
  type HubActionRow,
} from '@/lib/actions/hub-rows'
import type { EmailActivityResponse } from '@/app/api/email/activity/route'
import type { CallActivityResponse } from '@/app/api/calls/activity/route'

async function toError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({ error: fallback }))
  return new Error((err as { error?: string }).error || fallback)
}

export const EMAIL_ACTIVITY_QUERY_KEY = ['email-activity'] as const
export const CALL_ACTIVITY_QUERY_KEY = ['call-activity'] as const

/**
 * Narrows to the caller server-side. Each route caps at
 * `HUB_SOURCE_LIMIT` rows, so filtering only on the client would let
 * other people's actions crowd an organiser's own out of the response
 * entirely — the one truncation the default view could not survive.
 *
 * The parameter is `owner=mine_or_unowned` rather than `mine=1`
 * because that is what it asks for: the caller's rows *and* the ones
 * nobody owns, which the hub counts and announces rather than hides.
 */
function ownerParam(mine: boolean): string {
  return mine ? '?owner=mine_or_unowned' : ''
}

/** Every email list and un-listed email draft, across every campaign. */
export function useEmailActivity(opts?: { mine?: boolean; enabled?: boolean }) {
  const mine = opts?.mine ?? false
  return useQuery({
    queryKey: [...EMAIL_ACTIVITY_QUERY_KEY, mine ? 'mine' : 'everyone'],
    queryFn: async () => {
      const res = await fetchApi(`/api/email/activity${ownerParam(mine)}`)
      if (!res.ok) throw await toError(res, 'Failed to load email activity')
      return res.json() as Promise<EmailActivityResponse>
    },
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
    // Mine and All are separate cache entries; keep the last answer on
    // screen while the other one loads rather than emptying the table.
    placeholderData: keepPreviousData,
  })
}

/** Every call list, across every campaign. */
export function useCallActivity(opts?: { mine?: boolean; enabled?: boolean }) {
  const mine = opts?.mine ?? false
  return useQuery({
    queryKey: [...CALL_ACTIVITY_QUERY_KEY, mine ? 'mine' : 'everyone'],
    queryFn: async () => {
      const res = await fetchApi(`/api/calls/activity${ownerParam(mine)}`)
      if (!res.ok) throw await toError(res, 'Failed to load call activity')
      return res.json() as Promise<CallActivityResponse>
    },
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
    // As above: flipping the owner filter must not blank the list.
    placeholderData: keepPreviousData,
  })
}

export interface HubActionRowsResult {
  rows: HubActionRow[]
  isLoading: boolean
  /** Set when one channel could not be read; the rest still render. */
  smsError: boolean
  emailError: boolean
  callsError: boolean
  refetchSms: () => void
  refetchEmail: () => void
  refetchCalls: () => void
  /** SMS only — no other source table has an archived_at column. */
  archivedTotal: number
  /**
   * Relay messages awaiting moderation, org-wide and independent of the
   * owner filter — the route computes it, the hub only displays it.
   */
  pendingModerationTotal: number
  /**
   * At least one source came back at its cap, so the list is not the
   * whole history and the table says so.
   */
  capped: boolean
}

/**
 * The merged, sorted row list. Ownership is resolved here against the
 * signed-in user so the "Mine" filter is a pure client-side predicate
 * over rows the routes already returned.
 */
export function useHubActionRows(opts: {
  showArchived: boolean
  /** Ask the routes for the caller's rows only; see `mineParam`. */
  mine?: boolean
}): HubActionRowsResult {
  const { user } = useAuth()
  const mine = opts.mine ?? false
  const sms = useSmsActivity(undefined, {
    archived: opts.showArchived ? 'include' : 'exclude',
    mine,
  })
  const email = useEmailActivity({ mine })
  const calls = useCallActivity({ mine })

  const currentUserId = user?.id ?? null
  const rows = useMemo(
    () =>
      mergeHubRows(
        {
          sms: [
            ...(sms.data?.blasts ?? []),
            ...(sms.data?.chats ?? []),
            ...(sms.data?.surveys ?? []),
            ...(sms.data?.relays ?? []),
          ],
          email: [...(email.data?.lists ?? []), ...(email.data?.drafts ?? [])],
          calls: calls.data?.lists ?? [],
        },
        { currentUserId },
      ),
    [sms.data, email.data, calls.data, currentUserId],
  )

  // Each of these arrays is one capped read: blasts and chats come out
  // of the same `sms_lists` query, so they are counted together.
  const capped = [
    (sms.data?.blasts?.length ?? 0) + (sms.data?.chats?.length ?? 0),
    sms.data?.surveys?.length ?? 0,
    sms.data?.relays?.length ?? 0,
    email.data?.lists?.length ?? 0,
    email.data?.drafts?.length ?? 0,
    calls.data?.lists?.length ?? 0,
  ].some((n) => n >= HUB_SOURCE_LIMIT)

  return {
    rows,
    isLoading: sms.isLoading || email.isLoading || calls.isLoading,
    smsError: sms.isError,
    emailError: email.isError,
    callsError: calls.isError,
    refetchSms: () => void sms.refetch(),
    refetchEmail: () => void email.refetch(),
    refetchCalls: () => void calls.refetch(),
    archivedTotal: sms.data?.archived_total ?? 0,
    pendingModerationTotal: pendingModerationTotal(sms.data),
    capped,
  }
}
