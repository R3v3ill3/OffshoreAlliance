/**
 * Server-side helpers for the email engagement tracking tables.
 *
 * All functions use the service-role client so they can be called from
 * API routes without the caller's auth context.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SendMethod =
  | 'outlook_personalised'
  | 'outlook_bcc'
  /** Direct send via /me/sendMail — bypasses Outlook drafts. */
  | 'outlook_send_personalised'
  | 'outlook_send_bcc'
  | 'action_network'
  | 'mailto'
  | 'eml'

export interface RecordEmailSendInput {
  draftId: number
  campaignId: number
  workerId: number
  recipientEmail: string
  sendMethod: SendMethod
  conversationId?: string | null
  externalMessageId?: string | null
  userId?: string | null
}

// ─── Core send-log helpers ────────────────────────────────────────────────────

/**
 * Idempotent insert into email_send_log keyed by (draft_id, worker_id).
 * Returns the send_id of the inserted (or updated) row.
 */
export async function recordEmailSend(
  input: RecordEmailSendInput,
): Promise<number | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('email_send_log')
    .upsert(
      {
        draft_id: input.draftId,
        campaign_id: input.campaignId,
        worker_id: input.workerId,
        recipient_email: input.recipientEmail,
        send_method: input.sendMethod,
        conversation_id: input.conversationId ?? null,
        external_message_id: input.externalMessageId ?? null,
        user_id: input.userId ?? null,
      },
      { onConflict: 'draft_id,worker_id' },
    )
    .select('send_id')
    .maybeSingle()

  if (error) {
    console.error('[send-log] recordEmailSend error:', error.message)
    return null
  }
  return data?.send_id ?? null
}

// ─── Tag helpers ──────────────────────────────────────────────────────────────

/** Find or create a tag by name; returns tag_id. */
async function getOrCreateEmailTag(
  admin: ReturnType<typeof createAdminClient>,
  tagName: string,
): Promise<number | null> {
  const { data: existing } = await admin
    .from('tags')
    .select('tag_id')
    .eq('tag_name', tagName)
    .maybeSingle()
  if (existing?.tag_id) return existing.tag_id

  const { data: created, error } = await admin
    .from('tags')
    .insert({ tag_name: tagName, tag_category: 'email' })
    .select('tag_id')
    .maybeSingle()
  if (error) {
    console.error('[send-log] getOrCreateEmailTag error:', error.message)
    return null
  }
  return created?.tag_id ?? null
}

/** Attach a tag to a worker; idempotent (upsert ignores duplicate). */
async function attachTagToWorker(
  workerId: number,
  tagName: string,
): Promise<void> {
  const admin = createAdminClient()
  const tagId = await getOrCreateEmailTag(admin, tagName)
  if (!tagId) return
  const { error } = await admin
    .from('worker_tags')
    .upsert(
      { worker_id: workerId, tag_id: tagId },
      { onConflict: 'worker_id,tag_id', ignoreDuplicates: true },
    )
  if (error) {
    console.error('[send-log] attachTagToWorker error:', error.message)
  }
}

export function tagWorkerEmailed(workerId: number): Promise<void> {
  return attachTagToWorker(workerId, 'Emailed')
}

export function tagWorkerReplied(workerId: number): Promise<void> {
  return attachTagToWorker(workerId, 'Replied')
}

export function tagWorkerBounced(workerId: number): Promise<void> {
  return attachTagToWorker(workerId, 'Email bounced')
}

export function tagWorkerClicked(workerId: number): Promise<void> {
  return attachTagToWorker(workerId, 'Clicked link')
}

// ─── Bounce helper ────────────────────────────────────────────────────────────

/**
 * Mark a worker's email as invalid and attach the "Email bounced" tag.
 * Called by the poll cron when a DSN is detected.
 */
export async function markEmailBounced(
  workerId: number,
  reason: string,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('workers')
    .update({
      email_status: 'invalid',
      email_status_updated_at: new Date().toISOString(),
    })
    .eq('worker_id', workerId)
  if (error) {
    console.error('[send-log] markEmailBounced workers update error:', error.message)
  }
  await tagWorkerBounced(workerId)
  // reason param is accepted for future logging; bounce_reason is set on
  // email_send_log by the poll cron which also calls markEmailBounced.
  void reason
}
