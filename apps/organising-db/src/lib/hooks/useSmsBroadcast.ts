'use client'

/**
 * TanStack Query hooks for the SMS broadcast module (Phase 1).
 * All data access goes through the campaign-scoped API routes — the
 * Phase 1 tables are not in the generated Database types yet
 * (migration pending apply), so the typed browser client can't query
 * them directly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type {
  SmsListItemStatus,
  SmsListRow,
  VwSmsCampaignSummaryRowWithMode,
} from '@/types/sms'

export interface SmsSenderOption {
  number_id: number
  phone_e164: string
  label: string | null
  purpose: string
  organiser_id: number | null
  organiser_name: string | null
  is_mine: boolean
  /** Mobile Message sender type (`own`, `dedicated_number`, `alpha`, …). */
  provider_type?: string | null
  /**
   * Whether replies to this number land in OA (dedicated/shared MM
   * number). `false` = handset or one-way sender ID. `null` = could
   * not ask the provider.
   */
  supports_inbound?: boolean | null
}

export interface SmsListDetailItem {
  item_id: number
  worker_id: number
  worker_name: string
  phone_e164: string | null
  sort_order: number
  status: SmsListItemStatus
  failure_reason: string | null
  sent_at: string | null
  delivered_at: string | null
  send_before: string | null
}

export interface SmsListDetail {
  list: SmsListRow
  draft: { draft_id: number; body: string; status: string } | null
  items: SmsListDetailItem[]
}

async function toError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({ error: fallback }))
  return new Error(err.error || fallback)
}

/**
 * Blasts are drained by a background cron (every ~5 min), so a
 * just-queued list keeps showing 'queued' until the dispatcher runs and
 * a manual refresh lands. While any list/item is still in flight we poll
 * so the status advances on its own; polling stops once everything has
 * settled (no query left running against a fully-dispatched list).
 */
const ACTIVE_LIST_STATUSES = new Set(['queued', 'sending'])
const ACTIVE_ITEM_STATUSES = new Set(['pending', 'queued', 'sending'])
/** Poll cadence while a blast is mid-dispatch. */
const SMS_ACTIVE_POLL_MS = 10_000

export function useSmsLists(campaignId: number | string | null | undefined) {
  return useQuery({
    queryKey: ['sms-lists', String(campaignId ?? '')],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/sms-lists`)
      if (!res.ok) throw await toError(res, 'Failed to fetch SMS lists')
      return res.json() as Promise<VwSmsCampaignSummaryRowWithMode[]>
    },
    enabled: campaignId != null && campaignId !== '',
    // Advance 'queued' → 'sending' → 'sent' without a manual refresh.
    refetchInterval: (query) => {
      const rows = query.state.data as
        | VwSmsCampaignSummaryRowWithMode[]
        | undefined
      const hasActive = (rows ?? []).some((r) =>
        ACTIVE_LIST_STATUSES.has(r.list_status),
      )
      return hasActive ? SMS_ACTIVE_POLL_MS : false
    },
  })
}

export function useSmsListDetail(
  campaignId: number | string,
  listId: number | null,
) {
  return useQuery({
    queryKey: ['sms-list', String(campaignId), listId],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/sms-lists/${listId}`)
      if (!res.ok) throw await toError(res, 'Failed to fetch SMS list')
      return res.json() as Promise<SmsListDetail>
    },
    enabled: !!campaignId && listId != null,
    // Poll the open detail sheet while the list is dispatching or any
    // recipient is still pending/queued/sending, so per-recipient rows
    // move to sent/delivered live. Stops once the list has drained.
    refetchInterval: (query) => {
      const data = query.state.data as SmsListDetail | undefined
      if (!data) return false
      const listActive = ACTIVE_LIST_STATUSES.has(data.list.status)
      const itemsActive = data.items.some((i) =>
        ACTIVE_ITEM_STATUSES.has(i.status),
      )
      return listActive || itemsActive ? SMS_ACTIVE_POLL_MS : false
    },
  })
}

export function useSmsSenders() {
  return useQuery({
    queryKey: ['sms-senders'],
    queryFn: async () => {
      const res = await fetchApi('/api/sms/senders')
      if (!res.ok) throw await toError(res, 'Failed to fetch sender numbers')
      return res.json() as Promise<SmsSenderOption[]>
    },
  })
}

export interface CreateSmsBlastInput {
  name: string
  body: string
  sender_number_id?: number
  timezone?: string
  blackout_override?: boolean
  blackout_override_reason?: string
  scheduled_for?: string | null
  /** 'blast' (default) or 'p2p' (chat-board working list). */
  mode?: 'blast' | 'p2p'
  /** Omit to create a draft and attach a list later. */
  audience?:
    | { type: 'worker_list'; worker_list_id: number }
    | { type: 'campaign' }
}

export function useCreateSmsBlast(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateSmsBlastInput) => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/sms-lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw await toError(res, 'Failed to create SMS blast')
      return res.json() as Promise<{
        sms_list_id: number
        draft_id: number
        total_items: number
        opted_out: number
        skipped_no_phone: number
      }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-lists', String(campaignId)] })
    },
  })
}

export function useAttachSmsAudience(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      listId: number
      audience:
        | { type: 'worker_list'; worker_list_id: number }
        | { type: 'campaign' }
    }) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-lists/${input.listId}/audience`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audience: input.audience }),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to attach audience')
      return res.json() as Promise<{
        sms_list_id: number
        total_items: number
        opted_out: number
        skipped_no_phone: number
      }>
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['sms-lists', String(campaignId)] })
      queryClient.invalidateQueries({
        queryKey: ['sms-list', String(campaignId), vars.listId],
      })
    },
  })
}

export interface UpdateSmsBlastInput {
  listId: number
  name?: string
  body?: string
  sender_number_id?: number | null
  timezone?: string
  blackout_override?: boolean
  blackout_override_reason?: string | null
  scheduled_for?: string | null
}

export function useUpdateSmsBlast(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ listId, ...updates }: UpdateSmsBlastInput) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-lists/${listId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to update SMS blast')
      return res.json() as Promise<{ ok: true }>
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['sms-lists', String(campaignId)] })
      queryClient.invalidateQueries({
        queryKey: ['sms-list', String(campaignId), vars.listId],
      })
    },
  })
}

export type SmsListAction = 'queue' | 'pause' | 'resume' | 'cancel'

export function useSmsListAction(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      listId,
      action,
    }: {
      listId: number
      action: SmsListAction
    }) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-lists/${listId}/actions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to update SMS list')
      return res.json() as Promise<{ ok: true; queued?: number }>
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['sms-lists', String(campaignId)] })
      queryClient.invalidateQueries({
        queryKey: ['sms-list', String(campaignId), vars.listId],
      })
    },
  })
}

export function useSmsTestSend(campaignId: number | string) {
  return useMutation({
    mutationFn: async (input: {
      to: string
      body: string
      sender_number_id: number
    }) => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/sms/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw await toError(res, 'Failed to send test SMS')
      return res.json() as Promise<{
        ok: true
        provider: string
        status: string
        segments: number
        encoding: string
      }>
    },
  })
}
