'use client'

import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import { toast } from 'sonner'
import type { CommsDraftRequest, CommsDraftResponse } from '@/types/planner-types'

export function useGenerateDraft() {
  return useAuthAwareMutation({
    mutationFn: async (request: CommsDraftRequest): Promise<CommsDraftResponse> => {
      const response = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
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
