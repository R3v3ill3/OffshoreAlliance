/**
 * SMS list lifecycle actions: queue / pause / resume / cancel.
 *
 * queue  — server-side re-check of the composer's hard compliance
 *          failures (org name is a client warning, not a send blocker;
 *          Mobile Message does not append opt-out text), sender number
 *          required, then pending → queued with send_before stamped
 *          per the blackout window (brief §7.2). The dispatch cron
 *          does the actual sending.
 * pause  — queued/sending → paused (dispatcher skips paused lists).
 * resume — paused → queued.
 * cancel — any non-terminal status → cancelled; queued/pending items
 *          → skipped ("cancelled").
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { validateSmsBody } from '@/lib/sms/compliance'
import { computeSendBefore } from '@/lib/sms/blackout'
import { inboxUnsafePurposeError } from '@/lib/sms/sender-purpose'

export async function POST(
  req: NextRequest,
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
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { action } = (await req.json()) as { action?: string }
    if (!action || !['queue', 'pause', 'resume', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { data: list, error: listErr } = await supabase
      .from('sms_lists')
      .select('*')
      .eq('list_id', lid)
      .maybeSingle()
    if (listErr) throw listErr
    if (!list || list.campaign_id !== cid) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 })
    }

    // Belt: P2P chat boards send progressively via p2p-send and are
    // closed via their own PATCH — none of the blast lifecycle actions
    // apply, and 'queue' in particular must never put a board into the
    // cron-drained statuses.
    if ((list.mode ?? 'blast') === 'p2p') {
      return NextResponse.json(
        {
          error:
            'P2P chat boards are managed from the board (send / close) — blast actions do not apply',
        },
        { status: 409 },
      )
    }

    switch (action) {
      case 'queue': {
        if (list.status !== 'draft') {
          return NextResponse.json(
            { error: `Only draft lists can be queued (status: ${list.status})` },
            { status: 409 },
          )
        }
        if (!list.sender_number_id) {
          return NextResponse.json(
            { error: 'Choose a sender number before queueing' },
            { status: 400 },
          )
        }
        const { data: sender, error: senderErr } = await supabase
          .from('sms_numbers')
          .select('number_id, status, purpose')
          .eq('number_id', list.sender_number_id)
          .maybeSingle()
        if (senderErr) throw senderErr
        if (!sender || sender.status !== 'active') {
          return NextResponse.json(
            { error: 'Sender number is not active' },
            { status: 400 },
          )
        }
        const unsafe = inboxUnsafePurposeError(sender.purpose as string | null)
        if (unsafe) {
          return NextResponse.json({ error: unsafe }, { status: 409 })
        }
        if (!list.draft_id) {
          return NextResponse.json(
            { error: 'List has no linked draft' },
            { status: 400 },
          )
        }
        const { data: draft, error: draftErr } = await supabase
          .from('campaign_comms_drafts')
          .select('draft_id, body')
          .eq('draft_id', list.draft_id)
          .maybeSingle()
        if (draftErr) throw draftErr
        const draftBody = draft?.body?.trim() ?? ''
        if (!draftBody) {
          return NextResponse.json(
            { error: 'Message body is empty' },
            { status: 400 },
          )
        }
        // Compliance re-check — hard errors only (org name is a
        // client-side warning, not a send blocker).
        const compliance = validateSmsBody(draftBody)
        if (!compliance.ok) {
          return NextResponse.json(
            { error: compliance.errors.join(' ') },
            { status: 400 },
          )
        }
        if (list.blackout_override && !list.blackout_override_reason) {
          return NextResponse.json(
            { error: 'Blackout override requires a recorded reason' },
            { status: 400 },
          )
        }

        // Stamp send_before per the blackout window: from the scheduled
        // time when set, else from now.
        const baseTime = list.scheduled_for
          ? new Date(list.scheduled_for)
          : new Date()
        const sendBefore = computeSendBefore(
          baseTime,
          list.timezone || 'Australia/Perth',
          !!list.blackout_override,
        )

        const { data: queuedItems, error: qErr } = await supabase
          .from('sms_list_items')
          .update({
            status: 'queued',
            send_before: sendBefore.toISOString(),
          })
          .eq('list_id', lid)
          .eq('status', 'pending')
          .select('item_id')
        if (qErr) throw qErr
        if (!queuedItems || queuedItems.length === 0) {
          return NextResponse.json(
            { error: 'No sendable recipients on this list' },
            { status: 400 },
          )
        }

        const { error: sErr } = await supabase
          .from('sms_lists')
          .update({ status: 'queued', total_items: queuedItems.length })
          .eq('list_id', lid)
        if (sErr) throw sErr

        const { error: dErr } = await supabase
          .from('campaign_comms_drafts')
          .update({
            status: 'approved',
            sent_via: 'mobile_message',
            approved_by: user.id,
            approved_at: new Date().toISOString(),
          })
          .eq('draft_id', list.draft_id)
        if (dErr) throw dErr

        return NextResponse.json({
          ok: true,
          queued: queuedItems.length,
          send_before: sendBefore.toISOString(),
        })
      }

      case 'pause': {
        if (list.status !== 'queued' && list.status !== 'sending') {
          return NextResponse.json(
            { error: `Cannot pause a list with status "${list.status}"` },
            { status: 409 },
          )
        }
        const { error } = await supabase
          .from('sms_lists')
          .update({ status: 'paused' })
          .eq('list_id', lid)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      case 'resume': {
        if (list.status !== 'paused') {
          return NextResponse.json(
            { error: `Cannot resume a list with status "${list.status}"` },
            { status: 409 },
          )
        }
        const { error } = await supabase
          .from('sms_lists')
          .update({ status: 'queued' })
          .eq('list_id', lid)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      case 'cancel': {
        if (list.status === 'sent' || list.status === 'cancelled') {
          return NextResponse.json(
            { error: `Cannot cancel a list with status "${list.status}"` },
            { status: 409 },
          )
        }
        const { error: iErr } = await supabase
          .from('sms_list_items')
          .update({ status: 'skipped', failure_reason: 'Blast cancelled' })
          .eq('list_id', lid)
          .in('status', ['pending', 'queued'])
        if (iErr) throw iErr
        const { error } = await supabase
          .from('sms_lists')
          .update({ status: 'cancelled' })
          .eq('list_id', lid)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('POST sms-list action error:', error)
    return errorResponse('Failed to update SMS list', error)
  }
}
