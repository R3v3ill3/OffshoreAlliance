'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type { SmsEpisodeKind } from '@/lib/sms/sms-episode'
import type {
  VwSmsCampaignSummaryRowWithMode,
  VwSmsSurveyFunnelRow,
} from '@/types/sms'

export interface SmsEpisodeSurveyRow {
  survey_id: number
  title: string
  status: string
  is_test: boolean
  purpose: string
  question_count: number
  funnel: VwSmsSurveyFunnelRow | null
  created_at: string
}

export interface SmsEpisodeRow {
  campaign_id: number
  name: string
  created_at: string
  created_by: string | null
  lists: VwSmsCampaignSummaryRowWithMode[]
  surveys: SmsEpisodeSurveyRow[]
}

async function toError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({ error: fallback }))
  return new Error((err as { error?: string }).error || fallback)
}

export function useSmsEpisodes(enabled = true) {
  return useQuery({
    queryKey: ['sms-episodes'],
    queryFn: async () => {
      const res = await fetchApi('/api/sms/episodes')
      if (!res.ok) throw await toError(res, 'Failed to fetch standalone SMS')
      return res.json() as Promise<SmsEpisodeRow[]>
    },
    enabled,
  })
}

export function useCreateSmsEpisode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input?: { name?: string; kind?: SmsEpisodeKind }) => {
      const res = await fetchApi('/api/sms/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input ?? {}),
      })
      if (!res.ok) throw await toError(res, 'Failed to start standalone SMS')
      return res.json() as Promise<SmsEpisodeRow>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-episodes'] })
    },
  })
}

export function useRenameSmsEpisode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { campaignId: number | string; name: string }) => {
      const res = await fetchApi(`/api/sms/episodes/${input.campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.name }),
      })
      if (!res.ok) throw await toError(res, 'Failed to rename standalone SMS')
      return res.json() as Promise<{ campaign_id: number; name: string }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-episodes'] })
    },
  })
}

export function useDeleteSmsEpisode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (campaignId: number | string) => {
      const res = await fetchApi(`/api/sms/episodes/${campaignId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw await toError(res, 'Failed to discard standalone SMS')
      return res.json() as Promise<{ ok: boolean }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-episodes'] })
    },
  })
}
