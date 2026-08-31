/**
 * Launch-time concurrency: other open/paused surveys and how many
 * people in this audience already have a live session (org-wide,
 * one invited/active session per phone).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { LIVE_SESSION_STATES } from '@/lib/sms/survey-runtime'

export interface OtherOpenSurvey {
  survey_id: number
  title: string
  status: string
  campaign_id: number | null
  campaign_name: string | null
  /** People in THIS audience that this survey is holding. */
  overlap_count: number
}

export interface SurveyLaunchConcurrency {
  other_open_surveys: OtherOpenSurvey[]
  audience_overlap_count: number
}

export async function loadSurveyLaunchConcurrency(
  db: SupabaseClient,
  args: { excludeSurveyId: number; audiencePhones: string[] },
): Promise<SurveyLaunchConcurrency> {
  const { data: others, error: othersErr } = await db
    .from('sms_surveys')
    .select('survey_id, title, status, campaign_id, campaigns(name)')
    .in('status', ['open', 'paused'])
    .neq('survey_id', args.excludeSurveyId)
    .order('opened_at', { ascending: false })
    .limit(20)
  if (othersErr) throw othersErr

  const phones = [...new Set(args.audiencePhones.filter(Boolean))]
  const busy = new Set<string>()
  // Which survey is holding each busy phone — so the warning can name
  // the blocker instead of leaving the organiser to hunt for it.
  const holdersBySurvey = new Map<number, Set<string>>()
  for (let i = 0; i < phones.length; i += 500) {
    const chunk = phones.slice(i, i + 500)
    const { data: live, error } = await db
      .from('sms_survey_sessions')
      .select('phone_e164, survey_id')
      // A survey's OWN live sessions are not a conflict with itself.
      // Without this, re-previewing after a pause counts its own
      // invitees as busy elsewhere and understates who it can reach.
      .neq('survey_id', args.excludeSurveyId)
      .in('phone_e164', chunk)
      .in('state', [...LIVE_SESSION_STATES])
    if (error) throw error
    for (const row of live ?? []) {
      const phone = row.phone_e164 as string | null
      if (!phone) continue
      busy.add(phone)
      const sid = row.survey_id as number
      const held = holdersBySurvey.get(sid) ?? new Set<string>()
      held.add(phone)
      holdersBySurvey.set(sid, held)
    }
  }

  type OtherRow = {
    survey_id: number
    title: string
    status: string
    campaign_id: number | null
    campaigns: { name: string | null } | null
  }

  return {
    other_open_surveys: ((others ?? []) as unknown as OtherRow[]).map((s) => ({
      survey_id: s.survey_id,
      title: s.title,
      status: s.status,
      campaign_id: s.campaign_id,
      campaign_name: s.campaigns?.name ?? null,
      overlap_count: holdersBySurvey.get(s.survey_id)?.size ?? 0,
    })),
    audience_overlap_count: busy.size,
  }
}
