import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import type { CallList, CallListItemWithWorker, CallListWithStats } from '@/types/planner-types'

export function useCallLists(campaignId: number | string) {
  return useQuery({
    queryKey: ['call-lists', String(campaignId)],
    queryFn: async () => {
      const res = await fetchApi(`/api/calls/lists?campaign_id=${campaignId}`)
      if (!res.ok) throw new Error('Failed to fetch call lists')
      return res.json() as Promise<CallListWithStats[]>
    },
    enabled: !!campaignId,
  })
}

export function useCallList(campaignId: number | string, listId: number | string) {
  return useQuery({
    queryKey: ['call-list', String(campaignId), String(listId)],
    queryFn: async () => {
      const res = await fetchApi(`/api/calls/lists/${listId}`)
      if (!res.ok) throw new Error('Failed to fetch call list')
      return res.json() as Promise<CallListWithStats>
    },
    enabled: !!campaignId && !!listId,
  })
}

export function useCallListItems(campaignId: number | string, listId: number | string) {
  return useQuery({
    queryKey: ['call-list-items', String(campaignId), String(listId)],
    queryFn: async () => {
      const res = await fetchApi(`/api/calls/lists/${listId}/items`)
      if (!res.ok) throw new Error('Failed to fetch items')
      return res.json() as Promise<CallListItemWithWorker[]>
    },
    enabled: !!campaignId && !!listId,
  })
}

export function useCreateCallList(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      name: string
      description?: string
      script_id?: number | null
      priority_strategy?: string
    }) => {
      const res = await fetchApi('/api/calls/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, campaign_id: campaignId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error || 'Failed to create list')
      }
      return res.json() as Promise<CallList>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-lists', String(campaignId)] })
    },
  })
}

export function useUpdateCallList(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ listId, ...updates }: { listId: number } & Partial<CallList>) => {
      const res = await fetchApi(`/api/calls/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json() as Promise<CallList>
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['call-lists', String(campaignId)] })
      queryClient.invalidateQueries({ queryKey: ['call-list', String(campaignId), String(vars.listId)] })
    },
  })
}

export function useDeleteCallList(campaignId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (listId: number) => {
      const res = await fetchApi(`/api/calls/lists/${listId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to delete list' }))
        throw new Error(typeof err.error === 'string' ? err.error : 'Failed to delete list')
      }
      return res.json() as Promise<{ ok: boolean }>
    },
    onSuccess: (_, listId) => {
      queryClient.invalidateQueries({ queryKey: ['call-lists', String(campaignId)] })
      queryClient.removeQueries({ queryKey: ['call-list', String(campaignId), String(listId)] })
      queryClient.removeQueries({ queryKey: ['call-list-items', String(campaignId), String(listId)] })
    },
  })
}

export function usePopulateCallList(campaignId: number | string, listId: number | string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (filters: Record<string, unknown>) => {
      const res = await fetchApi(`/api/calls/lists/${listId}/populate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error || 'Failed to populate list')
      }
      return res.json() as Promise<{ added: number; skipped_no_phone: number; skipped_duplicate: number }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-list-items', String(campaignId), String(listId)] })
      queryClient.invalidateQueries({ queryKey: ['call-list', String(campaignId), String(listId)] })
      queryClient.invalidateQueries({ queryKey: ['call-lists', String(campaignId)] })
    },
  })
}
