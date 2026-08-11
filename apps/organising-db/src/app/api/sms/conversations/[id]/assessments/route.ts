/**
 * POST /api/sms/conversations/[id]/assessments — record (or clear) an
 * activity assessment for the conversation's worker from the inbox
 * sidebar (Phase 3, brief §3.1 item 7 / §5.1).
 *
 * Write path: the EXISTING rating pipeline — record_assessment_event
 * (SECURITY DEFINER, EXECUTE granted to authenticated) upserting
 * campaign_activity_ratings with source 'sms'. Called via the user
 * client AFTER an explicit can_write_to_campaign check, because the
 * SECURITY DEFINER function bypasses RLS.
 *
 * Deliberately NOT an sms_interactions insert: trg_sms_to_rating fires
 * only on inbound-message rows, a staff-recorded assessment is not an
 * inbound message, and the trigger swallows errors — the direct RPC
 * call surfaces failures to the organiser instead.
 *
 * p_event_id is always NULL (an SMS thread is not an activity_events
 * occurrence — same rationale as 20260624110000 for phone calls).
 *
 * Clearing (rating and binary_value both null) deletes the worker's
 * 'actual' / NULL-event rating row for the activity — the explicit
 * "Unassessed" state (record_assessment_event refuses all-null values;
 * the wall-chart Ratings tab deletes the same way).
 *
 * worker_campaign_connections / worker_activity_log are deliberately
 * untouched: there is no shared lightweight RPC for the connection
 * upsert (record_call_attempt does it inline), and an assessment save
 * is a judgement, not a contact — re-saves must not inflate
 * contact_count. See docs/SMS_MODULE_PHASE3_PLAN.md.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { VOTE_SUPPORTER_OPTIONS } from '@/lib/campaign/constants'

const MAX_NOTES_CHARS = 2000
const MAX_BINARY_CHARS = 30

interface AssessmentBody {
  activity_id?: number
  rating?: number | null
  binary_value?: string | null
  notes?: string | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const conversationId = parseInt(id, 10)
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateLimit = await checkRateLimit(req)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason ?? 'Rate limited' },
        { status: 429, headers: rateLimit.headers },
      )
    }

    const body = (await req.json()) as AssessmentBody
    const activityId = body.activity_id
    if (activityId == null || !Number.isFinite(activityId)) {
      return NextResponse.json({ error: 'activity_id is required' }, { status: 400 })
    }

    const rating = body.rating ?? null
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return NextResponse.json(
        { error: 'rating must be an integer between 1 and 5' },
        { status: 400 },
      )
    }
    const binaryValue = body.binary_value?.trim() || null
    if (binaryValue && binaryValue.length > MAX_BINARY_CHARS) {
      return NextResponse.json(
        { error: `binary_value is too long (max ${MAX_BINARY_CHARS} characters)` },
        { status: 400 },
      )
    }
    if (
      binaryValue &&
      !VOTE_SUPPORTER_OPTIONS.some((o) => o.value === binaryValue)
    ) {
      return NextResponse.json(
        { error: 'binary_value must be one of yes/no/unsure/abstain' },
        { status: 400 },
      )
    }
    const notes = body.notes?.trim() ? body.notes.trim().slice(0, MAX_NOTES_CHARS) : null

    const { data: conversation, error: convErr } = await supabase
      .from('sms_conversations')
      .select('conversation_id, worker_id, campaign_id')
      .eq('conversation_id', conversationId)
      .maybeSingle()
    if (convErr) throw convErr
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    if (conversation.worker_id == null) {
      return NextResponse.json(
        { error: 'This conversation is not matched to a worker — match it before recording assessments.' },
        { status: 409 },
      )
    }
    if (conversation.campaign_id == null) {
      return NextResponse.json(
        { error: 'Attach the conversation to a campaign before recording assessments.' },
        { status: 409 },
      )
    }

    // The activity must belong to the conversation's campaign.
    const { data: activity, error: actErr } = await supabase
      .from('campaign_activities')
      .select('activity_id, campaign_id')
      .eq('activity_id', activityId)
      .maybeSingle()
    if (actErr) throw actErr
    if (!activity || activity.campaign_id !== conversation.campaign_id) {
      return NextResponse.json(
        { error: 'Activity not found in this conversation’s campaign' },
        { status: 400 },
      )
    }

    // Explicit permission gate — record_assessment_event is SECURITY
    // DEFINER, so RLS won't do this for us (matches POST …/messages).
    const { data: canWrite, error: permErr } = await supabase.rpc(
      'can_write_to_campaign',
      { p_campaign_id: conversation.campaign_id },
    )
    if (permErr) throw permErr
    if (!canWrite) {
      return NextResponse.json(
        { error: 'No write access to this campaign' },
        { status: 403 },
      )
    }

    if (rating == null && binaryValue == null) {
      // Explicit "Unassessed": delete the existing actual / NULL-event
      // rating row (user client — campaign_activity_ratings RLS applies,
      // same as the wall-chart Ratings tab delete).
      const { error: delErr } = await supabase
        .from('campaign_activity_ratings')
        .delete()
        .eq('activity_id', activityId)
        .eq('worker_id', conversation.worker_id)
        .eq('rating_phase', 'actual')
        .is('event_id', null)
      if (delErr) throw delErr
      return NextResponse.json({ ok: true, cleared: true })
    }

    const { data: ratingId, error: rpcErr } = await supabase.rpc(
      'record_assessment_event',
      {
        p_activity_id: activityId,
        p_worker_id: conversation.worker_id,
        p_rating: rating ?? undefined,
        p_binary_value: binaryValue ?? undefined,
        p_rating_phase: 'actual',
        p_source: 'sms',
        p_notes: notes ?? undefined,
        p_actor_id: user.id,
      },
    )
    if (rpcErr) throw rpcErr

    return NextResponse.json({ ok: true, rating_id: ratingId }, { status: 201 })
  } catch (error) {
    console.error('POST sms/conversations/[id]/assessments error:', error)
    return errorResponse('Failed to record assessment', error)
  }
}
