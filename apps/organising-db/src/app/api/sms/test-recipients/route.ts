/**
 * The SMS testing roster — who test-mode surveys are allowed to reach.
 *
 * GET    ?campaign_id=N — the org-wide roster plus this campaign's own
 *                          testers, which is exactly the audience a
 *                          test send resolves to.
 * POST   { worker_id, campaign_id?, label? } — add a tester. Omit
 *                          campaign_id for the org-wide roster.
 * DELETE ?test_recipient_id=N — remove one.
 *
 * Recipients are workers because sms_survey_sessions.worker_id is NOT
 * NULL: a survey session cannot exist without one. Staff who test need
 * a worker record — the audience picker's "Add person" creates one.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

interface RecipientRow {
  test_recipient_id: number
  worker_id: number
  campaign_id: number | null
  label: string | null
  worker: {
    first_name: string | null
    last_name: string | null
    phone_e164: string | null
    sms_opt_out: boolean | null
  } | null
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

    let query = supabase
      .from('sms_test_recipients')
      .select(
        `test_recipient_id, worker_id, campaign_id, label,
         worker:workers(first_name, last_name, phone_e164, sms_opt_out)`,
      )
      .order('test_recipient_id', { ascending: true })

    // Without a campaign, only the org-wide roster is meaningful —
    // another campaign's testers are not this caller's business.
    query = Number.isFinite(campaignId)
      ? query.or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
      : query.is('campaign_id', null)

    const { data, error } = await query
    if (error) throw error

    const rows = (data ?? []) as unknown as RecipientRow[]
    return NextResponse.json({
      recipients: rows.map((r) => ({
        test_recipient_id: r.test_recipient_id,
        worker_id: r.worker_id,
        campaign_id: r.campaign_id,
        scope: r.campaign_id == null ? 'org' : 'campaign',
        label: r.label,
        name: `${r.worker?.first_name ?? ''} ${r.worker?.last_name ?? ''}`.trim(),
        phone_e164: r.worker?.phone_e164 ?? null,
        sms_opt_out: !!r.worker?.sms_opt_out,
      })),
    })
  } catch (error) {
    console.error('GET sms test-recipients error:', error)
    return errorResponse('Failed to load test recipients', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      worker_id?: number
      campaign_id?: number | null
      label?: string | null
    }
    if (!Number.isFinite(body.worker_id)) {
      return NextResponse.json({ error: 'worker_id is required' }, { status: 400 })
    }

    const { data: worker } = await supabase
      .from('workers')
      .select('worker_id, phone_e164')
      .eq('worker_id', body.worker_id as number)
      .maybeSingle()
    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
    }
    // A tester with no mobile would be screened out at send time and
    // silently shrink the test audience — refuse it here instead.
    if (!worker.phone_e164) {
      return NextResponse.json(
        { error: 'That person has no mobile number on file, so a test send could not reach them.' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from('sms_test_recipients')
      .insert({
        worker_id: body.worker_id as number,
        campaign_id: body.campaign_id ?? null,
        label: body.label?.trim() || null,
        created_by: user.id,
      })
      .select('test_recipient_id')
      .maybeSingle()
    if (error) {
      // Unique index on (worker_id, COALESCE(campaign_id, 0)).
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'They are already on this test roster.' },
          { status: 409 },
        )
      }
      throw error
    }

    return NextResponse.json({ ok: true, test_recipient_id: data?.test_recipient_id })
  } catch (error) {
    console.error('POST sms test-recipients error:', error)
    return errorResponse('Failed to add test recipient', error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const raw = req.nextUrl.searchParams.get('test_recipient_id')
    const id = raw ? parseInt(raw, 10) : NaN
    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { error: 'test_recipient_id is required' },
        { status: 400 },
      )
    }

    const { error } = await supabase
      .from('sms_test_recipients')
      .delete()
      .eq('test_recipient_id', id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE sms test-recipients error:', error)
    return errorResponse('Failed to remove test recipient', error)
  }
}
