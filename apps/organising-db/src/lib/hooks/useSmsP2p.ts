'use client'

/**
 * TanStack Query hooks for the P2P chat board (the 'chat' pathway).
 * Data access goes through the campaign-scoped /sms-lists/[listId]/p2p*
 * routes. The board is a live session: ignore the app-wide 5-minute
 * staleTime, poll every 10s while the sheet is open, and always
 * refetch on remount (closing/reopening the sheet).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type { SmsP2pBoardPayload, SmsP2pSendResponse } from '@/types/sms'

/** How often the open chat-board sheet reloads thread/reply state. */
export const P2P_BOARD_POLL_MS = 10_000

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
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: P2P_BOARD_POLL_MS,
    refetchIntervalInBackground: true,
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

export function useSmsP2pSetItemBody(
  campaignId: number | string,
  listId: number | null,
) {
  const invalidate = useInvalidateP2p(campaignId, listId)
  return useMutation({
    mutationFn: async (input: { itemId: number; body: string | null }) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-lists/${listId}/p2p`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set_item_body',
            item_id: input.itemId,
            body: input.body,
          }),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to save initiating message')
      return res.json() as Promise<{ ok: true; body_override: string | null }>
    },
    onSuccess: invalidate,
  })
}

/**
 * Rewrite the board's shared opener mid-session. Sent rows keep the
 * text they went out with; remaining rows pick up the new wording
 * unless they carry a per-person override.
 */
export function useSmsP2pSetBoardBody(
  campaignId: number | string,
  listId: number | null,
) {
  const invalidate = useInvalidateP2p(campaignId, listId)
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-lists/${listId}/p2p`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_board_body', body }),
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to save the board message')
      return res.json() as Promise<{ ok: true; body: string }>
    },
    onSuccess: invalidate,
  })
}

/**
 * Mark a board conversation complete (or reopen it), reusing the
 * inbox's conversation endpoint so close semantics — state, unread
 * reset, closed_at/closed_by — stay in one place. Invalidates the
 * board so the row greys out, loses its state colour and sinks.
 */
export function useSmsP2pSetConversationClosed(
  campaignId: number | string,
  listId: number | null,
) {
  const invalidate = useInvalidateP2p(campaignId, listId)
  return useMutation({
    mutationFn: async (input: { conversationId: number; close: boolean }) => {
      const res = await fetchApi(`/api/sms/conversations/${input.conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: input.close ? 'close' : 'reopen' }),
      })
      if (!res.ok) {
        throw await toError(
          res,
          input.close
            ? 'Failed to mark the chat complete'
            : 'Failed to reopen the chat',
        )
      }
      return res.json() as Promise<unknown>
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
