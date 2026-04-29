'use client'

import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import {
  fetchApi,
  API_FETCH_TIMEOUT_LLM_MS,
} from '@/lib/api/fetch-api'
import { toast } from 'sonner'
import type { CommsDraftRequest, CommsDraftResponse } from '@/types/planner-types'

export function useGenerateDraft() {
  return useAuthAwareMutation({
    mutationFn: async (request: CommsDraftRequest): Promise<CommsDraftResponse> => {
      const response = await fetchApi('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || `Failed to generate draft: ${response.status}`)
      }

      return response.json()
    },
    onError: (error: Error) => {
      toast.error(`Draft generation failed: ${error.message}`)
    },
  })
}
