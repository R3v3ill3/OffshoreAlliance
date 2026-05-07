/**
 * Shared helpers for the Section Planning AI routes.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export function ensureAnthropicConfigured() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured')
  }
}

export async function getAuthedSupabase() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { supabase, user }
}

/**
 * Service-role Supabase client for writing audit rows that should always
 * succeed regardless of the caller's RLS posture. Falls back to the
 * authed client if service-role isn't configured (dev / preview).
 */
export function getAuditClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

export interface AuditRecord {
  section_plan_id: number
  surface:
    | 'situation_chat'
    | 'ambition_tighten'
    | 'tow_check'
    | 'sequence_suggest'
    | 'soc_coach'
    | 'stage_mapping'
  prompt_snapshot: unknown
  response_snapshot: unknown
  model: string
  created_by: string | null
}

export async function writeAiAudit(
  authedSupabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  record: AuditRecord,
) {
  const audit = getAuditClient() ?? authedSupabase
  await audit.from('section_plan_ai_events').insert({
    section_plan_id: record.section_plan_id,
    surface: record.surface,
    prompt_snapshot: record.prompt_snapshot as never,
    response_snapshot: record.response_snapshot as never,
    model: record.model,
    created_by: record.created_by,
  })
}

/**
 * Best-effort JSON parse: extracts the last fenced JSON code block if
 * present, otherwise tries to parse the whole string. Returns null on
 * failure rather than throwing.
 */
export function extractJson<T>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/g)
  const candidate = fence
    ? fence[fence.length - 1].replace(/```(?:json)?\s*/, '').replace(/```$/, '')
    : text
  try {
    return JSON.parse(candidate.trim()) as T
  } catch {
    // Try to find the first {...} or [...] block as a fallback
    const m = text.match(/[\[{][\s\S]*[\]}]/)
    if (m) {
      try {
        return JSON.parse(m[0]) as T
      } catch {
        return null
      }
    }
    return null
  }
}

export async function loadSectionPlanForAi(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sectionPlanId: number,
) {
  const { data, error } = await supabase
    .from('section_plans')
    .select('*')
    .eq('section_plan_id', sectionPlanId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Section plan ${sectionPlanId} not found`)
  return data
}
