/**
 * Survey timers cron (brief §4.1) — registered in vercel.json every
 * 10 minutes. Per open survey:
 *
 *   1. Session TTL expiry — live sessions whose invitation is older
 *      than session_ttl_hours → 'expired' (runs regardless of the
 *      blackout window; nothing is sent).
 *   2. Invitation dispatch — queued → invited. Bulk-adjacent, so it
 *      respects the survey's blackout window (unless a recorded
 *      override) and re-validates the invitation compliance
 *      (org name + opt-out) at dispatch time. The one-live-session-
 *      per-phone rule is enforced twice: a pre-check defers queued
 *      invitations for busy phones, and the partial unique index
 *      turns any race into a 23505 → defer. Send-time re-checks:
 *      worker opt-out → 'opted_out'; provider blocked → opt-out
 *      mirror + 'opted_out'; provider error → claim reverted to
 *      queued (transient) with the failure surfaced in the summary.
 *      Invitation = invitation_body + question 1 in ONE send.
 *   3. Question-timeout nudges — one per question (nudged flag,
 *      reset when the session advances), after
 *      question_timeout_minutes without a reply. Blackout-respecting.
 *   4. Reminders — max reminder_offsets.length (default 2) per
 *      session, at invited_at + offsets[n], varied copy, never
 *      within 60 min of another prompt. Blackout-respecting.
 *
 * Plus a belt: live sessions on closed surveys are expired.
 *
 * Phase 6 final step: relay forwards — quiet-hours-deferred
 * ('queued', approved) member→target relay messages on ACTIVE
 * relays are forwarded once the relay's window opens (and nothing
 * else — held/pending/rejected rows are never touched). Lives here
 * rather than dispatch-sms-queue because this route is the module's
 * deferred-sends home; the dispatcher is tightly list-shaped.
 *
 * Authentication: Vercel cron `Authorization: Bearer <CRON_SECRET>`
 * (clone of dispatch-sms-queue).
 */
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSmsProvider } from '@/lib/sms/provider'
import {
  DEFAULT_SMS_TIMEZONE,
  isWithinSendWindow,
} from '@/lib/sms/blackout'
import { validateSmsBody } from '@/lib/sms/compliance'
import { invitationMentionsIndicative } from '@/lib/sms/survey-validation'
import {
  renderInvitation,
  renderNudge,
  renderReminder,
} from '@/lib/sms/survey-engine'
import {
  LIVE_SESSION_STATES,
  ensureSurveyConversation,
  mirrorWorkerOptOut,
  recordBallotEvents,
  sendSurveyPrompt,
  type BallotEventInsert,
} from '@/lib/sms/survey-runtime'
import {
  processQueuedRelayForwards,
  type RelayForwardsSummary,
} from '@/lib/sms/relay-runtime'
import type {
  SmsSurveyQuestionRow,
  SmsSurveyRow,
  SmsSurveySessionRow,
} from '@/types/sms'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

const UNIQUE_VIOLATION = '23505'
/** Total prompt sends per run (invitations + nudges + reminders). */
const RUN_SEND_CAP = 200
/** Never stack a reminder within this many minutes of another prompt. */
const PROMPT_SPACING_MINUTES = 60

function minutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60 * 1000).toISOString()
}

function reminderOffsets(survey: SmsSurveyRow): number[] {
  const raw = survey.reminder_offsets
  if (!Array.isArray(raw)) return []
  return raw
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
    .slice(0, 2) // §4.1: max 2 reminders
}

function questionById(
  questions: SmsSurveyQuestionRow[],
  id: number | null,
): SmsSurveyQuestionRow | null {
  return questions.find((q) => q.question_id === id) ?? null
}

export async function GET(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization') ?? ''
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ error: 'missing supabase env' }, { status: 500 })
  }

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  const now = new Date()
  const nowIso = now.toISOString()
  const summary = {
    surveys_seen: 0,
    surveys_blocked_by_window: [] as number[],
    surveys_noncompliant_invitation: [] as number[],
    invited: 0,
    deferred_live_phone: 0,
    nudged: 0,
    reminded: 0,
    expired: 0,
    opted_out: 0,
    undeliverable: 0,
    closed_survey_sessions_expired: 0,
    errors: [] as Array<{ survey_id: number; error: string }>,
    relay_forwards: null as RelayForwardsSummary | null,
  }
  let sendBudget = RUN_SEND_CAP

  let provider: Awaited<ReturnType<typeof getSmsProvider>> | null = null
  const getProvider = async () => {
    if (!provider) provider = await getSmsProvider()
    return provider
  }

  // Belt: live sessions on closed surveys → expired.
  try {
    const { data: strays } = await supabase
      .from('sms_survey_sessions')
      .select('session_id, sms_surveys!inner(status)')
      .in('state', [...LIVE_SESSION_STATES])
      .eq('sms_surveys.status', 'closed')
    const strayIds = (strays ?? []).map((s) => s.session_id as number)
    if (strayIds.length > 0) {
      await supabase
        .from('sms_survey_sessions')
        .update({ state: 'expired' })
        .in('session_id', strayIds)
        .in('state', [...LIVE_SESSION_STATES])
      summary.closed_survey_sessions_expired = strayIds.length
    }
  } catch (err) {
    console.error('sms-survey-timers: closed-survey sweep failed:', err)
  }

  const { data: surveysRaw, error: surveyErr } = await supabase
    .from('sms_surveys')
    .select('*')
    .eq('status', 'open')
    .order('survey_id', { ascending: true })
  if (surveyErr) {
    return NextResponse.json({ error: surveyErr.message }, { status: 500 })
  }
  const surveys = (surveysRaw ?? []) as SmsSurveyRow[]
  summary.surveys_seen = surveys.length

  for (const survey of surveys) {
    try {
      const tz = survey.timezone || DEFAULT_SMS_TIMEZONE

      // ── 1. TTL expiry (window-independent) ──────────────────
      const ttlCutoff = minutesAgo(now, survey.session_ttl_hours * 60)
      const { data: expired } = await supabase
        .from('sms_survey_sessions')
        .update({ state: 'expired' })
        .eq('survey_id', survey.survey_id)
        .in('state', [...LIVE_SESSION_STATES])
        .lt('invited_at', ttlCutoff)
        .select('session_id')
      summary.expired += expired?.length ?? 0

      // Blackout window: invitations/nudges/reminders are bulk-
      // adjacent — deferred to the next window unless overridden.
      if (!survey.blackout_override && !isWithinSendWindow(now, tz)) {
        summary.surveys_blocked_by_window.push(survey.survey_id)
        continue
      }
      if (sendBudget <= 0) continue

      const { data: questionsRaw, error: qErr } = await supabase
        .from('sms_survey_questions')
        .select('*')
        .eq('survey_id', survey.survey_id)
        .order('sort_order', { ascending: true })
        .order('question_id', { ascending: true })
      if (qErr) throw qErr
      const questions = (questionsRaw ?? []) as SmsSurveyQuestionRow[]
      if (questions.length === 0) continue
      const firstQuestion = questions[0]

      const { data: senderRow } = await supabase
        .from('sms_numbers')
        .select('number_id, phone_e164, status')
        .eq('number_id', survey.sender_number_id ?? -1)
        .maybeSingle()
      if (!senderRow || senderRow.status !== 'active') {
        throw new Error('Survey sender number missing or retired')
      }
      const senderDigits = (senderRow.phone_e164 as string).replace(/^\+/, '')

      // ── 2. Invitation dispatch ──────────────────────────────
      // Compliance re-checks at dispatch time (belts behind the open
      // route): org name + opt-out for every survey; the §4.2/§8.1
      // "indicative" framing for ballots.
      const compliance = validateSmsBody(survey.invitation_body ?? '')
      const indicativeOk =
        survey.purpose !== 'indicative_ballot' ||
        invitationMentionsIndicative(survey.invitation_body)
      if (!compliance.ok || !indicativeOk) {
        summary.surveys_noncompliant_invitation.push(survey.survey_id)
        summary.errors.push({
          survey_id: survey.survey_id,
          error: !compliance.ok
            ? `Invitations held — non-compliant invitation body: ${compliance.errors.join(' ')}`
            : 'Invitations held — ballot invitation must describe the poll as "indicative" (brief §4.2/§8.1)',
        })
      } else {
        const { data: queuedRaw } = await supabase
          .from('sms_survey_sessions')
          .select('*')
          .eq('survey_id', survey.survey_id)
          .eq('state', 'queued')
          .order('session_id', { ascending: true })
          .limit(sendBudget)
        const queued = (queuedRaw ?? []) as SmsSurveySessionRow[]

        // Pre-check: phones already holding a live session (any
        // survey) — defer those invitations to a later tick.
        const busyPhones = new Set<string>()
        const phones = [...new Set(queued.map((s) => s.phone_e164))]
        for (let i = 0; i < phones.length; i += 500) {
          const { data: live } = await supabase
            .from('sms_survey_sessions')
            .select('phone_e164')
            .in('phone_e164', phones.slice(i, i + 500))
            .in('state', [...LIVE_SESSION_STATES])
          for (const row of live ?? []) busyPhones.add(row.phone_e164 as string)
        }

        // Send-time opt-out re-check (union-wide suppression).
        const workerIds = queued.map((s) => s.worker_id)
        const optedOut = new Set<number>()
        for (let i = 0; i < workerIds.length; i += 500) {
          const { data: ws } = await supabase
            .from('workers')
            .select('worker_id, sms_opt_out')
            .in('worker_id', workerIds.slice(i, i + 500))
          for (const w of ws ?? []) {
            if (w.sms_opt_out) optedOut.add(w.worker_id as number)
          }
        }

        // Ballot audit: invitation_sent events, batched per survey
        // (best-effort insert after the loop).
        const ballotInvitationEvents: BallotEventInsert[] = []

        for (const session of queued) {
          if (sendBudget <= 0) break
          if (busyPhones.has(session.phone_e164)) {
            summary.deferred_live_phone += 1
            continue
          }
          if (optedOut.has(session.worker_id)) {
            await supabase
              .from('sms_survey_sessions')
              .update({ state: 'opted_out', last_activity_at: nowIso })
              .eq('session_id', session.session_id)
              .eq('state', 'queued')
            summary.opted_out += 1
            continue
          }

          const conversationId = await ensureSurveyConversation(supabase, {
            ourNumberId: senderRow.number_id as number,
            phoneE164: session.phone_e164,
            workerId: session.worker_id,
            campaignId: survey.campaign_id,
            occurredAt: nowIso,
          })

          // Claim queued → invited. The partial unique index turns a
          // lost race (another survey went live on this phone since
          // the pre-check) into a 23505 → leave queued, defer.
          const { data: claimed, error: claimErr } = await supabase
            .from('sms_survey_sessions')
            .update({
              state: 'invited',
              invited_at: nowIso,
              current_question_id: firstQuestion.question_id,
              last_prompt_at: nowIso,
              survey_version: survey.version,
              conversation_id: conversationId,
            })
            .eq('session_id', session.session_id)
            .eq('state', 'queued')
            .select('session_id')
          if (claimErr) {
            if (claimErr.code === UNIQUE_VIOLATION) {
              summary.deferred_live_phone += 1
              continue
            }
            throw claimErr
          }
          if (!claimed || claimed.length === 0) continue

          busyPhones.add(session.phone_e164)
          sendBudget -= 1
          const result = await sendSurveyPrompt(supabase, await getProvider(), {
            session: {
              session_id: session.session_id,
              phone_e164: session.phone_e164,
              conversation_id: conversationId,
            },
            senderDigits,
            body: renderInvitation(survey.invitation_body, firstQuestion),
            kind: 'invitation',
          })

          if (result?.status === 'success') {
            summary.invited += 1
            if (survey.purpose === 'indicative_ballot') {
              ballotInvitationEvents.push({
                survey_id: survey.survey_id,
                event_type: 'invitation_sent',
                worker_id: session.worker_id,
                session_id: session.session_id,
                payload: { provider_message_id: result.providerMessageId ?? null },
                occurred_at: nowIso,
              })
            }
          } else if (result?.status === 'blocked') {
            await mirrorWorkerOptOut(supabase, session.worker_id, nowIso)
            await supabase
              .from('sms_survey_sessions')
              .update({ state: 'opted_out', last_activity_at: nowIso })
              .eq('session_id', session.session_id)
              .eq('state', 'invited')
            summary.opted_out += 1
          } else if (result?.status === 'error') {
            await supabase
              .from('sms_survey_sessions')
              .update({ state: 'undeliverable', last_activity_at: nowIso })
              .eq('session_id', session.session_id)
              .eq('state', 'invited')
            summary.undeliverable += 1
            summary.errors.push({
              survey_id: survey.survey_id,
              error: `Invitation send failed for session ${session.session_id}: ${
                result.error ?? 'provider error'
              }`,
            })
          } else {
            // Provider call threw (null result): transient — revert
            // the claim so a later tick retries.
            await supabase
              .from('sms_survey_sessions')
              .update({
                state: 'queued',
                invited_at: null,
                current_question_id: null,
                last_prompt_at: null,
              })
              .eq('session_id', session.session_id)
              .eq('state', 'invited')
            busyPhones.delete(session.phone_e164)
          }
        }

        await recordBallotEvents(supabase, ballotInvitationEvents)
      }

      // ── 3. Question-timeout nudges (one per question) ───────
      if (sendBudget > 0) {
        const nudgeCutoff = minutesAgo(now, survey.question_timeout_minutes)
        const { data: stalledRaw } = await supabase
          .from('sms_survey_sessions')
          .select('*')
          .eq('survey_id', survey.survey_id)
          .in('state', [...LIVE_SESSION_STATES])
          .eq('nudged', false)
          .lt('last_prompt_at', nudgeCutoff)
          .order('session_id', { ascending: true })
          .limit(sendBudget)
        for (const session of (stalledRaw ?? []) as SmsSurveySessionRow[]) {
          if (sendBudget <= 0) break
          const question = questionById(questions, session.current_question_id)
          if (!question) continue

          // Claim BEFORE sending — an overlapping tick (or a crashed
          // flag write) must never double-nudge every 10 minutes.
          const { data: claimed } = await supabase
            .from('sms_survey_sessions')
            .update({ nudged: true, last_prompt_at: nowIso })
            .eq('session_id', session.session_id)
            .eq('nudged', false)
            .in('state', [...LIVE_SESSION_STATES])
            .select('session_id')
          if (!claimed || claimed.length === 0) continue

          sendBudget -= 1
          const result = await sendSurveyPrompt(supabase, await getProvider(), {
            session,
            senderDigits,
            body: renderNudge(question),
            kind: 'nudge',
          })
          if (result?.status === 'success') {
            summary.nudged += 1
          } else if (result?.status === 'blocked') {
            await mirrorWorkerOptOut(supabase, session.worker_id, nowIso)
            await supabase
              .from('sms_survey_sessions')
              .update({ state: 'opted_out', last_activity_at: nowIso })
              .eq('session_id', session.session_id)
              .in('state', [...LIVE_SESSION_STATES])
          } else {
            // Send failed: revert the claim (best effort) so a later
            // tick retries; last_prompt_at stays stamped, so the
            // retry waits out another timeout period.
            const { error: revertErr } = await supabase
              .from('sms_survey_sessions')
              .update({ nudged: false })
              .eq('session_id', session.session_id)
              .eq('nudged', true)
            if (revertErr) {
              console.error(
                `sms-survey-timers: nudge claim revert failed (session ${session.session_id}):`,
                revertErr,
              )
            }
          }
        }
      }

      // ── 4. Reminders (max reminder_offsets.length) ──────────
      const offsets = reminderOffsets(survey)
      if (sendBudget > 0 && offsets.length > 0) {
        const spacingCutoff = minutesAgo(now, PROMPT_SPACING_MINUTES)
        const { data: candidatesRaw } = await supabase
          .from('sms_survey_sessions')
          .select('*')
          .eq('survey_id', survey.survey_id)
          .in('state', [...LIVE_SESSION_STATES])
          .lt('reminders_sent', offsets.length)
          .lt('last_prompt_at', spacingCutoff)
          .order('session_id', { ascending: true })
          .limit(sendBudget * 2)
        for (const session of (candidatesRaw ?? []) as SmsSurveySessionRow[]) {
          if (sendBudget <= 0) break
          if (!session.invited_at) continue
          const offset = offsets[session.reminders_sent]
          if (offset == null) continue
          const due =
            Date.parse(session.invited_at) + offset * 60 * 1000 <= now.getTime()
          if (!due) continue
          const question = questionById(questions, session.current_question_id)
          if (!question) continue

          // Claim BEFORE sending (same rationale as nudges): bump the
          // counter conditionally on its previous value.
          const { data: claimed } = await supabase
            .from('sms_survey_sessions')
            .update({
              reminders_sent: session.reminders_sent + 1,
              last_prompt_at: nowIso,
            })
            .eq('session_id', session.session_id)
            .eq('reminders_sent', session.reminders_sent)
            .in('state', [...LIVE_SESSION_STATES])
            .select('session_id')
          if (!claimed || claimed.length === 0) continue

          sendBudget -= 1
          const result = await sendSurveyPrompt(supabase, await getProvider(), {
            session,
            senderDigits,
            body: renderReminder(question),
            kind: 'reminder',
          })
          if (result?.status === 'success') {
            summary.reminded += 1
          } else if (result?.status === 'blocked') {
            await mirrorWorkerOptOut(supabase, session.worker_id, nowIso)
            await supabase
              .from('sms_survey_sessions')
              .update({ state: 'opted_out', last_activity_at: nowIso })
              .eq('session_id', session.session_id)
              .in('state', [...LIVE_SESSION_STATES])
          } else {
            const { error: revertErr } = await supabase
              .from('sms_survey_sessions')
              .update({ reminders_sent: session.reminders_sent })
              .eq('session_id', session.session_id)
              .eq('reminders_sent', session.reminders_sent + 1)
            if (revertErr) {
              console.error(
                `sms-survey-timers: reminder claim revert failed (session ${session.session_id}):`,
                revertErr,
              )
            }
          }
        }
      }
    } catch (err) {
      summary.errors.push({
        survey_id: survey.survey_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Phase 6 final step: quiet-hours-deferred relay forwards ──
  try {
    summary.relay_forwards = await processQueuedRelayForwards(
      supabase,
      await getProvider(),
      now,
    )
  } catch (err) {
    console.error('sms-survey-timers: relay forwards failed:', err)
  }

  return NextResponse.json(summary)
}
