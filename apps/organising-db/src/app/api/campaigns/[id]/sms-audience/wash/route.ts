/**
 * POST /api/campaigns/[id]/sms-audience/wash — overlap of worker ids
 * against existing campaign worker lists and prior SMS lists, so an
 * import or filter-build can exclude people already listed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  worker_ids: z.array(z.number().int().positive()).min(1).max(50_000),
})

const PAGE = 1000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const campaignId = Number(id)
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid campaign ID' },
      { status: 400 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await request.json())
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'Invalid request body'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }

  const wanted = new Set(body.worker_ids)

  try {
    const { data: workerLists, error: wlErr } = await supabase
      .from('campaign_worker_lists')
      .select('list_id, name')
      .eq('campaign_id', campaignId)
    if (wlErr) throw wlErr

    const lists: Array<{
      list_id: number
      name: string
      kind: 'worker_list' | 'sms_list'
      overlap_ids: number[]
    }> = []

    for (const wl of workerLists ?? []) {
      const overlap = new Set<number>()
      for (let from = 0; ; from += PAGE) {
        const { data: items, error } = await supabase
          .from('campaign_worker_list_items')
          .select('worker_id')
          .eq('list_id', wl.list_id)
          .range(from, from + PAGE - 1)
        if (error) throw error
        for (const row of items ?? []) {
          if (wanted.has(row.worker_id)) overlap.add(row.worker_id)
        }
        if (!items || items.length < PAGE) break
      }
      if (overlap.size > 0) {
        lists.push({
          list_id: wl.list_id,
          name: wl.name,
          kind: 'worker_list',
          overlap_ids: [...overlap],
        })
      }
    }

    const { data: smsLists, error: slErr } = await supabase
      .from('sms_lists')
      .select('list_id, name')
      .eq('campaign_id', campaignId)
    if (slErr) throw slErr

    for (const sl of smsLists ?? []) {
      const overlap = new Set<number>()
      for (let from = 0; ; from += PAGE) {
        const { data: items, error } = await supabase
          .from('sms_list_items')
          .select('worker_id')
          .eq('list_id', sl.list_id)
          .range(from, from + PAGE - 1)
        if (error) throw error
        for (const row of items ?? []) {
          if (wanted.has(row.worker_id)) overlap.add(row.worker_id)
        }
        if (!items || items.length < PAGE) break
      }
      if (overlap.size > 0) {
        lists.push({
          list_id: sl.list_id,
          name: sl.name,
          kind: 'sms_list',
          overlap_ids: [...overlap],
        })
      }
    }

    return NextResponse.json({ success: true, lists })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unknown error occurred'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
