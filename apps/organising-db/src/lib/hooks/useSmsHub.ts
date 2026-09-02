'use client'

/**
 * Data hooks for the SMS hub: the whole-of-universe action list and
 * the number allocation table. Both are read-only views assembled
 * server-side; mutations go through the existing per-kind hooks.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type { SmsActivityResponse, SmsActivityRow } from '@/app/api/sms/activity/route'
import type { SmsNumbersResponse } from '@/app/api/sms/numbers/route'
import { excludeSmsEpisodes } from '@/lib/campaign/visible-campaigns'
import { createClient } from '@/lib/supabase/client'

export type { SmsActivityRow, SmsActivityResponse }

async function toError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({ error: fallback }))
  return new Error((err as { error?: string }).error || fallback)
}

export const SMS_ACTIVITY_QUERY_KEY = ['sms-activity'] as const

/** Every action across every campaign, with a live poll while any is in flight. */
export function useSmsActivity(campaignId?: number | null) {
  const scoped = campaignId != null
  return useQuery({
    queryKey: [...SMS_ACTIVITY_QUERY_KEY, scoped ? campaignId : 'all'],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/sms/activity${scoped ? `?campaign_id=${campaignId}` : ''}`,
      )
      if (!res.ok) throw await toError(res, 'Failed to load SMS activity')
      return res.json() as Promise<SmsActivityResponse>
    },
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const inFlight = [...data.blasts, ...data.surveys].some(
        (r) => r.status === 'queued' || r.status === 'sending',
      )
      return inFlight ? 15_000 : false
    },
  })
}

export const SMS_NUMBERS_QUERY_KEY = ['sms-numbers'] as const

export function useSmsNumbers(enabled = true) {
  return useQuery({
    queryKey: SMS_NUMBERS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetchApi('/api/sms/numbers')
      if (!res.ok) throw await toError(res, 'Failed to load SMS numbers')
      return res.json() as Promise<SmsNumbersResponse>
    },
    enabled,
  })
}

export interface SmsHubCampaignOption {
  campaign_id: number
  name: string
  status: string | null
}

/** Real campaigns (episodes excluded) for the scope picker and filters. */
export function useSmsHubCampaigns(enabled = true) {
  return useQuery({
    queryKey: ['sms-hub-campaigns'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await excludeSmsEpisodes(
        supabase
          .from('campaigns')
          .select('campaign_id, name, status')
          .order('created_at', { ascending: false }),
      )
      if (error) throw error
      return (data ?? []) as SmsHubCampaignOption[]
    },
    enabled,
    staleTime: 60_000,
  })
}
