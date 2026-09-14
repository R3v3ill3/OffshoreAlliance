'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type { EmailEngagementStats } from '@/lib/email/engagement-stats'

export interface EmailPlatformListProgress {
  list_id: number
  list_status: string
  item_count: number
  pending_count: number
  queued_count: number
  sending_count: number
  sent_count: number
  delivered_count: number
  failed_count: number
  skipped_count: number
  bounced_count: number
  unsubscribed_count: number
  opted_out_count: number
}

export interface EmailPlatformStats {
  draft_status: string | null
  sent_via: string | null
  list: EmailPlatformListProgress | null
  engagement: EmailEngagementStats
}

export function useEmailPlatformStats(
  campaignId?: number | null,
  draftId?: number | null,
) {
  const ready = !!campaignId && !!draftId
  return useQuery({
    queryKey: ['email-platform-stats', campaignId, draftId],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/emails/${draftId}/platform-stats`,
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load email stats')
      return json as EmailPlatformStats
    },
    enabled: ready,
    refetchInterval: (query) => {
      const status = query.state.data?.list?.list_status
      if (status === 'queued' || status === 'sending') return 10_000
      // Keep polling after send so opens/clicks appear when the webhook lands.
      if (status === 'sent' || status === 'completed') return 30_000
      return false
    },
  })
}

export function hasPlatformSend(stats: EmailPlatformStats | undefined): boolean {
  if (!stats) return false
  return !!stats.list || stats.engagement.total > 0
}
