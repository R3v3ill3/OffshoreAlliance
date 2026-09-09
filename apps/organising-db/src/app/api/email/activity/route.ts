/**
 * GET /api/email/activity — every email send across every campaign,
 * for the Actions hub. Read-only; there is no write path here.
 *
 * An email "action" is two things in the schema:
 *   • an `email_lists` row — an audience with a send status; and
 *   • a `campaign_comms_drafts` row on platform `email` that owns no
 *     list yet — an email an organiser started but has not built an
 *     audience for.
 * A draft that already owns a list would otherwise be counted twice,
 * so the drafts read filters `email_list_id IS NULL`. A draft that
 * gains a list moves from `drafts` to `lists` on the next fetch and is
 * never in both.
 *
 * `?campaign_id=N` narrows to one campaign; the hub does not send it
 * (it is the whole-of-universe view) but the campaign panels can.
 *
 * Reads only. `email_lists` and `campaign_comms_drafts` already return
 * cross-campaign rows to any authenticated user under their existing
 * SELECT policies, exactly as /api/sms/activity does; nothing here
 * widens that.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import type { EmailActivityRow, HubCampaignRef } from '@/lib/actions/hub-rows'

/** Newest first, capped per source — the hub is an overview, not an archive. */
const LIMIT = 200

export interface EmailActivityResponse {
  lists: EmailActivityRow[]
  drafts: EmailActivityRow[]
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

    let listQuery = supabase
      .from('email_lists')
      .select(
        'list_id, campaign_id, draft_id, name, status, total_items, sent_items, delivered_items, failed_items, created_by, created_at, updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(LIMIT)
    let draftQuery = supabase
      .from('campaign_comms_drafts')
      .select(
        'draft_id, campaign_id, platform, title, subject, status, email_list_id, created_by, created_at, updated_at',
      )
      .eq('platform', 'email')
      .is('email_list_id', null)
      .order('updated_at', { ascending: false })
      .limit(LIMIT)
    if (scoped) {
      listQuery = listQuery.eq('campaign_id', campaignId as number)
      draftQuery = draftQuery.eq('campaign_id', campaignId as number)
    }

    const [{ data: lists, error: lErr }, { data: drafts, error: dErr }] = await Promise.all([
      listQuery,
      draftQuery,
    ])
    if (lErr) throw lErr
    if (dErr) throw dErr

    const listRows = (lists ?? []) as Array<{
      list_id: number
      campaign_id: number
      draft_id: number | null
      name: string | null
      status: string
      total_items: number | null
      sent_items: number | null
      delivered_items: number | null
      failed_items: number | null
      created_by: string | null
      created_at: string
      updated_at: string
    }>
    const draftRows = (drafts ?? []) as Array<{
      draft_id: number
      campaign_id: number
      title: string | null
      subject: string | null
      status: string
      created_by: string | null
      created_at: string
      updated_at: string
    }>

    // Campaign names in one read rather than a join per table — the
    // same batched pattern /api/sms/activity uses.
    const campaignIds = [
      ...new Set(
        [...listRows, ...draftRows]
          .map((r) => r.campaign_id)
          .filter((v): v is number => v != null),
      ),
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

    const payload: EmailActivityResponse = {
      lists: listRows.map((l) => ({
        source: 'list',
        id: l.list_id,
        campaign_id: l.campaign_id,
        draft_id: l.draft_id,
        name: l.name?.trim() || 'Untitled email',
        status: l.status,
        total_items: l.total_items ?? 0,
        delivered_items: l.delivered_items ?? 0,
        failed_items: l.failed_items ?? 0,
        created_by: l.created_by,
        created_at: l.created_at,
        updated_at: l.updated_at,
        campaign: campaignById.get(l.campaign_id) ?? null,
      })),
      drafts: draftRows.map((d) => ({
        source: 'draft',
        id: d.draft_id,
        campaign_id: d.campaign_id,
        draft_id: d.draft_id,
        name: d.title?.trim() || d.subject?.trim() || 'Untitled email',
        status: d.status,
        total_items: 0,
        delivered_items: 0,
        failed_items: 0,
        created_by: d.created_by,
        created_at: d.created_at,
        updated_at: d.updated_at,
        campaign: campaignById.get(d.campaign_id) ?? null,
      })),
      scoped,
    }
    return NextResponse.json(payload)
  } catch (error) {
    console.error('GET email activity error:', error)
    return errorResponse('Failed to load email activity', error)
  }
}
