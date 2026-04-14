'use client'

import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import type { TheoryOfWinningRequest, TheoryOfWinningResponse } from '@/types/planner-types'

export function useGenerateTheory() {
  return useAuthAwareMutation({
    mutationFn: async (request: TheoryOfWinningRequest): Promise<TheoryOfWinningResponse> => {
      const response = await fetch('/api/theory-of-winning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || `HTTP error ${response.status}`)
      }

      return response.json()
    },
  })
}
