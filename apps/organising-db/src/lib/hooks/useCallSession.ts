import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type { CallListItemWithWorker, RecordCallAttemptRequest } from '@/types/planner-types'

export function usePhoneNext(campaignId: number | string, listId: number | string, enabled = true) {
  return useQuery({
    queryKey: ['phone-next', String(campaignId), String(listId)],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/call-lists/${listId}/next`)
      if (!res.ok) throw new Error('Failed to get next contact')
      const data = await res.json()
      if (data.done) return null
      return data as CallListItemWithWorker
    },
    enabled: !!campaignId && !!listId && enabled,
    refetchOnWindowFocus: false,
    staleTime: 0,
  })
}

export function useRecordCallAttempt(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (attempt: RecordCallAttemptRequest) => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/call-attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error || 'Failed to record attempt')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-next'] })
      queryClient.invalidateQueries({ queryKey: ['call-list-items'] })
      queryClient.invalidateQueries({ queryKey: ['call-lists'] })
    },
  })
}
