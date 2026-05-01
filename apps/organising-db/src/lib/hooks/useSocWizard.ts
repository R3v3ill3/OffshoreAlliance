/**
 * Hooks for the SOC wizard: session CRUD, stage content CRUD, the SSE
 * coach stream consumer, and artifact derivation.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import {
  fetchApi,
  API_FETCH_TIMEOUT_LLM_MS,
  API_FETCH_TIMEOUT_STREAM_MS,
} from '@/lib/api/fetch-api'
import type { HopeFrame, SocStage } from '@/lib/prompts/soc-framework'
import type { SocSessionPopulation } from '@/lib/prompts/soc/populations'

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export interface SocSessionRow {
  session_id: number
  campaign_id: number | null
  plan_id: number | null
  stage_number: number | null
  capacity_id: number | null
  title: string
  target_populations: SocSessionPopulation[]
  context_snapshot: Record<string, unknown>
  custom_situation: string | null
  status: 'draft' | 'complete' | 'exported' | 'archived'
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SocStageContentRow {
  content_id: number
  session_id: number
  stage_number: number
  stage_name: string
  locked_content: string
  organiser_notes: string | null
  populations_targeted: SocSessionPopulation[]
  hope_frame: HopeFrame | null
  population_index: number | null
  locked_at: string
  locked_by: string | null
}

export interface SocChatTurnRow {
  turn_id: number
  session_id: number
  stage_number: number
  hope_frame: HopeFrame | null
  population_index: number | null
  turn_index: number
  role: 'user' | 'assistant' | 'system'
  content: string
  ai_metadata: Record<string, unknown> | null
  created_at: string
}

// ---------------------------------------------------------------
// useSocSession — load + create + update soc_sessions rows
// ---------------------------------------------------------------

export function useSocSession(session_id: number | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['soc-session', session_id],
    enabled: !!session_id && session_id > 0,
    queryFn: async (): Promise<SocSessionRow | null> => {
      if (!session_id) return null
      const { data, error } = await supabase
        .from('soc_sessions')
        .select('*')
        .eq('session_id', session_id)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as SocSessionRow) ?? null
    },
  })
}

export function useCreateSocSession() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useAuthAwareMutation({
    mutationFn: async (payload: {
      campaign_id?: number | null
      plan_id?: number | null
      stage_number?: number | null
      capacity_id?: number | null
      title: string
      target_populations?: SocSessionPopulation[]
      context_snapshot?: Record<string, unknown>
      custom_situation?: string | null
    }): Promise<SocSessionRow> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('soc_sessions')
        .insert({
          campaign_id: payload.campaign_id ?? null,
          plan_id: payload.plan_id ?? null,
          stage_number: payload.stage_number ?? null,
          capacity_id: payload.capacity_id ?? null,
          title: payload.title,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          target_populations: (payload.target_populations ?? []) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context_snapshot: (payload.context_snapshot ?? {}) as any,
          custom_situation: payload.custom_situation ?? null,
          created_by: user.id,
        })
        .select()
        .single()
      if (error) throw error

      // If this session links to a capacity, flip its status to in_progress
      if (payload.capacity_id) {
        await supabase
          .from('plan_capacities')
          .update({ status: 'in_progress' })
          .eq('capacity_id', payload.capacity_id)
          .in('status', ['needed', 'gap'])
      }
      return data as unknown as SocSessionRow
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soc-sessions-list'] })
    },
  })
}

export function useUpdateSocSession() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  return useAuthAwareMutation({
    mutationFn: async (payload: {
      session_id: number
      patch: Partial<Pick<SocSessionRow, 'title' | 'target_populations' | 'custom_situation' | 'context_snapshot' | 'status'>>
    }) => {
      const { error } = await supabase
        .from('soc_sessions')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(payload.patch as any)
        .eq('session_id', payload.session_id)
      if (error) throw error
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['soc-session', variables.session_id] })
    },
  })
}

export function useSocSessionsForCapacity(args: {
  campaign_id: number
  stage_number: number
  capacity_id?: number
}) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['soc-sessions-list', args.campaign_id, args.stage_number, args.capacity_id ?? null],
    enabled: args.campaign_id > 0,
    queryFn: async (): Promise<SocSessionRow[]> => {
      let q = supabase
        .from('soc_sessions')
        .select('*')
        .eq('campaign_id', args.campaign_id)
        .eq('stage_number', args.stage_number)
        .order('created_at', { ascending: false })
      if (args.capacity_id) q = q.eq('capacity_id', args.capacity_id)
      const { data, error } = await q
      if (error) throw error
      return (data || []) as unknown as SocSessionRow[]
    },
  })
}

// ---------------------------------------------------------------
// useSocStageContent — locked content + lock/regenerate mutations
// ---------------------------------------------------------------

export function useSocStageContent(session_id: number | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['soc-stage-content', session_id],
    enabled: !!session_id && session_id > 0,
    queryFn: async (): Promise<SocStageContentRow[]> => {
      if (!session_id) return []
      const { data, error } = await supabase
        .from('soc_stage_content')
        .select('*')
        .eq('session_id', session_id)
        .order('stage_number', { ascending: true })
      if (error) throw error
      return (data || []) as unknown as SocStageContentRow[]
    },
  })
}

export function useLockStage() {
  const queryClient = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (payload: {
      session_id: number
      stage_number: SocStage
      hope_frame?: HopeFrame
      population_index?: number | null
      stage_name: string
      locked_content: string
      organiser_notes?: string
      populations_targeted?: SocSessionPopulation[]
    }) => {
      const res = await fetchApi('/api/soc-wizard/lock-stage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to lock stage')
      }
      return (await res.json()) as { content: SocStageContentRow; complete: boolean }
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['soc-stage-content', variables.session_id] })
      queryClient.invalidateQueries({ queryKey: ['soc-session', variables.session_id] })
    },
  })
}

export function useRegenerateStage() {
  const queryClient = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (payload: {
      session_id: number
      stage_number: SocStage
      hope_frame?: HopeFrame
      population_index?: number | null
    }) => {
      const res = await fetchApi('/api/soc-wizard/regenerate-stage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to regenerate stage')
      }
      return (await res.json()) as { ok: true }
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['soc-stage-content', variables.session_id] })
      queryClient.invalidateQueries({ queryKey: ['soc-chat-turns', variables.session_id, variables.stage_number, variables.hope_frame ?? null, variables.population_index ?? null] })
    },
  })
}

// ---------------------------------------------------------------
// useCoachStream — multi-turn SSE consumer for /api/soc-wizard/coach
// ---------------------------------------------------------------

export function useChatTurns(args: {
  session_id: number | null
  stage_number: SocStage | null
  hope_frame: HopeFrame | null
  population_index: number | null
}) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['soc-chat-turns', args.session_id, args.stage_number, args.hope_frame, args.population_index],
    enabled: !!args.session_id && !!args.stage_number,
    queryFn: async (): Promise<SocChatTurnRow[]> => {
      if (!args.session_id || !args.stage_number) return []
      let q = supabase
        .from('soc_chat_turns')
        .select('*')
        .eq('session_id', args.session_id)
        .eq('stage_number', args.stage_number)
        .order('turn_index', { ascending: true })
      q = args.hope_frame === null ? q.is('hope_frame', null) : q.eq('hope_frame', args.hope_frame)
      q = args.population_index === null ? q.is('population_index', null) : q.eq('population_index', args.population_index)
      const { data, error } = await q
      if (error) throw error
      return (data || []) as unknown as SocChatTurnRow[]
    },
  })
}

interface CoachLocalTurn {
  turn_index: number
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  error?: string
  /** Persisted-only. Streaming turns don't carry metadata. */
  ai_metadata?: Record<string, unknown> | null
}

export function useCoachStream(args: {
  session_id: number | null
  stage_number: SocStage | null
  hope_frame: HopeFrame | null
  population_index: number | null
}) {
  const queryClient = useQueryClient()
  const persisted = useChatTurns(args)
  const [localTurns, setLocalTurns] = useState<CoachLocalTurn[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Reset local state when scope changes
  useEffect(() => {
    setLocalTurns([])
    setError(null)
    setIsStreaming(false)
    abortRef.current?.abort()
    abortRef.current = null
  }, [args.session_id, args.stage_number, args.hope_frame, args.population_index])

  // Combine persisted + in-flight local turns. Persisted is the source of
  // truth once the stream has finished; localTurns drives the live updates.
  const combinedTurns: CoachLocalTurn[] = (() => {
    const fromDb = (persisted.data || []).map((t) => ({
      turn_index: t.turn_index,
      role: t.role as 'user' | 'assistant',
      content: t.content,
      ai_metadata: t.ai_metadata,
    }))
    if (localTurns.length === 0) return fromDb
    // Local turns are higher-indexed than anything in DB; merge.
    const dbMaxIndex = fromDb.length === 0 ? -1 : Math.max(...fromDb.map((t) => t.turn_index))
    const liveExtras = localTurns.filter((t) => t.turn_index > dbMaxIndex)
    return [...fromDb, ...liveExtras]
  })()

  const send = useCallback(async (user_message: string) => {
    if (!args.session_id || !args.stage_number) return
    if (isStreaming) return
    setError(null)

    // Optimistically render the user turn locally
    const lastIndex = combinedTurns.length === 0 ? -1 : Math.max(...combinedTurns.map((t) => t.turn_index))
    const userIndex = lastIndex + 1
    const assistantIndex = lastIndex + 2
    setLocalTurns((prev) => [
      ...prev,
      { turn_index: userIndex, role: 'user', content: user_message },
      { turn_index: assistantIndex, role: 'assistant', content: '', streaming: true },
    ])
    setIsStreaming(true)

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const res = await fetchApi('/api/soc-wizard/coach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: args.session_id,
          stage_number: args.stage_number,
          hope_frame: args.hope_frame ?? undefined,
          population_index: args.population_index ?? undefined,
          user_message,
        }),
        signal: ac.signal,
        timeoutMs: API_FETCH_TIMEOUT_STREAM_MS,
      })

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // SSE parser: split on \n\n, parse "event: x\ndata: y" pairs
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const lines = block.split('\n')
          let event = ''
          let dataStr = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            else if (line.startsWith('data: ')) dataStr += line.slice(6)
          }
          if (!event) continue
          let data: Record<string, unknown> = {}
          try { data = JSON.parse(dataStr) } catch { /* ignore */ }
          if (event === 'delta') {
            const piece = (data.text as string) ?? ''
            setLocalTurns((prev) => prev.map((t) =>
              t.turn_index === assistantIndex
                ? { ...t, content: t.content + piece }
                : t
            ))
          } else if (event === 'turn_close') {
            setLocalTurns((prev) => prev.map((t) =>
              t.turn_index === assistantIndex ? { ...t, streaming: false } : t
            ))
          } else if (event === 'turn_error') {
            const msg = (data.message as string) || 'Coach error'
            setLocalTurns((prev) => prev.map((t) =>
              t.turn_index === assistantIndex ? { ...t, streaming: false, error: msg } : t
            ))
            setError(msg)
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Stream failed'
      // Don't surface aborts as errors
      if (msg !== 'The operation was aborted.' && msg !== 'AbortError') {
        setError(msg)
        setLocalTurns((prev) => prev.map((t) =>
          t.turn_index === assistantIndex ? { ...t, streaming: false, error: msg } : t
        ))
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
      // Reload persisted turns from DB to pick up the assistant turn that
      // the server persisted on stream end. Then drop local turns whose
      // indices are now in the DB.
      await queryClient.invalidateQueries({
        queryKey: ['soc-chat-turns', args.session_id, args.stage_number, args.hope_frame ?? null, args.population_index ?? null],
      })
      setLocalTurns([])
    }
  }, [args.session_id, args.stage_number, args.hope_frame, args.population_index, combinedTurns, isStreaming, queryClient])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    turns: combinedTurns,
    isStreaming,
    isLoading: persisted.isLoading,
    error,
    send,
    cancel,
  }
}

// ---------------------------------------------------------------
// useDeriveArtifact — convert SOC content to email/sms/phone/snippet
// ---------------------------------------------------------------

export function useDeriveArtifact() {
  const queryClient = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (payload: {
      session_id: number
      artifact_kind: 'email' | 'sms' | 'phone_script' | 'snippet'
      stage_number?: SocStage
      hope_frame?: HopeFrame
      campaign_id?: number
      tone?: string
      audience?: string
    }) => {
      const res = await fetchApi('/api/soc-wizard/derive-artifact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to derive artifact')
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await res.json()) as any
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['soc-session', variables.session_id] })
    },
  })
}

// ---------------------------------------------------------------
// useSuggestDraft — ask the coach to generate a starting draft for
// one (session, stage, hope_frame). Persists as an assistant turn
// in soc_chat_turns with ai_metadata.kind === 'draft_suggestion'.
// ---------------------------------------------------------------

export interface SuggestDraftFocusPhrase {
  phrase: string
  reason: 'tone' | 'sector_language' | 'judgment'
  note: string
}

export interface SuggestDraftResult {
  turn_index: number
  commentary: string
  draft_text: string
  focus_phrases: SuggestDraftFocusPhrase[]
}

export function useSuggestDraft() {
  const queryClient = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (payload: {
      session_id: number
      stage_number: SocStage
      hope_frame?: HopeFrame
      population_index?: number | null
    }): Promise<SuggestDraftResult> => {
      const res = await fetchApi('/api/soc-wizard/suggest-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to generate suggestion')
      }
      return (await res.json()) as SuggestDraftResult
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({
        queryKey: [
          'soc-chat-turns',
          variables.session_id,
          variables.stage_number,
          variables.hope_frame ?? null,
          variables.population_index ?? null,
        ],
      })
    },
  })
}
