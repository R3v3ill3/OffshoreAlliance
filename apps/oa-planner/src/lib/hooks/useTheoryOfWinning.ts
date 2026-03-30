'use client'

import { useMutation } from '@tanstack/react-query'
import type { TheoryOfWinningRequest, TheoryOfWinningResponse } from '@/types'

export function useGenerateTheory() {
  return useMutation({
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
