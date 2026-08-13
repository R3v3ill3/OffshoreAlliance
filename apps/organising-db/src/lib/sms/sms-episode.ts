/**
 * Standalone SMS sessions are stored as hidden campaigns
 * (campaigns.is_sms_episode). Helpers for that marker and for hanging
 * org-wide audiences onto the episode so existing FKs / RLS stay valid.
 */

import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

export const SMS_EPISODE_UNTITLED = {
  blast: 'Untitled SMS blast',
  survey: 'Untitled SMS survey',
  chat: 'Untitled SMS chat',
} as const

export type SmsEpisodeKind = keyof typeof SMS_EPISODE_UNTITLED

export async function campaignIsSmsEpisode(
  supabase: Supabase,
  campaignId: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('is_sms_episode')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (error) throw error
  return !!data?.is_sms_episode
}

/** Upsert campaign_worker_membership so list commit / populate FKs hold. */
export async function ensureSmsEpisodeMembership(
  supabase: Supabase,
  campaignId: number,
  workerIds: number[],
): Promise<void> {
  if (workerIds.length === 0) return
  const isEpisode = await campaignIsSmsEpisode(supabase, campaignId)
  if (!isEpisode) return

  const unique = [...new Set(workerIds)]
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500).map((worker_id) => ({
      campaign_id: campaignId,
      worker_id,
    }))
    const { error } = await supabase
      .from('campaign_worker_membership')
      .upsert(chunk, {
        onConflict: 'campaign_id,worker_id',
        ignoreDuplicates: true,
      })
    if (error) throw error
  }
}
