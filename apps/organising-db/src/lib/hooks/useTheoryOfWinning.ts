'use client'

import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import {
  fetchApi,
  API_FETCH_TIMEOUT_LLM_MS,
} from '@/lib/api/fetch-api'
import type { TheoryOfWinningRequest, TheoryOfWinningResponse } from '@/types/planner-types'

export function useGenerateTheory() {
  return useAuthAwareMutation({
    mutationFn: async (request: TheoryOfWinningRequest): Promise<TheoryOfWinningResponse> => {
      const response = await fetchApi('/api/theory-of-winning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      })

      const text = await response.text()

      if (!response.ok) {
        let message = `HTTP error ${response.status}`
        try {
          const errJson = JSON.parse(text) as { error?: string }
          message = errJson.error || message
        } catch {
          // body was not JSON; use the HTTP status message
        }
        throw new Error(message)
      }

      try {
        return JSON.parse(text) as TheoryOfWinningResponse
      } catch (e) {
        throw e
      }
    },
  })
}
