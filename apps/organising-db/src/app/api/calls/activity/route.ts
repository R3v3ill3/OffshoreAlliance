/**
 * GET /api/calls/activity — every call list across every campaign, for
 * the Actions hub. Read-only; there is no write path here.
 *
 * One row per list is the hub's grain. `call_lists.completed_items`
 * already summarises the attempts, so `call_attempts` is not read.
 * The select names its columns rather than taking `*` and the two
 * nested script relations /api/calls/lists pulls — the hub needs
 * neither, and the narrow select is what keeps a cross-campaign read
 * cheap.
 *
 * `?campaign_id=N` narrows to one campaign; the hub does not send it.
 *
 * `?mine=1` narrows to the caller's own rows before the LIMIT applies,
 * so a busy org cannot push an organiser's own lists out of their own
 * view. Rows with no recorded owner are kept: the hub counts them and
 * offers "switch to All", which it cannot do for rows it never got.
 *
 * Reads only, under the existing `call_lists` SELECT policy — the
 * per-campaign routes already return these rows to the same users.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import type { CallActivityRow, HubCampaignRef } from '@/lib/actions/hub-rows'

/** Newest first, capped — the hub is an overview, not an archive. */
const LIMIT = 200

export interface CallActivityResponse {
  lists: CallActivityRow[]
  scoped: boolean
}

interface CampaignRow {
  campaign_id: number
  name: string | null
  is_sms_episode: boolean | null
  is_standing: boolean | null
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const raw = req.nextUrl.searchParams.get('campaign_id')
    const campaignId = raw ? parseInt(raw, 10) : null
    const scoped = campaignId != null && Number.isFinite(campaignId)
    const mine = req.nextUrl.searchParams.get('mine') === '1'

    let listQuery = supabase
      .from('call_lists')
      .select(
        'list_id, campaign_id, name, status, total_items, completed_items, created_by, created_at, updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(LIMIT)
    if (scoped) listQuery = listQuery.eq('campaign_id', campaignId as number)
    // Own rows, plus the ownerless ones the hub announces rather than hides.
    if (mine) listQuery = listQuery.or(`created_by.eq.${user.id},created_by.is.null`)

    const { data: lists, error: lErr } = await listQuery
    if (lErr) throw lErr

    const listRows = (lists ?? []) as Array<{
      list_id: number
      campaign_id: number
      name: string | null
      status: string
      total_items: number | null
      completed_items: number | null
      created_by: string | null
      created_at: string
      updated_at: string
    }>

    const campaignIds = [
      ...new Set(listRows.map((r) => r.campaign_id).filter((v): v is number => v != null)),
    ]
    const { data: campaigns, error: cErr } =
      campaignIds.length > 0
        ? await supabase
            .from('campaigns')
            .select('campaign_id, name, is_sms_episode, is_standing')
            .in('campaign_id', campaignIds)
        : { data: [] as CampaignRow[], error: null }
    if (cErr) throw cErr

    const campaignById = new Map<number, HubCampaignRef>()
    for (const c of (campaigns ?? []) as CampaignRow[]) {
      campaignById.set(c.campaign_id, {
        name: c.name,
        is_sms_episode: !!c.is_sms_episode,
        is_standing: !!c.is_standing,
      })
    }

    const payload: CallActivityResponse = {
      lists: listRows.map((l) => ({
        id: l.list_id,
        campaign_id: l.campaign_id,
        name: l.name?.trim() || 'Untitled call list',
        status: l.status,
        total_items: l.total_items ?? 0,
        completed_items: l.completed_items ?? 0,
        created_by: l.created_by,
        created_at: l.created_at,
        updated_at: l.updated_at,
        campaign: campaignById.get(l.campaign_id) ?? null,
      })),
      scoped,
    }
    return NextResponse.json(payload)
  } catch (error) {
    console.error('GET call activity error:', error)
    return errorResponse('Failed to load call activity', error)
  }
}
