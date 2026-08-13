/**
 * Shared SMS list populate: resolve an audience to worker ids, screen
 * opt-out / missing mobile, and insert sms_list_items.
 */

import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

export const SMS_LIST_PAGE_SIZE = 1000

export type SmsApiAudience =
  | { type: 'worker_list'; worker_list_id: number }
  | { type: 'campaign' }

export function isSmsApiAudience(
  value: unknown,
): value is SmsApiAudience {
  if (!value || typeof value !== 'object') return false
  const v = value as { type?: unknown; worker_list_id?: unknown }
  if (v.type === 'campaign') return true
  return v.type === 'worker_list' && Number.isFinite(v.worker_list_id)
}

export async function resolveAudienceWorkerIds(
  supabase: Supabase,
  campaignId: number,
  audience: SmsApiAudience,
): Promise<{ workerIds: number[]; error?: { status: number; message: string } }> {
  const workerIds: number[] = []
  if (audience.type === 'worker_list') {
    const { data: wl, error: wlErr } = await supabase
      .from('campaign_worker_lists')
      .select('list_id, campaign_id')
      .eq('list_id', audience.worker_list_id)
      .maybeSingle()
    if (wlErr) throw wlErr
    if (!wl || wl.campaign_id !== campaignId) {
      return {
        workerIds: [],
        error: { status: 404, message: 'Worker list not found' },
      }
    }
    for (let from = 0; ; from += SMS_LIST_PAGE_SIZE) {
      const { data: wlItems, error: wliErr } = await supabase
        .from('campaign_worker_list_items')
        .select('worker_id, sort_order')
        .eq('list_id', audience.worker_list_id)
        .order('sort_order', { ascending: true })
        .order('worker_id', { ascending: true })
        .range(from, from + SMS_LIST_PAGE_SIZE - 1)
      if (wliErr) throw wliErr
      workerIds.push(...(wlItems ?? []).map((r) => r.worker_id))
      if (!wlItems || wlItems.length < SMS_LIST_PAGE_SIZE) break
    }
  } else {
    for (let from = 0; ; from += SMS_LIST_PAGE_SIZE) {
      const { data: members, error: memErr } = await supabase
        .from('campaign_worker_membership')
        .select('worker_id')
        .eq('campaign_id', campaignId)
        .order('worker_id', { ascending: true })
        .range(from, from + SMS_LIST_PAGE_SIZE - 1)
      if (memErr) throw memErr
      workerIds.push(...(members ?? []).map((r) => r.worker_id))
      if (!members || members.length < SMS_LIST_PAGE_SIZE) break
    }
  }
  return { workerIds }
}

export async function populateSmsListItems(
  supabase: Supabase,
  listId: number,
  workerIds: number[],
): Promise<{
  pendingCount: number
  optedOut: number
  skippedNoPhone: number
}> {
  const workerById = new Map<
    number,
    { phone_e164: string | null; sms_opt_out: boolean }
  >()
  for (let i = 0; i < workerIds.length; i += 500) {
    const chunk = workerIds.slice(i, i + 500)
    const { data: workers, error: wErr } = await supabase
      .from('workers')
      .select('worker_id, phone_e164, sms_opt_out')
      .in('worker_id', chunk)
    if (wErr) throw wErr
    for (const w of workers ?? []) {
      workerById.set(w.worker_id, {
        phone_e164: w.phone_e164,
        sms_opt_out: !!w.sms_opt_out,
      })
    }
  }

  const itemRows = workerIds.map((workerId, i) => {
    const w = workerById.get(workerId)
    const optedOut = !!w?.sms_opt_out
    const phone = w?.phone_e164 ?? null
    return {
      list_id: listId,
      worker_id: workerId,
      phone_e164: phone,
      sort_order: i,
      status: optedOut ? 'opted_out' : phone ? 'pending' : 'skipped',
      failure_reason: optedOut
        ? 'Worker has opted out of SMS'
        : phone
          ? null
          : 'No mobile number on file',
    }
  })
  for (let i = 0; i < itemRows.length; i += 500) {
    const { error: insErr } = await supabase
      .from('sms_list_items')
      .insert(itemRows.slice(i, i + 500))
    if (insErr) throw insErr
  }

  const pendingCount = itemRows.filter((r) => r.status === 'pending').length
  const { error: totalErr } = await supabase
    .from('sms_lists')
    .update({ total_items: pendingCount })
    .eq('list_id', listId)
  if (totalErr) throw totalErr

  return {
    pendingCount,
    optedOut: itemRows.filter((r) => r.status === 'opted_out').length,
    skippedNoPhone: itemRows.filter((r) => r.status === 'skipped').length,
  }
}

export function audienceSourceFilters(audience: SmsApiAudience) {
  return audience.type === 'worker_list'
    ? { source: 'worker_list', list_id: audience.worker_list_id }
    : { source: 'campaign' }
}
