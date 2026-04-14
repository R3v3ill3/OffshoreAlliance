'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { isWorkerMemberLike } from '@/lib/campaign/constants'

export interface CampaignCurrentStats {
  totalWorkerEstimate: number
  namedWorkers: number
  namedPctOfEstimate: number
  memberLikeCount: number
  densityOfNamed: number
  densityOfEstimate: number
  delegates: number
  activists: number
  contacts: number
  bargainingReps: number
  ouCount: number
  ousWithContact: number
  ousWithActivist: number
  ousWithDelegate: number
  unitAssignments: number
  multiUnitMembers: number
  phoneCount: number
  emailCount: number
  phonePct: number
  emailPct: number
}

const EMPTY_STATS: CampaignCurrentStats = {
  totalWorkerEstimate: 0,
  namedWorkers: 0,
  namedPctOfEstimate: 0,
  memberLikeCount: 0,
  densityOfNamed: 0,
  densityOfEstimate: 0,
  delegates: 0,
  activists: 0,
  contacts: 0,
  bargainingReps: 0,
  ouCount: 0,
  ousWithContact: 0,
  ousWithActivist: 0,
  ousWithDelegate: 0,
  unitAssignments: 0,
  multiUnitMembers: 0,
  phoneCount: 0,
  emailCount: 0,
  phonePct: 0,
  emailPct: 0,
}

function pct1(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

type MemberRow = {
  worker_id: number
  worker: {
    worker_id: number
    phone?: string | null
    email?: string | null
    is_bargaining_rep?: boolean | null
    member_role_type: { role_name: string } | { role_name: string }[] | null
    union_membership_type: { type_name: string } | { type_name: string }[] | null
  } | {
    worker_id: number
    phone?: string | null
    email?: string | null
    is_bargaining_rep?: boolean | null
    member_role_type: { role_name: string } | { role_name: string }[] | null
    union_membership_type: { type_name: string } | { type_name: string }[] | null
  }[] | null
}

function normalizeRel<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

export function useCampaignCurrentStats(campaignId: number | string) {
  const supabase = createClient()
  const cid = String(campaignId)

  const { data: campaign } = useQuery({
    queryKey: ['campaign', cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('total_worker_estimate')
        .eq('campaign_id', cid)
        .single()
      if (error) throw error
      return data
    },
    staleTime: 30_000,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['campaign-members', cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_worker_membership')
        .select(
          `worker_id,
           worker:workers(
             worker_id, phone, email, is_bargaining_rep,
             member_role_type:member_role_types(role_name),
             union_membership_type:union_membership_types(type_name)
           )`
        )
        .eq('campaign_id', cid)
      if (error) throw error
      return (data ?? []) as MemberRow[]
    },
    staleTime: 30_000,
  })

  const { data: ous = [] } = useQuery({
    queryKey: ['campaign-ous', cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_organising_units')
        .select('ou_id')
        .eq('campaign_id', cid)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  const ouIds = useMemo(() => ous.map((o) => o.ou_id), [ous])

  const { data: ouAssign = [] } = useQuery({
    queryKey: ['campaign-worker-ou', cid],
    queryFn: async () => {
      if (ouIds.length === 0) return []
      const { data, error } = await supabase
        .from('campaign_worker_ou')
        .select('ou_id, worker_id')
        .in('ou_id', ouIds)
      if (error) throw error
      return data ?? []
    },
    enabled: ouIds.length > 0,
    staleTime: 30_000,
  })

  const { data: unitSummary = [] } = useQuery({
    queryKey: ['campaign-worker-unit-summary', cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_worker_unit_membership_summary')
        .select('worker_id, unit_count, is_multi_unit_member')
        .eq('campaign_id', cid)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  const { data: ouCoverage } = useQuery({
    queryKey: ['campaign-ou-coverage', cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_ou_coverage_summary')
        .select('ous_with_contact, ous_with_activist, ous_with_delegate')
        .eq('campaign_id', cid)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    staleTime: 30_000,
  })

  const stats = useMemo((): CampaignCurrentStats => {
    if (!campaign) return EMPTY_STATS

    const estimate = (campaign.total_worker_estimate as number | null) ?? 0
    const named = members.length

    let memberLike = 0
    let delegates = 0
    let activists = 0
    let contacts = 0
    let bargainingReps = 0
    let phoneCount = 0
    let emailCount = 0

    for (const m of members) {
      const w = normalizeRel(m.worker)
      const mt = normalizeRel(w?.member_role_type)
      const um = normalizeRel(w?.union_membership_type)

      const roleName = (mt as { role_name?: string } | null)?.role_name
      const isBargRep = (w as { is_bargaining_rep?: boolean | null } | null)?.is_bargaining_rep

      if (isWorkerMemberLike({
        unionMembershipTypeName: (um as { type_name?: string } | null)?.type_name,
        memberRoleName: roleName,
        isBargainingRep: isBargRep,
      })) {
        memberLike++
      }

      if (roleName === 'delegate') delegates++
      else if (roleName === 'Activist') activists++
      else if (roleName === 'contact') contacts++
      if (isBargRep) bargainingReps++

      const phone = (w as { phone?: string | null } | null)?.phone
      const email = (w as { email?: string | null } | null)?.email
      if (phone && phone.trim()) phoneCount++
      if (email && email.trim()) emailCount++
    }

    const ouWithDelegate = new Set<number>()
    for (const a of ouAssign) {
      const m = members.find((x) => x.worker_id === a.worker_id)
      const mw = normalizeRel(m?.worker)
      const mmt = normalizeRel(mw?.member_role_type)
      if ((mmt as { role_name?: string } | null)?.role_name === 'delegate') {
        ouWithDelegate.add(a.ou_id)
      }
    }

    return {
      totalWorkerEstimate: estimate,
      namedWorkers: named,
      namedPctOfEstimate: pct1(named, estimate),
      memberLikeCount: memberLike,
      densityOfNamed: pct1(memberLike, named),
      densityOfEstimate: pct1(memberLike, estimate),
      delegates,
      activists,
      contacts,
      bargainingReps,
      ouCount: ous.length,
      ousWithContact: ouCoverage?.ous_with_contact ?? 0,
      ousWithActivist: ouCoverage?.ous_with_activist ?? 0,
      ousWithDelegate: ouCoverage?.ous_with_delegate ?? ouWithDelegate.size,
      unitAssignments: ouAssign.length,
      multiUnitMembers: unitSummary.filter((r) => r.is_multi_unit_member).length,
      phoneCount,
      emailCount,
      phonePct: pct1(phoneCount, named),
      emailPct: pct1(emailCount, named),
    }
  }, [campaign, members, ous, ouAssign, unitSummary, ouCoverage])

  return stats
}
