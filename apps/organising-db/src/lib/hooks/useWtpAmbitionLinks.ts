'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'

/* ───────────────── Row × ambition (M:N) ───────────────── */

export interface WtpAmbitionLinkRow {
  wtp_ambition_id: number
  wtp_id: number
  ambition_id: number
  created_at: string
}

const rowAmbitionsKey = (sectionPlanId: number) =>
  ['wtp-row-ambitions', sectionPlanId] as const

/**
 * Loads every (wtp_id × ambition_id) link for the WTP rows belonging to
 * one section plan, keyed by wtp_id for easy lookup in the UI.
 *
 * Two-step pull rather than a join so RLS on plan_where_to_play applies
 * naturally and the query stays cache-friendly.
 */
export function useWtpRowAmbitions(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: rowAmbitionsKey(sectionPlanId),
    queryFn: async (): Promise<Record<number, number[]>> => {
      const { data: rows, error: rowsErr } = await supabase
        .from('plan_where_to_play')
        .select('wtp_id')
        .eq('section_plan_id', sectionPlanId)
      if (rowsErr) throw rowsErr
      const wtpIds = (rows ?? []).map((r) => r.wtp_id as number)
      if (wtpIds.length === 0) return {}

      const { data: links, error: linksErr } = await supabase
        .from('plan_wtp_ambitions')
        .select('wtp_id, ambition_id')
        .in('wtp_id', wtpIds)
      if (linksErr) throw linksErr

      const byWtp: Record<number, number[]> = {}
      for (const l of links ?? []) {
        const wid = l.wtp_id as number
        const aid = l.ambition_id as number
        ;(byWtp[wid] ??= []).push(aid)
      }
      return byWtp
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useSetWtpRowAmbitions() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      section_plan_id: number
      wtp_id: number
      ambition_ids: number[]
    }) => {
      // Upsert delta: insert anything missing, delete anything no longer present.
      const { data: existing, error: readErr } = await supabase
        .from('plan_wtp_ambitions')
        .select('ambition_id')
        .eq('wtp_id', params.wtp_id)
      if (readErr) throw readErr
      const existingIds = new Set(
        (existing ?? []).map((r) => r.ambition_id as number),
      )
      const desired = new Set(params.ambition_ids)
      const toInsert = [...desired].filter((id) => !existingIds.has(id))
      const toRemove = [...existingIds].filter((id) => !desired.has(id))

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('plan_wtp_ambitions')
          .insert(toInsert.map((ambition_id) => ({ wtp_id: params.wtp_id, ambition_id })))
        if (error) throw error
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('plan_wtp_ambitions')
          .delete()
          .eq('wtp_id', params.wtp_id)
          .in('ambition_id', toRemove)
        if (error) throw error
      }
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: rowAmbitionsKey(vars.section_plan_id) }),
  })
}

/* ───────────────── Section × category × ambition (M:N) ───────────────── */

export interface SectionAmbitionLinkRow {
  section_ambition_id: number
  section_plan_id: number
  wtp_category_id: number
  ambition_id: number
  created_at: string
}

const sectionAmbitionsKey = (sectionPlanId: number) =>
  ['wtp-section-ambitions', sectionPlanId] as const

export function useWtpSectionAmbitions(sectionPlanId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: sectionAmbitionsKey(sectionPlanId),
    queryFn: async (): Promise<Record<number, number[]>> => {
      const { data, error } = await supabase
        .from('plan_wtp_section_ambitions')
        .select('wtp_category_id, ambition_id')
        .eq('section_plan_id', sectionPlanId)
      if (error) throw error
      const byCat: Record<number, number[]> = {}
      for (const r of data ?? []) {
        const cid = r.wtp_category_id as number
        const aid = r.ambition_id as number
        ;(byCat[cid] ??= []).push(aid)
      }
      return byCat
    },
    enabled: Number.isFinite(sectionPlanId) && sectionPlanId > 0,
  })
}

export function useSetWtpSectionAmbitions() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      section_plan_id: number
      wtp_category_id: number
      ambition_ids: number[]
    }) => {
      const { data: existing, error: readErr } = await supabase
        .from('plan_wtp_section_ambitions')
        .select('ambition_id')
        .eq('section_plan_id', params.section_plan_id)
        .eq('wtp_category_id', params.wtp_category_id)
      if (readErr) throw readErr
      const existingIds = new Set(
        (existing ?? []).map((r) => r.ambition_id as number),
      )
      const desired = new Set(params.ambition_ids)
      const toInsert = [...desired].filter((id) => !existingIds.has(id))
      const toRemove = [...existingIds].filter((id) => !desired.has(id))

      if (toInsert.length > 0) {
        const { error } = await supabase.from('plan_wtp_section_ambitions').insert(
          toInsert.map((ambition_id) => ({
            section_plan_id: params.section_plan_id,
            wtp_category_id: params.wtp_category_id,
            ambition_id,
          })),
        )
        if (error) throw error
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('plan_wtp_section_ambitions')
          .delete()
          .eq('section_plan_id', params.section_plan_id)
          .eq('wtp_category_id', params.wtp_category_id)
          .in('ambition_id', toRemove)
        if (error) throw error
      }
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: sectionAmbitionsKey(vars.section_plan_id) }),
  })
}

/* ───────────────── Bulk reorder helper ───────────────── */

/**
 * After a drag, persist the new sort_order for one or many WTP rows.
 * Sends one UPDATE per row (small lists; M:N + transactionality not worth
 * the engineering for this use case).
 */
export function useReorderSectionWtp() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useAuthAwareMutation({
    mutationFn: async (params: {
      section_plan_id: number
      orderings: Array<{ wtp_id: number; sort_order: number }>
    }) => {
      for (const o of params.orderings) {
        const { error } = await supabase
          .from('plan_where_to_play')
          .update({ sort_order: o.sort_order })
          .eq('wtp_id', o.wtp_id)
        if (error) throw error
      }
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['section-wtp', vars.section_plan_id] }),
  })
}
