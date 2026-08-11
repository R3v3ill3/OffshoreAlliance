/**
 * GET /api/campaigns/[id]/sms-lists/[listId]/export — blast recipient
 * export, CSV (Phase 7). One row per list item with worker identity
 * and per-recipient delivery outcome. Mirrors the phone attempts
 * export (auth via requireStaffUser, text/csv attachment).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireStaffUser } from '@/lib/campaign/auth-api'
import { errorResponse } from '@/lib/api/error-response'
import { csvResponse } from '@/lib/api/csv'

const PAGE_SIZE = 1000

interface ExportItemRow {
  item_id: number
  worker_id: number
  phone_e164: string | null
  status: string
  failure_reason: string | null
  sent_at: string | null
  delivered_at: string | null
  workers:
    | { first_name: string; last_name: string }
    | { first_name: string; last_name: string }[]
    | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> },
) {
  try {
    const { id: campaignId, listId } = await params
    const cid = parseInt(campaignId, 10)
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const staff = await requireStaffUser(supabase)
    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: list, error: listErr } = await supabase
      .from('sms_lists')
      .select('list_id, campaign_id, name, status')
      .eq('list_id', lid)
      .maybeSingle()
    if (listErr) throw listErr
    if (!list || list.campaign_id !== cid) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    const items: ExportItemRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('sms_list_items')
        .select(
          'item_id, worker_id, phone_e164, status, failure_reason, sent_at, delivered_at, workers!inner(first_name, last_name)',
        )
        .eq('list_id', lid)
        .order('item_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      items.push(...((data ?? []) as ExportItemRow[]))
      if (!data || data.length < PAGE_SIZE) break
    }

    const rows = items.map((it) => {
      const w = Array.isArray(it.workers) ? it.workers[0] : it.workers
      return {
        list_id: lid,
        list_name: list.name,
        item_id: it.item_id,
        worker_id: it.worker_id,
        worker_name: w ? `${w.first_name} ${w.last_name}`.trim() : `#${it.worker_id}`,
        phone_e164: it.phone_e164,
        status: it.status,
        failure_reason: it.failure_reason,
        sent_at: it.sent_at,
        delivered_at: it.delivered_at,
      }
    })

    return csvResponse(rows, `sms-blast-${lid}-campaign-${cid}`)
  } catch (error) {
    console.error('GET sms-lists/[listId]/export error:', error)
    return errorResponse('Failed to export SMS blast', error)
  }
}
