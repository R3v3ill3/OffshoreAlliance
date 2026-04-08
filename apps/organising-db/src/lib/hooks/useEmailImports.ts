'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export interface EmailImportRow {
  import_id: number
  resend_email_id: string | null
  from_address: string | null
  to_address?: string | null
  subject: string
  subject_tag: string | null
  body_html: string | null
  body_text: string | null
  ai_analysis: EmailAnalysis | null
  analysis_status: 'pending' | 'analysed' | 'reviewed' | 'imported' | 'failed'
  imported_template_id: number | null
  created_at: string
  updated_at: string
}

export interface VariableReplacement {
  original_text: string
  variable: string
  confidence: 'high' | 'medium' | 'manual'
  context: string
  accepted: boolean
  replacement_text?: string
}

export interface EmailAnalysis {
  stage_number: number | null
  stage_rationale: string
  tone_tags: string[]
  audience_segment: string
  activity_type: string
  suggested_title: string
  variables: string[]
  platform: string
  design_elements: {
    has_images: boolean
    has_custom_fonts: boolean
    font_families: string[]
    primary_colors: string[]
    layout_type: string
  }
  target_audience_description: string
  call_to_action: string | null
  key_themes: string[]
  suggested_wtp_categories: Array<{ category: string; option: string }>
  variable_replacements?: VariableReplacement[]
}

export function useEmailImports(status?: string) {
  return useQuery({
    queryKey: ['email-imports', status],
    queryFn: async () => {
      const url = status
        ? `/api/email-import?status=${status}`
        : '/api/email-import'
      const response = await fetch(url)
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Failed to fetch imports')
      }
      return response.json() as Promise<EmailImportRow[]>
    },
  })
}

export function useEmailImportDetail(importId: number | null) {
  return useQuery({
    queryKey: ['email-import', importId],
    queryFn: async () => {
      if (!importId) return null
      const response = await fetch(`/api/email-import/${importId}`)
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Failed to fetch import')
      }
      return response.json() as Promise<EmailImportRow>
    },
    enabled: !!importId,
  })
}

export function useAnalyseEmailImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (importId: number) => {
      const response = await fetch(`/api/email-import/${importId}/analyse`, {
        method: 'POST',
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Analysis failed')
      }
      return response.json() as Promise<{ analysis: EmailAnalysis; import_id: number }>
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-imports'] })
      queryClient.invalidateQueries({ queryKey: ['email-import', data.import_id] })
      toast.success('Email analysed successfully')
    },
    onError: (err: Error) => {
      toast.error(`Analysis failed: ${err.message}`)
    },
  })
}

export function useUpdateEmailImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { importId: number; updates: Partial<EmailImportRow> }) => {
      const response = await fetch(`/api/email-import/${params.importId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params.updates),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Update failed')
      }
      return response.json() as Promise<EmailImportRow>
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-imports'] })
      queryClient.invalidateQueries({ queryKey: ['email-import', data.import_id] })
    },
    onError: (err: Error) => {
      toast.error(`Update failed: ${err.message}`)
    },
  })
}

export function useDeleteEmailImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (importId: number) => {
      const response = await fetch(`/api/email-import/${importId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Delete failed')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-imports'] })
      toast.success('Email import deleted')
    },
    onError: (err: Error) => {
      toast.error(`Delete failed: ${err.message}`)
    },
  })
}

export function useImportAsTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      importId: number
      overrides?: {
        title?: string
        stage_number?: number
        tone_tags?: string[]
        audience_segment?: string
        activity_type?: string
      }
      variable_replacements?: VariableReplacement[]
    }) => {
      const response = await fetch(`/api/email-import/${params.importId}/import-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params.overrides,
          variable_replacements: params.variable_replacements,
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Import failed')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-imports'] })
      queryClient.invalidateQueries({ queryKey: ['comms-templates'] })
      toast.success('Email imported as template')
    },
    onError: (err: Error) => {
      toast.error(`Import failed: ${err.message}`)
    },
  })
}
