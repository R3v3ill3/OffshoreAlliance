import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computePriorityScore } from '@/lib/phone/priority-scoring'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> }
) {
  try {
    const { id: campaignId, listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const filters = body.filters || {}

    const listBuilderUrl = new URL(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/campaigns/${campaignId}/list-builder`)
    if (filters.membership) listBuilderUrl.searchParams.set('membership', filters.membership)
    if (filters.roles) listBuilderUrl.searchParams.set('roles', filters.roles)
    if (filters.employer_id) listBuilderUrl.searchParams.set('employer_id', filters.employer_id)
    if (filters.worksite_id) listBuilderUrl.searchParams.set('worksite_id', filters.worksite_id)
    if (filters.occupation) listBuilderUrl.searchParams.set('occupation', filters.occupation)

    const workerRes = await fetch(listBuilderUrl.toString(), {
      headers: { cookie: req.headers.get('cookie') || '' },
    })

    if (!workerRes.ok) {
      throw new Error('Failed to fetch workers from list builder')
    }

    const workers: { worker_id: number; phone: string | null; membership_status: string | null }[] = await workerRes.json()

    const withPhone = workers.filter((w) => w.phone && w.phone.trim() !== '')

    if (withPhone.length === 0) {
      return NextResponse.json(
        { error: 'No workers with phone numbers match the filters' },
        { status: 400 }
      )
    }

    const existingIds = new Set<number>()
    const { data: existingItems } = await supabase
      .from('call_list_items')
      .select('worker_id')
      .eq('list_id', parseInt(listId))

    existingItems?.forEach((item) => existingIds.add(item.worker_id))

    let connectionMap = new Map<number, Record<string, unknown>>()
    const workerIds = withPhone.map((w) => w.worker_id)
    const { data: connections } = await supabase
      .from('worker_campaign_connections')
      .select('worker_id, support_level, connection_status, contact_count, preferred_contact_method')
      .eq('campaign_id', parseInt(campaignId))
      .in('worker_id', workerIds)

    if (connections) {
      connectionMap = new Map(connections.map((c) => [c.worker_id, c]))
    }

    const newItems = withPhone
      .filter((w) => !existingIds.has(w.worker_id))
      .map((w, i) => {
        const conn = connectionMap.get(w.worker_id) as Record<string, string | number | null | undefined> | undefined
        const score = computePriorityScore({
          support_level: (conn?.support_level as string) || null,
          connection_status: (conn?.connection_status as string) || null,
          contact_count: (conn?.contact_count as number) || 0,
          membership_status: w.membership_status,
          has_phone: true,
          preferred_contact_method: (conn?.preferred_contact_method as string) || null,
        })

        return {
          list_id: parseInt(listId),
          worker_id: w.worker_id,
          sort_order: i,
          priority_score: score,
          status: 'pending' as const,
        }
      })

    if (newItems.length === 0) {
      return NextResponse.json({ message: 'All matching workers are already on the list', added: 0 })
    }

    const { error } = await supabase
      .from('call_list_items')
      .insert(newItems)

    if (error) throw error

    await supabase
      .from('call_lists')
      .update({
        total_items: (existingItems?.length || 0) + newItems.length,
        source_filters: filters,
      })
      .eq('list_id', parseInt(listId))

    return NextResponse.json({
      message: `Added ${newItems.length} contacts to the call list`,
      added: newItems.length,
      skipped_no_phone: workers.length - withPhone.length,
      skipped_duplicate: withPhone.length - newItems.length,
    })
  } catch (error) {
    console.error('Populate call-list error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to populate list' },
      { status: 500 }
    )
  }
}
