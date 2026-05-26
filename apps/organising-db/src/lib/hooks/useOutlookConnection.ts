'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import { toast } from 'sonner'

export interface OutlookConnectionState {
  connected: boolean
  status?: 'active' | 'revoked' | 'error'
  email?: string | null
  display_name?: string | null
  scopes?: string
  connected_at?: string
  last_used_at?: string | null
  last_error?: string | null
}

const QUERY_KEY = ['outlook-connection']

export function useOutlookConnection() {
  const queryClient = useQueryClient()

  const query = useQuery<OutlookConnectionState>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetchApi('/api/oauth/microsoft/status')
      if (!res.ok) throw new Error('Failed to load Outlook connection status')
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Unknown error')
      return {
        connected: !!json.connected,
        status: json.status,
        email: json.email,
        display_name: json.display_name,
        scopes: json.scopes,
        connected_at: json.connected_at,
        last_used_at: json.last_used_at,
        last_error: json.last_error,
      }
    },
    staleTime: 30_000,
  })

  const connect = useCallback((returnTo?: string) => {
    const here = returnTo ?? window.location.pathname + window.location.search
    const url = `/api/oauth/microsoft/start?returnTo=${encodeURIComponent(here)}`
    window.location.assign(url)
  }, [])

  const disconnect = useCallback(async () => {
    const res = await fetchApi('/api/oauth/microsoft/disconnect', {
      method: 'POST',
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Failed to disconnect.')
      return
    }
    toast.success('Outlook disconnected.')
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  }, [queryClient])

  return {
    connection: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refresh: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    connect,
    disconnect,
  }
}
