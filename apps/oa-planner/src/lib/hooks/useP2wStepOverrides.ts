'use client'

import { useCallback, useEffect, useState } from 'react'
import type { P2wStepOverride, P2wTabId } from '@/lib/planning/p2w-step-completion'

const STORAGE_PREFIX = 'oa-p2w-step:v1:'

function storageKey(campaignId: number, stageNumber: number) {
  return `${STORAGE_PREFIX}${campaignId}:${stageNumber}`
}

function readOverrides(key: string): Partial<Record<P2wTabId, P2wStepOverride>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Partial<Record<P2wTabId, P2wStepOverride>>
  } catch {
    return {}
  }
}

export function useP2wStepOverrides(campaignId: number, stageNumber: number) {
  const key = storageKey(campaignId, stageNumber)
  const [overrides, setOverrides] = useState<Partial<Record<P2wTabId, P2wStepOverride>>>({})

  useEffect(() => {
    setOverrides(readOverrides(key))
  }, [key])

  const setOverride = useCallback(
    (tab: P2wTabId, value: P2wStepOverride) => {
      setOverrides((prev) => {
        const next = { ...prev, [tab]: value }
        if (typeof window !== 'undefined') {
          localStorage.setItem(key, JSON.stringify(next))
        }
        return next
      })
    },
    [key]
  )

  return { overrides, setOverride }
}
