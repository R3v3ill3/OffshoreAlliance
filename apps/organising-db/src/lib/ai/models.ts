/**
 * Centralised AI model resolution.
 *
 * Which Claude model the app calls is an admin setting
 * (Administration → Settings → "AI models"), stored in `app_settings`
 * under `ai_model_default` / `ai_model_fast`. Every server-side Anthropic
 * call resolves its model through `getAiModel()` rather than inlining a
 * string, so a model change is a settings edit — never a deploy.
 *
 * The exported constants are the fallbacks used when the setting is
 * unset, unreadable (no service-role key in local tooling) or fails
 * validation. They are intentionally still exported for tests and for
 * code that must be synchronous, but new call sites should `await
 * getAiModel(...)`.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Which class of work a call is doing.
 *  - `default`: reasoning, drafting, analysis, reports — quality first.
 *  - `fast`: cheap classification / extraction where latency and cost
 *    matter more than nuance.
 */
export type AiModelPurpose = 'default' | 'fast'

/** Fallback for `default` when no admin setting is stored. */
export const AI_MODEL = 'claude-opus-5' as const

/** Fallback for `fast` when no admin setting is stored. */
export const AI_FAST_MODEL = 'claude-haiku-4-5' as const

/**
 * @deprecated Phone-script routes now resolve through `getAiModel('default')`.
 * Kept so nothing that still imports it breaks; equals AI_MODEL.
 */
export const PHONE_SCRIPT_MODEL = AI_MODEL

export const AI_MODEL_SETTING_KEYS: Record<AiModelPurpose, string> = {
  default: 'ai_model_default',
  fast: 'ai_model_fast',
}

const FALLBACKS: Record<AiModelPurpose, string> = {
  default: AI_MODEL,
  fast: AI_FAST_MODEL,
}

/** Anthropic model ids are lower-case words/digits joined by `-` or `.`. */
const MODEL_ID_PATTERN = /^claude-[a-z0-9][a-z0-9.-]{2,80}$/

export function isValidModelId(value: unknown): value is string {
  return typeof value === 'string' && MODEL_ID_PATTERN.test(value)
}

const CACHE_TTL_MS = 60_000

interface CacheEntry {
  values: Partial<Record<AiModelPurpose, string>>
  expiresAt: number
}

let cache: CacheEntry | null = null

/** Test hook: drop the in-process settings cache. */
export function resetAiModelCache() {
  cache = null
}

async function loadStoredModels(): Promise<Partial<Record<AiModelPurpose, string>>> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.values

  const values: Partial<Record<AiModelPurpose, string>> = {}
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', Object.values(AI_MODEL_SETTING_KEYS))
    for (const row of (data ?? []) as { key: string; value: string | null }[]) {
      const purpose = (Object.keys(AI_MODEL_SETTING_KEYS) as AiModelPurpose[]).find(
        (p) => AI_MODEL_SETTING_KEYS[p] === row.key,
      )
      const candidate = row.value?.trim()
      if (purpose && isValidModelId(candidate)) values[purpose] = candidate
    }
  } catch {
    // No service-role client (local tooling, tests) — fallbacks apply.
  }

  cache = { values, expiresAt: now + CACHE_TTL_MS }
  return values
}

/**
 * Resolve the model id to use for a class of work. Reads the admin
 * setting (cached for 60 s per process) and falls back to the constant.
 */
export async function getAiModel(purpose: AiModelPurpose = 'default'): Promise<string> {
  const stored = await loadStoredModels()
  return stored[purpose] ?? FALLBACKS[purpose]
}

/** Resolve both purposes at once — used by the admin settings card. */
export async function getResolvedAiModels(): Promise<
  Record<AiModelPurpose, { model: string; source: 'setting' | 'fallback' }>
> {
  const stored = await loadStoredModels()
  return {
    default: stored.default
      ? { model: stored.default, source: 'setting' }
      : { model: FALLBACKS.default, source: 'fallback' },
    fast: stored.fast
      ? { model: stored.fast, source: 'setting' }
      : { model: FALLBACKS.fast, source: 'fallback' },
  }
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super('Anthropic API key not configured. Set ANTHROPIC_API_KEY in the deployment environment.')
    this.name = 'AiNotConfiguredError'
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

let client: Anthropic | null = null

/**
 * Shared Anthropic client. Throws `AiNotConfiguredError` (map it to a
 * 503) when the key is missing, so routes fail before spending a call.
 */
export function getAnthropicClient(): Anthropic {
  if (!isAiConfigured()) throw new AiNotConfiguredError()
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}
