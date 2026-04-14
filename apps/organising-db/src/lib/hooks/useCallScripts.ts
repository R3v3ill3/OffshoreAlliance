import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type {
  CallScript,
  CallScriptWithSections,
  StructureScriptRequest,
  StructureScriptResponse,
} from '@/types/planner-types'

export function useCallScripts(campaignId: number | string) {
  return useQuery({
    queryKey: ['call-scripts', String(campaignId)],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/call-scripts`)
      if (!res.ok) throw new Error('Failed to fetch call scripts')
      return res.json() as Promise<CallScriptWithSections[]>
    },
    enabled: !!campaignId,
  })
}

export function useCallScript(campaignId: number | string, scriptId: number | string) {
  return useQuery({
    queryKey: ['call-script', String(campaignId), String(scriptId)],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('call_scripts')
        .select('*, call_script_sections (*)')
        .eq('script_id', parseInt(String(scriptId)))
        .single()

      if (error) throw error
      return data as unknown as CallScriptWithSections
    },
    enabled: !!campaignId && !!scriptId,
  })
}

export function useCreateCallScript(campaignId: number | string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: {
      title: string
      draft_id?: number
      call_objective?: string
      estimated_duration_minutes?: number
      sections?: Record<string, unknown>[]
    }) => {
      const res = await fetch(`/api/campaigns/${campaignId}/call-scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error || 'Failed to create script')
      }
      return res.json() as Promise<CallScriptWithSections>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-scripts', String(campaignId)] })
    },
  })
}

export function useUpdateCallScriptSections(campaignId: number | string, scriptId: number | string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sections: Record<string, unknown>[]) => {
      const supabase = createClient()

      await supabase
        .from('call_script_sections')
        .delete()
        .eq('script_id', parseInt(String(scriptId)))

      if (sections.length > 0) {
        const rows = sections.map((s, i) => ({
          script_id: parseInt(String(scriptId)),
          sort_order: s.sort_order ?? i,
          section_type: s.section_type || 'custom',
          title: s.title || `Section ${i + 1}`,
          body_text: s.body_text || '',
          talking_points: s.talking_points || [],
          prompt_text: s.prompt_text || null,
          expected_outcomes: s.expected_outcomes || [],
          is_optional: s.is_optional || false,
        }))

        const { error } = await supabase
          .from('call_script_sections')
          .insert(rows)

        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-script', String(campaignId), String(scriptId)] })
      queryClient.invalidateQueries({ queryKey: ['call-scripts', String(campaignId)] })
    },
  })
}

export function useStructureScript(campaignId: number | string) {
  return useMutation({
    mutationFn: async (request: StructureScriptRequest) => {
      const res = await fetch(`/api/campaigns/${campaignId}/call-scripts/structure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error || 'Failed to structure script')
      }
      return res.json() as Promise<StructureScriptResponse>
    },
  })
}

export function useUpdateCallScript(campaignId: number | string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ scriptId, ...fields }: { scriptId: number } & Partial<CallScript>) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('call_scripts')
        .update(fields)
        .eq('script_id', scriptId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-scripts', String(campaignId)] })
    },
  })
}
