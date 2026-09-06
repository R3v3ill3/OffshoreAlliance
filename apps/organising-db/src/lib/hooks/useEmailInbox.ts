'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS } from '@/lib/api/fetch-api'
import { excludeSmsEpisodes } from '@/lib/campaign/visible-campaigns'
import type {
  EmailCannedReply,
  EmailConversationDetail,
  EmailConversationListItem,
  EmailInboxTab,
} from '@/types/email-inbox'

const LIST_PAGE = 50

async function toError(res: Response, fallback: string): Promise<Error> {
  const payload = await res.json().catch(() => ({ error: fallback }))
  return new Error(payload.error || fallback)
}

export interface EmailInboxCampaignOption {
  campaign_id: number
  name: string
  status: string
}

const CAMPAIGN_STATUS_RANK: Record<string, number> = {
  active: 0,
  planning: 1,
  completed: 2,
  suspended: 3,
}

export function useEmailInboxCampaigns() {
  return useQuery({
    queryKey: ['email-inbox-campaigns'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await excludeSmsEpisodes(
        supabase
          .from('campaigns')
          .select('campaign_id, name, status')
          .order('name'),
      )
      if (error) throw error
      return ([...(data ?? [])] as EmailInboxCampaignOption[]).sort((a, b) => {
        const status =
          (CAMPAIGN_STATUS_RANK[a.status] ?? 9) -
          (CAMPAIGN_STATUS_RANK[b.status] ?? 9)
        return status || a.name.localeCompare(b.name)
      })
    },
    staleTime: 60_000,
  })
}

export interface EmailConversationFilters {
  inbox: EmailInboxTab
  campaignId?: number | null
  search?: string
  unreadOnly?: boolean
  workerId?: number
}

interface EmailConversationCursor {
  lastMessageAt: string | null
  conversationId: number
}

export function useEmailConversations(filters: EmailConversationFilters) {
  return useInfiniteQuery({
    queryKey: [
      'email-conversations',
      filters.inbox,
      filters.campaignId ?? null,
      filters.search ?? '',
      filters.unreadOnly ?? false,
      filters.workerId ?? null,
    ],
    initialPageParam: null as EmailConversationCursor | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        inbox: filters.inbox,
        limit: String(LIST_PAGE),
      })
      if (pageParam != null) {
        params.set('cursor_at', pageParam.lastMessageAt ?? '__null__')
        params.set('cursor_id', String(pageParam.conversationId))
      }
      if (filters.campaignId != null) {
        params.set('campaign_id', String(filters.campaignId))
      }
      if (filters.search) params.set('search', filters.search)
      if (filters.unreadOnly) params.set('unread', 'true')
      if (filters.workerId != null) params.set('worker_id', String(filters.workerId))
      const res = await fetchApi(`/api/email/conversations?${params}`)
      if (!res.ok) throw await toError(res, 'Failed to load email conversations')
      return res.json() as Promise<EmailConversationListItem[]>
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length !== LIST_PAGE) return undefined
      const last = lastPage[lastPage.length - 1]
      return {
        lastMessageAt: last.last_message_at,
        conversationId: last.conversation_id,
      } satisfies EmailConversationCursor
    },
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  })
}

export function useEmailConversationDetail(conversationId: number | null) {
  return useInfiniteQuery({
    queryKey: ['email-conversation', conversationId],
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (pageParam != null) params.set('before', String(pageParam))
      const query = params.size ? `?${params}` : ''
      const res = await fetchApi(
        `/api/email/conversations/${conversationId}${query}`,
      )
      if (!res.ok) throw await toError(res, 'Failed to load email conversation')
      return res.json() as Promise<EmailConversationDetail>
    },
    getNextPageParam: (lastPage) =>
      lastPage.has_more_messages && lastPage.messages.length > 0
        ? lastPage.messages[0].message_id
        : undefined,
    enabled: conversationId != null,
  })
}

export function mergeEmailDetailPages(
  pages: EmailConversationDetail[] | undefined,
): EmailConversationDetail | null {
  if (!pages?.length) return null
  const latest = pages[0]
  const messages = [...pages]
    .reverse()
    .flatMap((page) => page.messages)
    .filter(
      (message, index, rows) =>
        rows.findIndex((candidate) => candidate.message_id === message.message_id) ===
        index,
    )
  return {
    ...latest,
    messages,
    has_more_messages: pages[pages.length - 1].has_more_messages,
  }
}

function useInvalidateEmailConversation(conversationId: number | null) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['email-conversation', conversationId] })
    void queryClient.invalidateQueries({ queryKey: ['email-conversations'] })
    void queryClient.invalidateQueries({ queryKey: ['email-inbox-unread'] })
  }
}

export type EmailConversationAction =
  | { action: 'assign'; user_id: string | null }
  | { action: 'close' }
  | { action: 'reopen' }
  | { action: 'mark_read' }
  | { action: 'attach'; campaign_id: number | null }
  | { action: 'match_worker'; worker_id: number }
  | { action: 'set_opt_out'; opt_out: boolean }

export function useEmailConversationAction(conversationId: number | null) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateEmailConversation(conversationId)
  return useMutation({
    mutationFn: async (action: EmailConversationAction) => {
      const res = await fetchApi(`/api/email/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      })
      if (!res.ok) throw await toError(res, 'Failed to update conversation')
      return res.json() as Promise<Partial<EmailConversationListItem>>
    },
    onMutate: (action) => {
      if (action.action !== 'mark_read' || conversationId == null) return
      queryClient.setQueriesData(
        { queryKey: ['email-conversations'] },
        (current: unknown) => {
          if (
            !current ||
            typeof current !== 'object' ||
            !('pages' in current) ||
            !Array.isArray(current.pages)
          ) {
            return current
          }
          return {
            ...current,
            pages: current.pages.map((page: EmailConversationListItem[]) =>
              page.map((conversation) =>
                conversation.conversation_id === conversationId
                  ? { ...conversation, unread_count: 0 }
                  : conversation,
              ),
            ),
          }
        },
      )
    },
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export type BulkEmailConversationAction =
  | { action: 'assign'; user_id: string | null }
  | { action: 'mark_read' }
  | { action: 'close' }
  | { action: 'attach'; campaign_id: number | null }

export function useBulkEmailConversationAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      conversation_ids: number[]
      operation: BulkEmailConversationAction
    }) => {
      const res = await fetchApi('/api/email/conversations/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw await toError(res, 'Failed to update conversations')
      return res.json() as Promise<{ updated: number }>
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['email-conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['email-conversation'] })
      void queryClient.invalidateQueries({ queryKey: ['email-queue-counts'] })
      void queryClient.invalidateQueries({ queryKey: ['email-inbox-unread'] })
    },
  })
}

export interface EmailQueueCounts {
  mine: number
  needs_response: number
  unassigned: number
  triage: number
  waiting: number
  team: number
  closed: number
  all: number
}

export function useEmailQueueCounts(campaignId?: number | null) {
  return useQuery({
    queryKey: ['email-queue-counts', campaignId ?? null],
    queryFn: async () => {
      const params =
        campaignId != null ? `?campaign_id=${encodeURIComponent(campaignId)}` : ''
      const res = await fetchApi(`/api/email/conversations/counts${params}`)
      if (!res.ok) throw await toError(res, 'Failed to load queue counts')
      return res.json() as Promise<EmailQueueCounts>
    },
    refetchInterval: 30_000,
  })
}

export interface SendEmailReplyInput {
  body: string
  subject: string
  attachments: File[]
}

export function useSendEmailReply(conversationId: number | null) {
  const invalidate = useInvalidateEmailConversation(conversationId)
  return useMutation({
    mutationFn: async ({ body, subject, attachments }: SendEmailReplyInput) => {
      const form = new FormData()
      form.set('body_text', body)
      form.set('subject', subject)
      for (const file of attachments) form.append('attachments', file)
      const res = await fetchApi(
        `/api/email/conversations/${conversationId}/reply`,
        {
          method: 'POST',
          body: form,
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        },
      )
      if (!res.ok) throw await toError(res, 'Failed to send email reply')
      return res.json() as Promise<{
        success: true
        message_id: number | null
        attachment_warnings?: string[]
        persistence_warnings?: string[]
      }>
    },
    onSuccess: invalidate,
  })
}

export function useAddEmailNote(conversationId: number | null) {
  const invalidate = useInvalidateEmailConversation(conversationId)
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await fetchApi(`/api/email/conversations/${conversationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw await toError(res, 'Failed to add note')
      return res.json()
    },
    onSuccess: invalidate,
  })
}

export function useEmailCannedReplies(campaignId?: number | null) {
  return useQuery({
    queryKey: ['email-canned-replies', campaignId ?? null],
    queryFn: async () => {
      const params =
        campaignId != null ? `?campaign_id=${encodeURIComponent(campaignId)}` : ''
      const res = await fetchApi(`/api/email/canned-replies${params}`)
      if (!res.ok) throw await toError(res, 'Failed to load saved replies')
      return res.json() as Promise<EmailCannedReply[]>
    },
  })
}

export function useCreateEmailCannedReply() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      body: string
      campaign_id: number | null
    }) => {
      const res = await fetchApi('/api/email/canned-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw await toError(res, 'Failed to save reply')
      return res.json()
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['email-canned-replies'] }),
  })
}

export function useArchiveEmailCannedReply() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (replyId: number) => {
      const res = await fetchApi(`/api/email/canned-replies/${replyId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw await toError(res, 'Failed to archive saved reply')
      return res.json() as Promise<{ archived: boolean }>
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['email-canned-replies'] }),
  })
}

export function useEmailInboxUnreadCount(enabled = true) {
  return useQuery({
    queryKey: ['email-inbox-unread'],
    queryFn: async () => {
      const res = await fetchApi('/api/email/conversations/unread-count')
      if (!res.ok) throw await toError(res, 'Failed to load unread count')
      const payload = (await res.json()) as { count: number }
      return payload.count
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    enabled,
  })
}

export interface EmailPresencePeer {
  userId: string
  name: string
  typing: boolean
}

export function useEmailConversationClaim(conversationId: number | null) {
  const [state, setState] = useState<{
    claimed: boolean
    holderName: string | null
  }>({ claimed: false, holderName: null })

  useEffect(() => {
    if (conversationId == null) return
    let cancelled = false
    const claim = async () => {
      try {
        const res = await fetchApi(
          `/api/email/conversations/${conversationId}/claim`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttl_minutes: 5 }),
          },
        )
        if (!res.ok) return
        const payload = (await res.json()) as {
          claimed: boolean
          holder_name?: string | null
        }
        if (!cancelled) {
          setState({
            claimed: payload.claimed,
            holderName: payload.claimed ? null : payload.holder_name ?? null,
          })
        }
      } catch {
        // Claims are advisory and must never block the reply workflow.
      }
    }
    void claim()
    const timer = setInterval(() => void claim(), 2 * 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
      void fetchApi(`/api/email/conversations/${conversationId}/claim`, {
        method: 'DELETE',
      }).catch(() => undefined)
    }
  }, [conversationId])

  return state
}

export function useEmailConversationRealtime(conversationId: number | null) {
  const queryClient = useQueryClient()
  const [viewers, setViewers] = useState<EmailPresencePeer[]>([])
  const trackRef = useRef<((typing: boolean) => void) | null>(null)

  useEffect(() => {
    if (conversationId == null) return
    const supabase = createClient()
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let channel: ReturnType<typeof supabase.channel> | null = null

    const invalidate = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        void queryClient.invalidateQueries({
          queryKey: ['email-conversation', conversationId],
        })
        void queryClient.invalidateQueries({ queryKey: ['email-conversations'] })
        void queryClient.invalidateQueries({ queryKey: ['email-inbox-unread'] })
      }, 400)
    }

    const start = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || disposed) return
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle()
      if (disposed) return
      const selfName = profile?.display_name || user.email || 'Someone'
      channel = supabase.channel(`email-conversation:${conversationId}`, {
        config: { private: true, presence: { key: user.id } },
      })
      const sync = () => {
        if (!channel) return
        const peers: EmailPresencePeer[] = []
        const state = channel.presenceState<{
          user_id: string
          name: string
          typing: boolean
        }>()
        for (const metas of Object.values(state)) {
          for (const meta of metas) {
            if (!meta.user_id || meta.user_id === user.id) continue
            peers.push({
              userId: meta.user_id,
              name: meta.name || 'Someone',
              typing: !!meta.typing,
            })
          }
        }
        if (!disposed) setViewers(peers)
      }
      channel
        .on('presence', { event: 'sync' }, sync)
        .on('presence', { event: 'join' }, sync)
        .on('presence', { event: 'leave' }, sync)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'email_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          invalidate,
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'email_conversations',
            filter: `conversation_id=eq.${conversationId}`,
          },
          invalidate,
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'email_conversation_notes',
            filter: `conversation_id=eq.${conversationId}`,
          },
          invalidate,
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            void channel?.track({
              user_id: user.id,
              name: selfName,
              typing: false,
            })
          }
        })
      trackRef.current = (typing) => {
        void channel?.track({ user_id: user.id, name: selfName, typing })
      }
    }
    void start()

    return () => {
      disposed = true
      trackRef.current = null
      if (timer) clearTimeout(timer)
      if (channel) void supabase.removeChannel(channel)
      setViewers([])
    }
  }, [conversationId, queryClient])

  return useMemo(
    () => ({
      viewers,
      someoneElseTyping: viewers.some((viewer) => viewer.typing),
      setTyping: (typing: boolean) => trackRef.current?.(typing),
    }),
    [viewers],
  )
}

export async function getEmailAttachmentUrl(attachmentId: number): Promise<string> {
  const res = await fetchApi(`/api/email/attachments/${attachmentId}`)
  if (!res.ok) throw await toError(res, 'Failed to open attachment')
  const payload = (await res.json()) as { url: string }
  return payload.url
}

export async function openEmailAttachment(attachmentId: number) {
  const url = await getEmailAttachmentUrl(attachmentId)
  window.open(url, '_blank', 'noopener,noreferrer')
}
