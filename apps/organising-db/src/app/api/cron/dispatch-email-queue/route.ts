/**
 * Cron worker that drains queued email list items through the platform
 * email provider (SendGrid). Registered in vercel.json at *​/5 * * * *.
 * Clone of dispatch-sms-queue — same claim/recovery/monotonic-write
 * discipline.
 *
 * Double-send protection: items are atomically claimed
 * (queued → 'sending' + claimed_at, guarded by the status predicate on
 * the UPDATE) before any provider call; claims stranded by a crash are
 * recovered back to 'queued' after 15 minutes.
 *
 * Per eligible list (status queued/sending, schedule due, send window
 * open in the list's timezone unless a recorded override):
 *   1. Load draft + wrapper and re-validate compliance (the wrapper must
 *      still carry {{unsubscribe_url}}); a failure PAUSES the list —
 *      never sends non-compliant copy.
 *   2. Claim a batch, then re-check workers.email_opt_out /
 *      email_status / address presence at send time (audience-time
 *      screening is not enough — an unsubscribe may arrive between
 *      queue and send).
 *   3. Resolve merge fields per worker (shared campaign context loader +
 *      worker fields), sanitise, wrap, inject the per-recipient
 *      unsubscribe URL and List-Unsubscribe headers.
 *   4. Upsert email_send_log rows (custom_args.send_id = send_id — the
 *      webhook correlation handle), mint email_unsubscribe_tokens, then
 *      provider.sendBatch with a per-batch idempotency key.
 *   5. Write per-item results: success → sent (+provider_message_id),
 *      error → failed (+reason).
 *   6. Recount list counters (count queries — never row fetches); when
 *      drained, complete the list and stamp the draft sent via
 *      'sendgrid'.
 *
 * Authentication: Vercel cron `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  getEmailProvider,
  getEmailSenderIdentity,
  type OutboundEmail,
  type EmailSendResult,
} from '@/lib/email/provider'
import {
  applyWrapper,
  buildListUnsubscribeHeaders,
  generateUnsubscribeToken,
  unsubscribeUrlForToken,
  validateOutboundHtml,
  wrapperHasUnsubscribePlaceholder,
} from '@/lib/email/wrapper'
import {
  isWithinSendWindow,
  computeSendBefore,
  DEFAULT_SMS_TIMEZONE,
} from '@/lib/sms/blackout'
import { resolveScriptVariablesIncludingChips } from '@/lib/comms/template-variables'
import { stripMergeFieldChips } from '@/lib/comms/chip-html'
import { sanitiseEmailHtml } from '@/lib/comms/sanitise-email-html'
import { htmlToPlain } from '@/lib/comms/mailto-builder'
import {
  loadCampaignEmailContext,
  buildWorkerEmailContext,
} from '@/lib/comms/campaign-email-context'
import { tagWorkerEmailed } from '@/lib/comms/send-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

/** Total items processed per run (keeps the function inside cron limits). */
const RUN_BATCH_CAP = 500
/** Parallelism for per-item result writes. */
const WRITE_CHUNK = 25
/** 'sending' claims older than this are assumed crashed and re-queued. */
const STALE_CLAIM_MINUTES = 15

interface ListRow {
  list_id: number
  campaign_id: number
  draft_id: number | null
  status: string
  wrapper_id: number | null
  timezone: string | null
  blackout_override: boolean
  scheduled_for: string | null
  created_by: string | null
}

interface ItemRow {
  item_id: number
  worker_id: number
  email: string | null
  sort_order: number
}

interface WorkerRow {
  worker_id: number
  first_name: string | null
  last_name: string | null
  email: string | null
  email_status: string | null
  email_opt_out: boolean
  occupation: string | null
  employer_name: string | null
  worksite_name: string | null
}

function textToHtml(text: string): string {
  if (!text) return ''
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

async function inChunks<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += WRITE_CHUNK) {
    await Promise.all(items.slice(i, i + WRITE_CHUNK).map(fn))
  }
}

/** Exact per-status count without fetching rows (PostgREST caps at 1000). */
async function countItems(
  supabase: SupabaseClient,
  listId: number,
  statuses: string[],
): Promise<number> {
  const { count } = await supabase
    .from('email_list_items')
    .select('item_id', { count: 'exact', head: true })
    .eq('list_id', listId)
    .in('status', statuses)
  return count ?? 0
}

/** Complete the list + stamp the draft when everything is drained. */
async function completeIfDrained(
  supabase: SupabaseClient,
  list: ListRow,
): Promise<boolean> {
  const remaining = await countItems(supabase, list.list_id, [
    'queued',
    'pending',
    'sending',
  ])
  if (remaining !== 0) return false
  await supabase
    .from('email_lists')
    .update({ status: 'sent' })
    .eq('list_id', list.list_id)
    .in('status', ['queued', 'sending'])
  if (list.draft_id) {
    await supabase
      .from('campaign_comms_drafts')
      .update({ status: 'sent', sent_via: 'sendgrid' })
      .eq('draft_id', list.draft_id)
  }
  return true
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  const now = new Date()
  const summary = {
    lists_seen: 0,
    lists_blocked_by_window: [] as number[],
    lists_paused_non_compliant: [] as number[],
    lists_completed: [] as number[],
    stale_claims_recovered: 0,
    sent: 0,
    failed: 0,
    opted_out: 0,
    skipped: 0,
    errors: [] as Array<{ list_id: number; error: string }>,
  }

  // Stale-claim recovery: 'sending' rows whose run crashed mid-flight.
  const staleCutoff = new Date(
    now.getTime() - STALE_CLAIM_MINUTES * 60 * 1000,
  ).toISOString()
  const { data: recovered, error: recoverErr } = await supabase
    .from('email_list_items')
    .update({ status: 'queued', claimed_at: null })
    .eq('status', 'sending')
    .lt('claimed_at', staleCutoff)
    .select('item_id')
  if (recoverErr) {
    console.error('dispatch-email-queue: stale-claim recovery failed:', recoverErr)
  } else if (recovered && recovered.length > 0) {
    summary.stale_claims_recovered = recovered.length
    console.warn(
      `dispatch-email-queue: recovered ${recovered.length} stale 'sending' claims ` +
        `(items ${recovered.map((r) => r.item_id).join(', ')}) — possible ` +
        'earlier crash; small re-send risk accepted',
    )
  }

  const { data: listsRaw, error: listErr } = await supabase
    .from('email_lists')
    .select('*')
    .in('status', ['queued', 'sending'])
    .or(`scheduled_for.is.null,scheduled_for.lte.${now.toISOString()}`)
    .order('created_at', { ascending: true })
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }

  const lists = (listsRaw ?? []) as ListRow[]
  summary.lists_seen = lists.length
  let capacity = RUN_BATCH_CAP

  let provider: Awaited<ReturnType<typeof getEmailProvider>> | null = null
  let sender: Awaited<ReturnType<typeof getEmailSenderIdentity>> | null = null

  for (const list of lists) {
    if (capacity <= 0) break
    const tz = list.timezone || DEFAULT_SMS_TIMEZONE

    try {
      // Send-window enforcement at the worker, not just the UI.
      if (!list.blackout_override && !isWithinSendWindow(now, tz)) {
        summary.lists_blocked_by_window.push(list.list_id)
        const nextBefore = computeSendBefore(now, tz, false)
        await supabase
          .from('email_list_items')
          .update({ send_before: nextBefore.toISOString() })
          .eq('list_id', list.list_id)
          .eq('status', 'queued')
          .lt('send_before', now.toISOString())
        continue
      }

      const { data: candidates } = await supabase
        .from('email_list_items')
        .select('item_id')
        .eq('list_id', list.list_id)
        .eq('status', 'queued')
        .order('sort_order', { ascending: true })
        .limit(capacity)

      if (!candidates || candidates.length === 0) {
        if (await completeIfDrained(supabase, list)) {
          summary.lists_completed.push(list.list_id)
        }
        continue
      }

      // Validate draft + wrapper BEFORE claiming, so failures never
      // strand items in 'sending'.
      if (!list.draft_id) throw new Error('List has no linked draft')
      const { data: draft } = await supabase
        .from('campaign_comms_drafts')
        .select('draft_id, subject, body, body_html')
        .eq('draft_id', list.draft_id)
        .maybeSingle()
      const subjectTpl = ((draft?.subject as string | null) ?? '').trim()
      const rawBody =
        ((draft?.body_html as string | null)?.trim() ||
          (draft?.body as string | null) ||
          '').trim()
      if (!rawBody) throw new Error('Draft body is empty')
      if (!subjectTpl) throw new Error('Draft subject is empty')
      const isHtmlSource = !!(draft?.body_html as string | null)?.trim()
      const bodyTemplate = isHtmlSource
        ? sanitiseEmailHtml(stripMergeFieldChips(rawBody))
        : rawBody

      // Wrapper: the list's, else the default. Compliance re-check at
      // dispatch time — pause on hard failures.
      const wrapperQuery = supabase
        .from('email_wrappers')
        .select('wrapper_id, name, header_html, footer_html, is_active')
      const { data: wrappers } = list.wrapper_id
        ? await wrapperQuery.eq('wrapper_id', list.wrapper_id)
        : await wrapperQuery.eq('is_default', true)
      const wrapper = (wrappers ?? [])[0] as
        | {
            wrapper_id: number
            name: string
            header_html: string
            footer_html: string
            is_active: boolean
          }
        | undefined
      if (!wrapper || !wrapper.is_active || !wrapperHasUnsubscribePlaceholder(wrapper)) {
        await supabase
          .from('email_lists')
          .update({ status: 'paused' })
          .eq('list_id', list.list_id)
        summary.lists_paused_non_compliant.push(list.list_id)
        summary.errors.push({
          list_id: list.list_id,
          error: !wrapper
            ? 'Paused — wrapper missing (deleted?) and no default configured'
            : !wrapper.is_active
              ? `Paused — wrapper "${wrapper.name}" is inactive`
              : `Paused — wrapper "${wrapper.name}" lost its {{unsubscribe_url}} placeholder`,
        })
        continue
      }

      if (!sender) sender = await getEmailSenderIdentity()

      if (list.status === 'queued') {
        await supabase
          .from('email_lists')
          .update({ status: 'sending' })
          .eq('list_id', list.list_id)
      }

      // Atomic claim: only rows still 'queued' transition to 'sending',
      // and ONLY the returned rows are sent.
      const { data: claimedRaw, error: claimErr } = await supabase
        .from('email_list_items')
        .update({ status: 'sending', claimed_at: new Date().toISOString() })
        .in(
          'item_id',
          candidates.map((c) => c.item_id),
        )
        .eq('status', 'queued')
        .select('item_id, worker_id, email, sort_order')
      if (claimErr) throw claimErr
      const claimed = ((claimedRaw ?? []) as ItemRow[]).sort(
        (a, b) => a.sort_order - b.sort_order,
      )
      capacity -= claimed.length
      if (claimed.length === 0) continue

      // Send-time re-checks against workers.
      const workerIds = claimed.map((i) => i.worker_id)
      const workerById = new Map<number, WorkerRow>()
      for (let i = 0; i < workerIds.length; i += 500) {
        const { data: workers } = await supabase
          .from('workers')
          .select(
            'worker_id, first_name, last_name, email, email_status, email_opt_out, occupation, employers(employer_name), worksites(worksite_name)',
          )
          .in('worker_id', workerIds.slice(i, i + 500))
        for (const row of (workers ?? []) as Array<Record<string, unknown>>) {
          const emp = row.employers as
            | { employer_name: string }
            | { employer_name: string }[]
            | null
          const ws = row.worksites as
            | { worksite_name: string }
            | { worksite_name: string }[]
            | null
          workerById.set(row.worker_id as number, {
            worker_id: row.worker_id as number,
            first_name: (row.first_name as string | null) ?? null,
            last_name: (row.last_name as string | null) ?? null,
            email: (row.email as string | null) ?? null,
            email_status: (row.email_status as string | null) ?? null,
            email_opt_out: (row.email_opt_out as boolean) ?? false,
            occupation: (row.occupation as string | null) ?? null,
            employer_name: Array.isArray(emp)
              ? (emp[0]?.employer_name ?? null)
              : (emp?.employer_name ?? null),
            worksite_name: Array.isArray(ws)
              ? (ws[0]?.worksite_name ?? null)
              : (ws?.worksite_name ?? null),
          })
        }
      }

      const sendable: Array<{ item: ItemRow; worker: WorkerRow; to: string }> = []
      const screenedOut: Array<{ item: ItemRow; status: string; reason: string }> = []
      for (const item of claimed) {
        const worker = workerById.get(item.worker_id)
        const to = (item.email ?? worker?.email ?? '').trim() || null
        if (!worker) {
          screenedOut.push({ item, status: 'skipped', reason: 'Worker not found' })
        } else if (worker.email_opt_out) {
          screenedOut.push({
            item,
            status: 'opted_out',
            reason: 'Worker has unsubscribed from email',
          })
        } else if (!to) {
          screenedOut.push({
            item,
            status: 'skipped',
            reason: 'No email address on file',
          })
        } else if (worker.email_status === 'invalid') {
          screenedOut.push({
            item,
            status: 'skipped',
            reason: 'Email address previously bounced',
          })
        } else {
          sendable.push({ item, worker, to })
        }
      }

      await inChunks(screenedOut, async ({ item, status, reason }) => {
        await supabase
          .from('email_list_items')
          .update({ status, send_status_detail: reason, claimed_at: null })
          .eq('item_id', item.item_id)
          .eq('status', 'sending')
      })
      summary.opted_out += screenedOut.filter((s) => s.status === 'opted_out').length
      summary.skipped += screenedOut.filter((s) => s.status === 'skipped').length

      if (sendable.length > 0) {
        const baseContext = await loadCampaignEmailContext(
          supabase,
          list.campaign_id,
        )

        // Pre-create send_log rows so custom_args carries the send_id
        // (webhook correlation).
        const logRows = sendable.map(({ worker, to }) => ({
          draft_id: list.draft_id as number,
          campaign_id: list.campaign_id,
          worker_id: worker.worker_id,
          recipient_email: to,
          send_method: 'sendgrid',
          user_id: list.created_by,
        }))
        const { data: sendLogRows, error: logErr } = await supabase
          .from('email_send_log')
          .upsert(logRows, { onConflict: 'draft_id,worker_id' })
          .select('send_id, worker_id')
        if (logErr) throw logErr
        const sendIdByWorker = new Map<number, number>(
          (sendLogRows ?? []).map((r) => [r.worker_id as number, r.send_id as number]),
        )

        // Unsubscribe tokens (one per send).
        const tokenRows = sendable
          .map(({ worker }) => {
            const sendId = sendIdByWorker.get(worker.worker_id)
            if (!sendId) return null
            return {
              token: generateUnsubscribeToken(),
              worker_id: worker.worker_id,
              send_id: sendId,
            }
          })
          .filter(Boolean) as Array<{
          token: string
          worker_id: number
          send_id: number
        }>
        const { error: tokenErr } = await supabase
          .from('email_unsubscribe_tokens')
          .insert(tokenRows)
        if (tokenErr) throw tokenErr
        const tokenByWorker = new Map(tokenRows.map((t) => [t.worker_id, t.token]))

        // Resolve + wrap per recipient.
        const batch: OutboundEmail[] = []
        const batchMeta: Array<{ item: ItemRow; worker: WorkerRow }> = []
        const failedCompliance: Array<{ item: ItemRow; reason: string }> = []
        for (const { item, worker, to } of sendable) {
          const ctx = buildWorkerEmailContext(baseContext, worker)
          const subjectResolved = resolveScriptVariablesIncludingChips(
            subjectTpl,
            ctx,
          )
          const bodyResolved = resolveScriptVariablesIncludingChips(
            bodyTemplate,
            ctx,
          )
          const bodyHtml = isHtmlSource ? bodyResolved : textToHtml(bodyResolved)
          const token = tokenByWorker.get(worker.worker_id)
          const unsubscribeUrl = token ? unsubscribeUrlForToken(token) : ''
          const finalHtml = applyWrapper(bodyHtml, wrapper, { unsubscribeUrl })
          const compliance = validateOutboundHtml(finalHtml)
          if (!compliance.ok) {
            failedCompliance.push({
              item,
              reason: compliance.errors.join(' '),
            })
            continue
          }
          const sendId = sendIdByWorker.get(worker.worker_id)
          batch.push({
            to,
            toName:
              [worker.first_name, worker.last_name].filter(Boolean).join(' ') ||
              undefined,
            subject: subjectResolved,
            html: finalHtml,
            text: htmlToPlain(finalHtml),
            customArgs: sendId ? { send_id: String(sendId) } : undefined,
            headers: buildListUnsubscribeHeaders(
              unsubscribeUrl,
              sender.replyTo || sender.fromEmail,
            ),
          })
          batchMeta.push({ item, worker })
        }

        await inChunks(failedCompliance, async ({ item, reason }) => {
          await supabase
            .from('email_list_items')
            .update({ status: 'failed', failure_reason: reason })
            .eq('item_id', item.item_id)
            .eq('status', 'sending')
        })
        summary.failed += failedCompliance.length

        if (batch.length > 0) {
          if (!provider) provider = await getEmailProvider()
          const firstId = batchMeta[0].item.item_id
          const lastId = batchMeta[batchMeta.length - 1].item.item_id
          const idempotencyKey = `email-list-${list.list_id}-${firstId}-${lastId}`
          let results: EmailSendResult[]
          try {
            results = await provider.sendBatch(batch, {
              from: sender,
              idempotencyKey,
            })
          } catch (sendErr) {
            const reason =
              sendErr instanceof Error ? sendErr.message : 'Provider send failed'
            console.error(
              `dispatch-email-queue: whole-batch send failed for list ${list.list_id} ` +
                `(Idempotency-Key: ${idempotencyKey}, ${batch.length} messages): ${reason}`,
            )
            await inChunks(batchMeta, async ({ item }) => {
              await supabase
                .from('email_list_items')
                .update({ status: 'failed', failure_reason: reason })
                .eq('item_id', item.item_id)
                .eq('status', 'sending')
            })
            summary.failed += batch.length
            throw sendErr
          }

          await inChunks(
            batchMeta.map((m, i) => ({ ...m, result: results[i] })),
            async ({ item, worker, result }) => {
              const sendId = sendIdByWorker.get(worker.worker_id)
              const sentAt = new Date().toISOString()
              if (result?.status === 'success') {
                await supabase
                  .from('email_list_items')
                  .update({
                    status: 'sent',
                    provider_message_id: result.providerMessageId,
                    sent_at: sentAt,
                    failure_reason: null,
                  })
                  .eq('item_id', item.item_id)
                if (sendId) {
                  await supabase
                    .from('email_send_log')
                    .update({ provider_message_id: result.providerMessageId })
                    .eq('send_id', sendId)
                }
                void tagWorkerEmailed(worker.worker_id)
                summary.sent += 1
              } else {
                const reason = result?.error ?? 'Provider send failed'
                await supabase
                  .from('email_list_items')
                  .update({ status: 'failed', failure_reason: reason })
                  .eq('item_id', item.item_id)
                summary.failed += 1
              }
            },
          )
        }
      }

      // Recount counters (count queries only) + complete when drained.
      const [sentN, deliveredN, failedN, bouncedN] = await Promise.all([
        countItems(supabase, list.list_id, ['sent']),
        countItems(supabase, list.list_id, ['delivered']),
        countItems(supabase, list.list_id, ['failed']),
        countItems(supabase, list.list_id, ['bounced']),
      ])
      await supabase
        .from('email_lists')
        .update({
          sent_items: sentN + deliveredN + failedN + bouncedN,
          delivered_items: deliveredN,
          failed_items: failedN + bouncedN,
        })
        .eq('list_id', list.list_id)
      if (await completeIfDrained(supabase, list)) {
        summary.lists_completed.push(list.list_id)
      }
    } catch (err) {
      summary.errors.push({
        list_id: list.list_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json(summary)
}
