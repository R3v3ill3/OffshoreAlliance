'use client'

/**
 * TanStack Query hooks for the SMS survey module (Phase 4). All data
 * access goes through the campaign-scoped API routes — the Phase 4
 * tables are not in the generated Database types yet (migration
 * pending apply).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type {
  SmsBallotDetail,
  SmsSurveyQuestionRow,
  SmsSurveyRow,
  VwSmsSurveyFunnelRow,
  VwSmsSurveyQuestionStatsRow,
} from '@/types/sms'
import type {
  SurveyQuestionInput,
  SurveySettingsInput,
} from '@/lib/sms/survey-validation'

export interface SmsSurveyListRow extends SmsSurveyRow {
  question_count: number
  funnel: VwSmsSurveyFunnelRow | null
}

export interface SmsSurveyDetail {
  survey: SmsSurveyRow
  questions: SmsSurveyQuestionRow[]
  funnel: VwSmsSurveyFunnelRow | null
  question_stats: VwSmsSurveyQuestionStatsRow[]
  /** Phase 5: present for non-draft indicative ballots. */
  ballot: SmsBallotDetail | null
}

export interface SaveSurveyInput extends SurveySettingsInput {
  questions?: SurveyQuestionInput[]
}

export type SurveyAudience =
  | { type: 'worker_list'; worker_list_id: number }
  | { type: 'campaign' }

async function toError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({ error: fallback }))
  return new Error(err.error || fallback)
}

export function useSmsSurveys(campaignId: number | string) {
  return useQuery({
    queryKey: ['sms-surveys', String(campaignId)],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/sms-surveys`)
      if (!res.ok) throw await toError(res, 'Failed to fetch SMS surveys')
      return res.json() as Promise<SmsSurveyListRow[]>
    },
    enabled: !!campaignId,
  })
}

export function useSmsSurveyDetail(
  campaignId: number | string,
  surveyId: number | null,
) {
  return useQuery({
    queryKey: ['sms-survey', String(campaignId), surveyId],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-surveys/${surveyId}`,
      )
      if (!res.ok) throw await toError(res, 'Failed to fetch SMS survey')
      return res.json() as Promise<SmsSurveyDetail>
    },
    enabled: !!campaignId && surveyId != null,
  })
}

export function useCreateSmsSurvey(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SaveSurveyInput) => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/sms-surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw await toError(res, 'Failed to create SMS survey')
      return res.json() as Promise<{ survey_id: number }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['sms-surveys', String(campaignId)],
      })
    },
  })
}

export function useUpdateSmsSurvey(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      surveyId,
      ...updates
    }: SaveSurveyInput & { surveyId: number }) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-surveys/${surveyId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to update SMS survey')
      return res.json() as Promise<{ ok: true }>
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ['sms-surveys', String(campaignId)],
      })
      queryClient.invalidateQueries({
        queryKey: ['sms-survey', String(campaignId), vars.surveyId],
      })
    },
  })
}

export function useDeleteSmsSurvey(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (surveyId: number) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-surveys/${surveyId}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw await toError(res, 'Failed to delete SMS survey')
      return res.json() as Promise<{ ok: true }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['sms-surveys', String(campaignId)],
      })
    },
  })
}

export function useSmsSurveyAction(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      surveyId,
      action,
      audience,
    }: {
      surveyId: number
      action: 'open' | 'close'
      audience?: SurveyAudience
    }) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-surveys/${surveyId}/actions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, audience }),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to update SMS survey')
      return res.json() as Promise<{
        ok: true
        sessions_created?: number
        opted_out?: number
        skipped_no_phone?: number
        expired_sessions?: number
      }>
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ['sms-surveys', String(campaignId)],
      })
      queryClient.invalidateQueries({
        queryKey: ['sms-survey', String(campaignId), vars.surveyId],
      })
    },
  })
}
