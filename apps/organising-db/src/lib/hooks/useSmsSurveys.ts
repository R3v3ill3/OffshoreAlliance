'use client'

/**
 * TanStack Query hooks for the SMS survey module (Phase 4 + lifecycle).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type {
  SmsBallotDetail,
  SmsSurveyPauseMode,
  SmsSurveyQuestionRow,
  SmsSurveyRow,
  VwSmsSurveyFunnelRow,
  VwSmsSurveyQuestionStatsRow,
} from '@/types/sms'
import type {
  SurveyQuestionInput,
  SurveySettingsInput,
} from '@/lib/sms/survey-validation'
import type { IntegrityFinding } from '@/lib/sms/survey-integrity'

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

export interface SurveyLaunchPreview {
  ok: true
  invitable: number
  opted_out: number
  skipped_no_phone: number
  question_count: number
  timezone: string
  blackout_override: boolean
  within_window: boolean
  next_window_at: string
  is_test: boolean
}

async function toError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({ error: fallback }))
  const message = err.error || fallback
  const error = new Error(message) as Error & {
    findings?: IntegrityFinding[]
    status?: number
  }
  if (Array.isArray(err.findings)) error.findings = err.findings
  error.status = res.status
  return error
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

/** Compact catalogue row for cross-campaign duplication. */
export interface SmsSurveyCatalogueRow {
  survey_id: number
  campaign_id: number
  campaign_name: string
  title: string
  status: string
  purpose: string
  question_count: number
  created_at: string
  updated_at: string
}

/** Org-wide survey list (any campaign the staff client can read). */
export function useSmsSurveyCatalogue(enabled = true) {
  return useQuery({
    queryKey: ['sms-surveys-catalogue'],
    queryFn: async () => {
      const res = await fetchApi('/api/sms/surveys')
      if (!res.ok) throw await toError(res, 'Failed to fetch SMS surveys')
      return res.json() as Promise<SmsSurveyCatalogueRow[]>
    },
    enabled,
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
      return res.json() as Promise<{
        ok: true
        version?: number
        findings?: IntegrityFinding[]
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

export function useDeleteSmsSurvey(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      surveyId,
      confirm,
    }: {
      surveyId: number
      confirm?: string
    }) => {
      const qs = confirm ? `?confirm=${encodeURIComponent(confirm)}` : ''
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-surveys/${surveyId}${qs}`,
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

export type SurveyLifecycleAction =
  | 'open'
  | 'close'
  | 'pause'
  | 'resume'
  | 'promote'
  | 'preview'

export function useSmsSurveyAction(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      surveyId,
      action,
      audience,
      pause_mode,
    }: {
      surveyId: number
      action: SurveyLifecycleAction
      audience?: SurveyAudience
      pause_mode?: SmsSurveyPauseMode
    }) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-surveys/${surveyId}/actions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, audience, pause_mode }),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to update SMS survey')
      return res.json() as Promise<{
        ok: true
        sessions_created?: number
        opted_out?: number
        skipped_no_phone?: number
        expired_sessions?: number
        survey_id?: number
        invitable?: number
        question_count?: number
        timezone?: string
        blackout_override?: boolean
        within_window?: boolean
        next_window_at?: string
        is_test?: boolean
        status?: string
        pause_mode?: SmsSurveyPauseMode
      }>
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ['sms-surveys', String(campaignId)],
      })
      queryClient.invalidateQueries({
        queryKey: ['sms-survey', String(campaignId), vars.surveyId],
      })
      if (_data.survey_id != null) {
        queryClient.invalidateQueries({
          queryKey: ['sms-survey', String(campaignId), _data.survey_id],
        })
      }
    },
  })
}
