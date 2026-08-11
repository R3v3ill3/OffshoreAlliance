/**
 * SMS survey lifecycle actions: open / close.
 *
 * open  — draft only. Requires ≥ 1 question, an active sender number
 *         and a COMPLIANT invitation body (org name + opt-out — the
 *         invitation is a bulk send). Freezes the audience into
 *         'queued' sms_survey_sessions (opt-out / no-phone workers
 *         screened out and reported, never sessioned); the timers
 *         cron dispatches invitations on its next tick, respecting
 *         the blackout window and the one-live-session-per-phone rule.
 * close — open → closed; queued + live sessions → 'expired' (the
 *         webhook also expires stragglers as a belt).
 *
 * Sessions are service-role-only tables, so their writes go through
 * the ADMIN client — gated by an explicit can_write_to_campaign check
 * first (the house pattern for admin writes on behalf of a user).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { errorResponse } from '@/lib/api/error-response'
import { checkRateLimit } from '@/lib/rate-limit-middleware'
import { validateSmsBody } from '@/lib/sms/compliance'
import { invitationMentionsIndicative } from '@/lib/sms/survey-validation'
import { LIVE_SESSION_STATES, recordBallotEvents } from '@/lib/sms/survey-runtime'
import type { SmsSurveyRow } from '@/types/sms'

/** PostgREST caps responses at 1000 rows — page source reads. */
const PAGE_SIZE = 1000

type Audience =
  | { type: 'worker_list'; worker_list_id: number }
  | { type: 'campaign' }

interface ActionBody {
  action?: 'open' | 'close'
  audience?: Audience
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> },
) {
  try {
    const { id: campaignId, surveyId } = await params
    const cid = parseInt(campaignId, 10)
    const sid = parseInt(surveyId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(sid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
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

    const body = (await req.json()) as ActionBody
    if (body.action !== 'open' && body.action !== 'close') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { data: surveyRaw, error: surveyErr } = await supabase
      .from('sms_surveys')
      .select('*')
      .eq('survey_id', sid)
      .maybeSingle()
    if (surveyErr) throw surveyErr
    const survey = surveyRaw as SmsSurveyRow | null
    if (!survey || survey.campaign_id !== cid) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }

    // Explicit campaign gate ahead of any admin-client session write.
    const { data: canWrite, error: permErr } = await supabase.rpc(
      'can_write_to_campaign',
      { p_campaign_id: cid },
    )
    if (permErr) throw permErr
    if (!canWrite) {
      return NextResponse.json(
        { error: 'No write access to this campaign' },
        { status: 403 },
      )
    }

    const admin = createAdminClient()

    if (body.action === 'close') {
      if (survey.status !== 'open') {
        return NextResponse.json(
          { error: `Only open surveys can be closed (status: ${survey.status})` },
          { status: 409 },
        )
      }
      // Status flips run on the ADMIN client: the Phase 5 migration
      // makes the staff UPDATE policy draft-only (audit-trail
      // hardening), so post-draft transitions are service-role writes
      // behind the explicit can_write_to_campaign check above.
      const { error: updErr } = await admin
        .from('sms_surveys')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('survey_id', sid)
        .eq('status', 'open')
      if (updErr) throw updErr

      const { data: expired } = await admin
        .from('sms_survey_sessions')
        .update({ state: 'expired' })
        .eq('survey_id', sid)
        .in('state', ['queued', ...LIVE_SESSION_STATES])
        .select('session_id')

      // Ballot audit (§4.2): close + the tally snapshot at close
      // time (the view's rows frozen into the event log).
      if (survey.purpose === 'indicative_ballot') {
        const closedAt = new Date().toISOString()
        const { data: tally } = await admin
          .from('vw_sms_ballot_tally')
          .select('*')
          .eq('survey_id', sid)
          .order('sort_order', { ascending: true })
          .order('parsed_value', { ascending: true })
        await recordBallotEvents(admin, [
          {
            survey_id: sid,
            event_type: 'ballot_closed',
            payload: { expired_sessions: expired?.length ?? 0 },
            occurred_at: closedAt,
          },
          {
            survey_id: sid,
            event_type: 'tally_generated',
            payload: { tally: tally ?? [] },
            occurred_at: closedAt,
          },
        ])
      }

      return NextResponse.json({
        ok: true,
        expired_sessions: expired?.length ?? 0,
      })
    }

    // ── open ─────────────────────────────────────────────────
    if (survey.status !== 'draft') {
      return NextResponse.json(
        { error: `Only draft surveys can be opened (status: ${survey.status})` },
        { status: 409 },
      )
    }

    const { count: questionCount } = await supabase
      .from('sms_survey_questions')
      .select('question_id', { count: 'exact', head: true })
      .eq('survey_id', sid)
    if (!questionCount) {
      return NextResponse.json(
        { error: 'Add at least one question before opening' },
        { status: 400 },
      )
    }

    if (!survey.sender_number_id) {
      return NextResponse.json(
        { error: 'Choose a sender number before opening' },
        { status: 400 },
      )
    }
    const { data: sender } = await supabase
      .from('sms_numbers')
      .select('number_id, status')
      .eq('number_id', survey.sender_number_id)
      .maybeSingle()
    if (!sender || sender.status !== 'active') {
      return NextResponse.json(
        { error: 'Sender number is not active' },
        { status: 400 },
      )
    }

    // The invitation is a bulk send — org name + opt-out required
    // (the dispatch cron re-checks as a second belt).
    const compliance = validateSmsBody(survey.invitation_body ?? '')
    if (!compliance.ok) {
      return NextResponse.json(
        { error: `Invitation not compliant: ${compliance.errors.join(' ')}` },
        { status: 400 },
      )
    }

    // Ballot compliance boundary (brief §4.2/§8.1): the stored
    // framing must describe the poll as indicative — in-app ballots
    // SUPPLEMENT formal AEC/FWC-agent ballots, never replace them.
    if (
      survey.purpose === 'indicative_ballot' &&
      !invitationMentionsIndicative(survey.invitation_body)
    ) {
      return NextResponse.json(
        {
          error:
            'Ballot invitations must describe the poll as "indicative" — ' +
            'formal protected action ballots must be conducted by the AEC ' +
            'or an FWC-approved ballot agent (SMS brief §4.2/§8.1).',
        },
        { status: 400 },
      )
    }

    // A ballot's Q1 must be parseable as a vote: the completed-session
    // revote leg treats a PARSED Q1 answer as a vote attempt, and an
    // open_text Q1 parses everything — it would swallow every
    // conversational message from completed voters.
    if (survey.purpose === 'indicative_ballot') {
      const { data: firstQ } = await supabase
        .from('sms_survey_questions')
        .select('qtype')
        .eq('survey_id', sid)
        .order('sort_order', { ascending: true })
        .order('question_id', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (firstQ?.qtype === 'open_text') {
        return NextResponse.json(
          {
            error:
              "An indicative ballot's first question must be a choice, " +
              'yes/no or scale question.',
          },
          { status: 400 },
        )
      }
    }

    const audience = body.audience
    if (
      !audience ||
      (audience.type !== 'worker_list' && audience.type !== 'campaign') ||
      (audience.type === 'worker_list' &&
        !Number.isFinite(audience.worker_list_id))
    ) {
      return NextResponse.json({ error: 'Invalid audience' }, { status: 400 })
    }

    // Audience → ordered worker ids (sms-lists idiom, paged).
    const workerIds: number[] = []
    if (audience.type === 'worker_list') {
      const { data: wl, error: wlErr } = await supabase
        .from('campaign_worker_lists')
        .select('list_id, campaign_id')
        .eq('list_id', audience.worker_list_id)
        .maybeSingle()
      if (wlErr) throw wlErr
      if (!wl || wl.campaign_id !== cid) {
        return NextResponse.json(
          { error: 'Worker list not found' },
          { status: 404 },
        )
      }
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: items, error: itemsErr } = await supabase
          .from('campaign_worker_list_items')
          .select('worker_id, sort_order')
          .eq('list_id', audience.worker_list_id)
          .order('sort_order', { ascending: true })
          .order('worker_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (itemsErr) throw itemsErr
        workerIds.push(...(items ?? []).map((r) => r.worker_id))
        if (!items || items.length < PAGE_SIZE) break
      }
    } else {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: members, error: memErr } = await supabase
          .from('campaign_worker_membership')
          .select('worker_id')
          .eq('campaign_id', cid)
          .order('worker_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (memErr) throw memErr
        workerIds.push(...(members ?? []).map((r) => r.worker_id))
        if (!members || members.length < PAGE_SIZE) break
      }
    }
    const uniqueWorkerIds = [...new Set(workerIds)]
    if (uniqueWorkerIds.length === 0) {
      return NextResponse.json(
        { error: 'Audience is empty — no workers found' },
        { status: 400 },
      )
    }

    // Consent + phone screening (union-wide suppression at audience
    // time; the cron re-checks opt-out again at send time).
    const sessionRows: Array<{
      survey_id: number
      survey_version: number
      worker_id: number
      phone_e164: string
      state: 'queued'
    }> = []
    let optedOut = 0
    let noPhone = 0
    for (let i = 0; i < uniqueWorkerIds.length; i += 500) {
      const chunk = uniqueWorkerIds.slice(i, i + 500)
      const { data: workers, error: wErr } = await supabase
        .from('workers')
        .select('worker_id, phone_e164, sms_opt_out')
        .in('worker_id', chunk)
      if (wErr) throw wErr
      for (const w of workers ?? []) {
        if (w.sms_opt_out) {
          optedOut++
        } else if (!w.phone_e164) {
          noPhone++
        } else {
          sessionRows.push({
            survey_id: sid,
            survey_version: survey.version,
            worker_id: w.worker_id,
            phone_e164: w.phone_e164,
            state: 'queued',
          })
        }
      }
    }
    if (sessionRows.length === 0) {
      return NextResponse.json(
        {
          error: `No invitable workers — ${optedOut} opted out, ${noPhone} without a mobile`,
        },
        { status: 400 },
      )
    }

    let created = 0
    for (let i = 0; i < sessionRows.length; i += 500) {
      const { data: inserted, error: insErr } = await admin
        .from('sms_survey_sessions')
        .upsert(sessionRows.slice(i, i + 500), {
          onConflict: 'survey_id,worker_id',
          ignoreDuplicates: true,
        })
        .select('session_id')
      if (insErr) throw insErr
      created += inserted?.length ?? 0
    }

    // Ballot roll freeze (§4.2 "roll first"): the eligibility roll is
    // EXACTLY the invited audience (post consent/phone screening — the
    // same rows that became queued sessions). Turnout reports against
    // this snapshot.
    if (survey.purpose === 'indicative_ballot') {
      const openedAt = new Date().toISOString()
      for (let i = 0; i < sessionRows.length; i += 500) {
        const { error: rollErr } = await admin.from('sms_ballot_roll').upsert(
          sessionRows.slice(i, i + 500).map((s) => ({
            survey_id: sid,
            worker_id: s.worker_id,
            phone_e164: s.phone_e164,
            included_at: openedAt,
            source: 'audience_freeze',
          })),
          { onConflict: 'survey_id,worker_id', ignoreDuplicates: true },
        )
        if (rollErr) throw rollErr
      }
      await recordBallotEvents(admin, [
        {
          survey_id: sid,
          event_type: 'ballot_opened',
          payload: {
            audience,
            revote_policy: survey.revote_policy ?? 'locked',
            results_restricted: !!survey.results_restricted,
          },
          occurred_at: openedAt,
        },
        {
          survey_id: sid,
          event_type: 'roll_frozen',
          payload: {
            roll_count: sessionRows.length,
            screened_opted_out: optedOut,
            screened_no_phone: noPhone,
          },
          occurred_at: openedAt,
        },
      ])
    }

    // Admin client + draft guard: see the close-branch note (the
    // staff UPDATE policy is draft-only post-Phase 5).
    const { error: openErr } = await admin
      .from('sms_surveys')
      .update({ status: 'open', opened_at: new Date().toISOString() })
      .eq('survey_id', sid)
      .eq('status', 'draft')
    if (openErr) throw openErr

    return NextResponse.json({
      ok: true,
      sessions_created: created,
      opted_out: optedOut,
      skipped_no_phone: noPhone,
    })
  } catch (error) {
    console.error('POST sms-survey actions error:', error)
    return errorResponse('Failed to update SMS survey', error)
  }
}
