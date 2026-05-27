/**
 * Server-side campaign template-variable context loader.
 *
 * Mirrors the client-side `varContext` build in `EmailComposer.tsx` so
 * that whichever path sends an email (Save to Outlook, Send via Outlook,
 * Action Network push) resolves the SAME tokens to the SAME values.
 *
 * Fallback chain (matches the legacy CampaignEmailWizard logic):
 *   - employer_name: campaign_timelines → agreements → employers (primary),
 *     else the majority employer across campaign_worker_membership.
 *   - worksite_name: campaign_worksites (first), else the majority worksite
 *     derived from campaign_worker_membership.
 *   - agreement_name: campaign_timelines → agreements.agreement_name.
 *   - campaign_name: campaigns.name.
 *   - organiser_name / organiser_phone: campaigns.organiser_id → organisers.
 *   - staff_email: auth user email (caller passes in).
 *   - date: today, formatted en-AU.
 *
 * Per-recipient personalisation (first_name / last_name / occupation) is
 * NOT added here — callers merge per-worker fields on top of this base
 * context before resolving each draft.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CampaignEmailContext {
  [key: string]: string | undefined
  employer_name?: string
  agreement_name?: string
  worksite_name?: string
  campaign_name?: string
  organiser_name?: string
  organiser_phone?: string
  staff_email?: string
  date: string
}

export async function loadCampaignEmailContext(
  supabase: SupabaseClient,
  campaignId: number,
  userEmail?: string,
): Promise<CampaignEmailContext> {
  // ---------- Campaign basics ----------
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('campaign_id, name, organiser_id')
    .eq('campaign_id', campaignId)
    .maybeSingle()

  // ---------- Agreement + agreement-linked employer ----------
  let employerName = ''
  let agreementName = ''
  const { data: timeline } = await supabase
    .from('campaign_timelines')
    .select('agreement_id')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (timeline?.agreement_id) {
    const { data: agreement } = await supabase
      .from('agreements')
      .select('agreement_name, employer_id')
      .eq('agreement_id', timeline.agreement_id)
      .maybeSingle()
    agreementName = agreement?.agreement_name ?? ''
    if (agreement?.employer_id) {
      const { data: employer } = await supabase
        .from('employers')
        .select('employer_name')
        .eq('employer_id', agreement.employer_id)
        .maybeSingle()
      employerName = employer?.employer_name ?? ''
    }
  }

  // ---------- Lead organiser ----------
  let organiserName = ''
  let organiserPhone = ''
  if (campaign?.organiser_id) {
    const { data: org } = await supabase
      .from('organisers')
      .select('organiser_name, phone')
      .eq('organiser_id', campaign.organiser_id)
      .maybeSingle()
    organiserName = org?.organiser_name ?? ''
    organiserPhone = org?.phone ?? ''
  }

  // ---------- Campaign-level worksite (first declared) ----------
  let worksiteName = ''
  const { data: wsLinks } = await supabase
    .from('campaign_worksites')
    .select('worksites(worksite_name)')
    .eq('campaign_id', campaignId)
  const declaredWorksites = (wsLinks ?? [])
    .map((r: Record<string, unknown>) => {
      const ws = r.worksites as
        | { worksite_name: string }
        | { worksite_name: string }[]
        | null
      return Array.isArray(ws) ? ws[0]?.worksite_name : ws?.worksite_name
    })
    .filter(Boolean) as string[]
  if (declaredWorksites.length > 0) worksiteName = declaredWorksites[0]

  // ---------- Member-derived fallbacks for employer_name + worksite_name ----------
  // For organising-style campaigns without a formal agreement on file, the
  // membership table is the only place employer / worksite info lives.
  if (!employerName || !worksiteName) {
    const employerCounts = new Map<string, number>()
    const worksiteCounts = new Map<string, number>()
    const { data: members } = await supabase
      .from('campaign_worker_membership')
      .select(
        `worker_id,
         workers!inner(
           employer_id,
           employers(employer_name),
           worksites(worksite_name)
         )`,
      )
      .eq('campaign_id', campaignId)
    for (const row of members ?? []) {
      const w = row.workers as unknown as {
        employer_id: number | null
        employers: { employer_name: string } | { employer_name: string }[] | null
        worksites: { worksite_name: string } | { worksite_name: string }[] | null
      } | null
      const empName = Array.isArray(w?.employers)
        ? w?.employers[0]?.employer_name
        : w?.employers?.employer_name
      if (empName) employerCounts.set(empName, (employerCounts.get(empName) ?? 0) + 1)
      const wsName = Array.isArray(w?.worksites)
        ? w?.worksites[0]?.worksite_name
        : w?.worksites?.worksite_name
      if (wsName) worksiteCounts.set(wsName, (worksiteCounts.get(wsName) ?? 0) + 1)
    }
    if (!employerName) {
      const sorted = [...employerCounts.entries()].sort((a, b) => b[1] - a[1])
      if (sorted.length > 0) employerName = sorted[0][0]
    }
    if (!worksiteName) {
      const sorted = [...worksiteCounts.entries()].sort((a, b) => b[1] - a[1])
      if (sorted.length > 0) worksiteName = sorted[0][0]
    }
  }

  return {
    employer_name: employerName || undefined,
    agreement_name: agreementName || undefined,
    worksite_name: worksiteName || undefined,
    campaign_name: campaign?.name ?? undefined,
    organiser_name: organiserName || undefined,
    organiser_phone: organiserPhone || undefined,
    staff_email: userEmail ?? undefined,
    date: new Date().toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  }
}

/**
 * Build a per-worker context: starts from the campaign-level context,
 * adds first_name / last_name / occupation from the worker, and falls
 * back to the worker's own employer / worksite when the campaign-level
 * value is missing. The latter matters for organising-style campaigns
 * where workers span multiple employers / sites and there's no formal
 * agreement to pin a single "the employer" on.
 */
export function buildWorkerEmailContext(
  base: CampaignEmailContext,
  worker: {
    first_name?: string | null
    last_name?: string | null
    occupation?: string | null
    employer_name?: string | null
    worksite_name?: string | null
  },
): Record<string, string | undefined> {
  return {
    ...base,
    first_name: worker.first_name ?? '',
    last_name: worker.last_name ?? '',
    occupation: worker.occupation ?? '',
    employer_name: base.employer_name || worker.employer_name || undefined,
    worksite_name: base.worksite_name || worker.worksite_name || undefined,
  }
}
