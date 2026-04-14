'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import { toast } from 'sonner'

interface TemplateFilters {
  platform?: string
  stage_number?: number
  is_active?: boolean
  search?: string
}

export interface TemplateRow {
  template_id: number
  title: string
  subject_line: string | null
  body_html: string | null
  body_text: string
  stage_number: number | null
  activity_type: string | null
  tone_tags: string[] | null
  audience_segment: string | null
  platform: string
  variables: Record<string, unknown> | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export function useTemplateLibrary(filters?: TemplateFilters) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['comms-templates', filters],
    queryFn: async () => {
      let query = supabase
        .from('comms_template_library')
        .select('*')
        .eq('is_active', filters?.is_active ?? true)
        .order('created_at', { ascending: false })

      if (filters?.platform) {
        query = query.eq('platform', filters.platform)
      }
      if (filters?.stage_number) {
        query = query.eq('stage_number', filters.stage_number)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as TemplateRow[]
    },
  })
}

export function useCreateTemplate() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (template: {
      title: string
      subject_line?: string
      body_html?: string
      body_text: string
      stage_number?: number
      activity_type?: string
      tone_tags?: string[]
      audience_segment?: string
      platform: string
      variables?: Record<string, unknown>
    }) => {
      const { data, error } = await supabase
        .from('comms_template_library')
        .insert(template)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comms-templates'] })
      toast.success('Template saved')
    },
    onError: (err: Error) => {
      toast.error(`Failed to save template: ${err.message}`)
    },
  })
}

export function useUpdateTemplate() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (params: { template_id: number } & Partial<{
      title: string
      subject_line: string
      body_html: string
      body_text: string
      stage_number: number
      activity_type: string
      tone_tags: string[]
      audience_segment: string
      platform: string
      variables: Record<string, unknown>
      is_active: boolean
    }>) => {
      const { template_id, ...updates } = params
      const { data, error } = await supabase
        .from('comms_template_library')
        .update(updates)
        .eq('template_id', template_id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comms-templates'] })
      toast.success('Template updated')
    },
    onError: (err: Error) => {
      toast.error(`Failed to update template: ${err.message}`)
    },
  })
}

export function useDeactivateTemplate() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useAuthAwareMutation({
    mutationFn: async (templateId: number) => {
      const { error } = await supabase
        .from('comms_template_library')
        .update({ is_active: false })
        .eq('template_id', templateId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comms-templates'] })
      toast.success('Template deactivated')
    },
    onError: (err: Error) => {
      toast.error(`Failed to deactivate template: ${err.message}`)
    },
  })
}

export function useAnalyseTemplate() {
  return useAuthAwareMutation({
    mutationFn: async (params: { content: string; platform?: string }) => {
      const response = await fetch('/api/templates/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || 'Analysis failed')
      }
      return response.json()
    },
    onError: (err: Error) => {
      toast.error(`Analysis failed: ${err.message}`)
    },
  })
}
