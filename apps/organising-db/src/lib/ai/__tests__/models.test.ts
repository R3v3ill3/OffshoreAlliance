import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rows: { key: string; value: string | null }[] = []
const fromMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}))

function primeRows(next: { key: string; value: string | null }[]) {
  rows.splice(0, rows.length, ...next)
  fromMock.mockImplementation(() => ({
    select: () => ({
      in: async () => ({ data: rows, error: null }),
    }),
  }))
}

describe('getAiModel', () => {
  beforeEach(async () => {
    vi.resetModules()
    fromMock.mockReset()
    const mod = await import('../models')
    mod.resetAiModelCache()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('falls back to the constants when nothing is stored', async () => {
    primeRows([])
    const { getAiModel, AI_MODEL, AI_FAST_MODEL } = await import('../models')
    expect(await getAiModel('default')).toBe(AI_MODEL)
    expect(await getAiModel('fast')).toBe(AI_FAST_MODEL)
  })

  it('returns the stored setting per purpose', async () => {
    primeRows([
      { key: 'ai_model_default', value: 'claude-opus-5' },
      { key: 'ai_model_fast', value: 'claude-haiku-4-5' },
    ])
    const { getAiModel, getResolvedAiModels } = await import('../models')
    expect(await getAiModel('default')).toBe('claude-opus-5')
    expect(await getAiModel('fast')).toBe('claude-haiku-4-5')
    const resolved = await getResolvedAiModels()
    expect(resolved.default.source).toBe('setting')
  })

  it('ignores values that do not look like a Claude model id', async () => {
    primeRows([{ key: 'ai_model_default', value: 'gpt-4o; drop table' }])
    const { getAiModel, AI_MODEL, getResolvedAiModels } = await import('../models')
    expect(await getAiModel('default')).toBe(AI_MODEL)
    expect((await getResolvedAiModels()).default.source).toBe('fallback')
  })

  it('caches the settings read for a minute', async () => {
    vi.useFakeTimers()
    primeRows([{ key: 'ai_model_default', value: 'claude-opus-5' }])
    const { getAiModel, resetAiModelCache } = await import('../models')
    resetAiModelCache()
    await getAiModel('default')
    await getAiModel('fast')
    expect(fromMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(61_000)
    await getAiModel('default')
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it('falls back when the admin client is unavailable', async () => {
    fromMock.mockImplementation(() => {
      throw new Error('no service role key')
    })
    const { getAiModel, AI_MODEL } = await import('../models')
    expect(await getAiModel('default')).toBe(AI_MODEL)
  })
})

describe('isValidModelId', () => {
  it('accepts current ids and rejects junk', async () => {
    const { isValidModelId } = await import('../models')
    expect(isValidModelId('claude-opus-5')).toBe(true)
    expect(isValidModelId('claude-sonnet-4-20250514')).toBe(true)
    expect(isValidModelId('claude-haiku-4-5')).toBe(true)
    expect(isValidModelId('')).toBe(false)
    expect(isValidModelId('opus-5')).toBe(false)
    expect(isValidModelId('claude-Opus 5')).toBe(false)
    expect(isValidModelId(null)).toBe(false)
  })
})
