'use client'

/**
 * TanStack Query hooks for the P2P chat board (the 'chat' pathway).
 * Data access goes through the campaign-scoped /sms-lists/[listId]/p2p*
 * routes; board data polls every 30 s so reply/thread state stays
 * fresh during a session.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type { SmsP2pBoardPayload, SmsP2pSendResponse } from '@/types/sms'

async function toError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({ error: fallback }))
  return new Error((err as { error?: string }).error || fallback)
}

export function useSmsP2pBoard(
  campaignId: number | string,
  listId: number | null,
) {
  return useQuery({
    queryKey: ['sms-p2p-board', String(campaignId), listId],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-lists/${listId}/p2p`,
      )
      if (!res.ok) throw await toError(res, 'Failed to load chat board')
      return res.json() as Promise<SmsP2pBoardPayload>
    },
    enabled: !!campaignId && listId != null,
    refetchInterval: 30_000,
  })
}

function useInvalidateP2p(campaignId: number | string, listId: number | null) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({
      queryKey: ['sms-p2p-board', String(campaignId), listId],
    })
    queryClient.invalidateQueries({ queryKey: ['sms-lists', String(campaignId)] })
    queryClient.invalidateQueries({ queryKey: ['sms-conversations'] })
  }
}

export function useSmsP2pSend(
  campaignId: number | string,
  listId: number | null,
) {
  const invalidate = useInvalidateP2p(campaignId, listId)
  return useMutation({
    mutationFn: async (itemIds: number[]) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-lists/${listId}/p2p-send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_ids: itemIds }),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to send chat initials')
      return res.json() as Promise<SmsP2pSendResponse>
    },
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export interface AddP2pPeopleInput {
  worker_ids?: number[]
  audience?:
    | { type: 'worker_list'; worker_list_id: number }
    | { type: 'campaign' }
}

export function useSmsP2pAddPeople(
  campaignId: number | string,
  listId: number | null,
) {
  const invalidate = useInvalidateP2p(campaignId, listId)
  return useMutation({
    mutationFn: async (input: AddP2pPeopleInput) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-lists/${listId}/p2p`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to add people')
      return res.json() as Promise<{
        ok: true
        added: number
        already_on_board: number
        opted_out?: number
        skipped_no_phone?: number
      }>
    },
    onSuccess: invalidate,
  })
}

export function useSmsP2pClose(
  campaignId: number | string,
  listId: number | null,
) {
  const invalidate = useInvalidateP2p(campaignId, listId)
  return useMutation({
    mutationFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-lists/${listId}/p2p`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'close' }),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to close chat board')
      return res.json() as Promise<{ ok: true }>
    },
    onSuccess: invalidate,
  })
}

export interface StartSmsConversationInput {
  worker_id: number
  campaign_id?: number | null
  activity_id?: number | null
  sender_number_id?: number | null
}

/** POST /api/sms/conversations — "Message this member" (Feature 1). */
export function useStartSmsConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: StartSmsConversationInput) => {
      const res = await fetchApi('/api/sms/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw await toError(res, 'Failed to start conversation')
      return res.json() as Promise<{ conversation_id: number; existing: boolean }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['worker-sms-conversations'] })
    },
  })
}
