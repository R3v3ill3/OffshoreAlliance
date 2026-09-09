'use client'

/**
 * Data hooks for the Actions hub: SMS, email and call lists, merged
 * into one list of `HubActionRow`.
 *
 * Three queries rather than one combined route, deliberately.
 * `useSmsActivity` already exists, already polls while a send is in
 * flight, and its cache key is shared with the campaign SMS panels;
 * folding it into a new endpoint would change both for no gain. The
 * two new queries are independent, so a slow or failing one cannot
 * blank the SMS rows — the page reports the gap instead of hiding it.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import { useAuth } from '@/lib/supabase/auth-context'
import { useSmsActivity } from '@/lib/hooks/useSmsHub'
import { mergeHubRows, type HubActionRow } from '@/lib/actions/hub-rows'
import type { EmailActivityResponse } from '@/app/api/email/activity/route'
import type { CallActivityResponse } from '@/app/api/calls/activity/route'

async function toError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({ error: fallback }))
  return new Error((err as { error?: string }).error || fallback)
}

export const EMAIL_ACTIVITY_QUERY_KEY = ['email-activity'] as const
export const CALL_ACTIVITY_QUERY_KEY = ['call-activity'] as const

/**
 * `mine` narrows to the caller server-side. Each route caps at 200
 * rows, so filtering only on the client would let other people's
 * actions crowd an organiser's own out of the response entirely —
 * the one truncation the default view could not survive.
 */
function mineParam(mine: boolean): string {
  return mine ? '?mine=1' : ''
}

/** Every email list and un-listed email draft, across every campaign. */
export function useEmailActivity(opts?: { mine?: boolean; enabled?: boolean }) {
  const mine = opts?.mine ?? false
  return useQuery({
    queryKey: [...EMAIL_ACTIVITY_QUERY_KEY, mine ? 'mine' : 'everyone'],
    queryFn: async () => {
      const res = await fetchApi(`/api/email/activity${mineParam(mine)}`)
      if (!res.ok) throw await toError(res, 'Failed to load email activity')
      return res.json() as Promise<EmailActivityResponse>
    },
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
  })
}

/** Every call list, across every campaign. */
export function useCallActivity(opts?: { mine?: boolean; enabled?: boolean }) {
  const mine = opts?.mine ?? false
  return useQuery({
    queryKey: [...CALL_ACTIVITY_QUERY_KEY, mine ? 'mine' : 'everyone'],
    queryFn: async () => {
      const res = await fetchApi(`/api/calls/activity${mineParam(mine)}`)
      if (!res.ok) throw await toError(res, 'Failed to load call activity')
      return res.json() as Promise<CallActivityResponse>
    },
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
  })
}

export interface HubActionRowsResult {
  rows: HubActionRow[]
  isLoading: boolean
  /** Every source failed — the list is genuinely empty of information. */
  isError: boolean
  /** Set when one channel could not be read; the rest still render. */
  smsError: boolean
  emailError: boolean
  callsError: boolean
  refetchSms: () => void
  refetchEmail: () => void
  refetchCalls: () => void
  /** SMS only — no other source table has an archived_at column. */
  archivedTotal: number
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

  return {
    rows,
    isLoading: sms.isLoading || email.isLoading || calls.isLoading,
    isError: sms.isError && email.isError && calls.isError,
    smsError: sms.isError,
    emailError: email.isError,
    callsError: calls.isError,
    refetchSms: () => void sms.refetch(),
    refetchEmail: () => void email.refetch(),
    refetchCalls: () => void calls.refetch(),
    archivedTotal: sms.data?.archived_total ?? 0,
  }
}
