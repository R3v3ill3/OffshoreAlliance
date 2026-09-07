'use client'

/**
 * Inspect + archive / unarchive / delete for SMS actions. Hub and
 * campaign sheets share this so the guards cannot drift.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type { SmsActionKind } from '@/lib/sms/hub-actions'
import type { SmsActionInspect } from '@/lib/sms/archive-policy'
import { SMS_ACTIVITY_QUERY_KEY, SMS_NUMBERS_QUERY_KEY } from '@/lib/hooks/useSmsHub'

export type { SmsActionInspect }

async function toError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({ error: fallback }))
  const body = err as {
    error?: string
    lifecycle?: string
    needsTypedConfirm?: boolean
    code?: string
  }
  const error = new Error(body.error || fallback) as Error & {
    lifecycle?: string
    needsTypedConfirm?: boolean
    code?: string
    status?: number
  }
  error.lifecycle = body.lifecycle
  error.needsTypedConfirm = body.needsTypedConfirm
  error.code = body.code
  error.status = res.status
  return error
}

export function smsActionInspectKey(
  kind: SmsActionKind,
  id: number | null,
  campaignId?: number | null,
) {
  return ['sms-action-inspect', kind, id, campaignId ?? null] as const
}

export function useSmsActionInspect(
  kind: SmsActionKind,
  id: number | null,
  campaignId?: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: smsActionInspectKey(kind, id, campaignId),
    queryFn: async () => {
      const params = new URLSearchParams({ kind, id: String(id) })
      if (kind !== 'relay') params.set('campaign_id', String(campaignId))
      else if (campaignId != null) params.set('campaign_id', String(campaignId))
      const res = await fetchApi(`/api/sms/actions?${params.toString()}`)
      if (!res.ok) throw await toError(res, 'Failed to inspect SMS action')
      return res.json() as Promise<SmsActionInspect>
    },
    enabled: enabled && id != null && (kind === 'relay' || campaignId != null),
  })
}

export function useSmsActionOp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      kind: SmsActionKind
      id: number
      campaignId?: number | null
      op: 'archive' | 'unarchive' | 'delete'
      confirm?: string
    }) => {
      const res = await fetchApi('/api/sms/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: input.kind,
          id: input.id,
          campaign_id: input.campaignId ?? undefined,
          op: input.op,
          confirm: input.confirm,
        }),
      })
      if (!res.ok) throw await toError(res, 'Failed to update SMS action')
      return res.json() as Promise<{ ok: true; paired: number }>
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: SMS_ACTIVITY_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: SMS_NUMBERS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ['sms-lists'] })
      void queryClient.invalidateQueries({ queryKey: ['sms-list'] })
      void queryClient.invalidateQueries({ queryKey: ['sms-surveys'] })
      void queryClient.invalidateQueries({ queryKey: ['sms-survey'] })
      void queryClient.invalidateQueries({ queryKey: ['sms-relays'] })
      void queryClient.invalidateQueries({ queryKey: ['sms-relay'] })
      void queryClient.invalidateQueries({ queryKey: ['sms-episodes'] })
      void queryClient.invalidateQueries({ queryKey: ['sms-p2p-board'] })
      void queryClient.invalidateQueries({
        queryKey: smsActionInspectKey(vars.kind, vars.id, vars.campaignId),
      })
    },
  })
}
