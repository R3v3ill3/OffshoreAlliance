'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'

/**
 * Campaign-level fields for resolving phone/comms template variables
 * (matches the former inline query in campaign-send-panel).
 */
export function useCampaignPhoneScriptContext(campaignId: number | null) {
  const supabase = createClient()
  const { user } = useAuth()

  return useQuery({
    queryKey: ['campaign-send-context', campaignId ?? 0],
    queryFn: async (): Promise<Record<string, string | undefined>> => {
      const cid = campaignId!
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('name, organiser_id')
        .eq('campaign_id', cid)
        .single()

      let agreementName: string | undefined
      let employerName: string | undefined
      const { data: timeline } = await supabase
        .from('campaign_timelines')
        .select('agreement_id')
        .eq('campaign_id', cid)
        .maybeSingle()
      if (timeline?.agreement_id) {
        const { data: agreement } = await supabase
          .from('agreements')
          .select('agreement_name, employer_id')
          .eq('agreement_id', timeline.agreement_id)
          .single()
        agreementName = agreement?.agreement_name ?? undefined
        if (agreement?.employer_id) {
          const { data: employer } = await supabase
            .from('employers')
            .select('employer_name')
            .eq('employer_id', agreement.employer_id)
            .single()
          employerName = employer?.employer_name ?? undefined
        }
      }

      let organiserName: string | undefined
      let organiserPhone: string | undefined
      if (campaign?.organiser_id) {
        const { data: organiser } = await supabase
          .from('organisers')
          .select('organiser_name, phone')
          .eq('organiser_id', campaign.organiser_id)
          .single()
        organiserName = organiser?.organiser_name ?? undefined
        organiserPhone = organiser?.phone ?? undefined
      }

      const { data: worksiteLinks } = await supabase
        .from('campaign_worksites')
        .select('worksite_id')
        .eq('campaign_id', cid)
        .limit(1)
      let worksiteName: string | undefined
      if (worksiteLinks?.[0]?.worksite_id) {
        const { data: ws } = await supabase
          .from('worksites')
          .select('worksite_name')
          .eq('worksite_id', worksiteLinks[0].worksite_id)
          .single()
        worksiteName = ws?.worksite_name ?? undefined
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('display_name, phone, role')
        .eq('user_id', user!.id)
        .single()

      return {
        campaign_name: campaign?.name ?? undefined,
        agreement_name: agreementName,
        employer_name: employerName,
        worksite_name: worksiteName,
        organiser_name: organiserName,
        organiser_phone: organiserPhone,
        staff_name: profile?.display_name ?? user?.email ?? undefined,
        staff_email: user?.email ?? undefined,
        staff_phone: profile?.phone ?? undefined,
        staff_role: profile?.role ?? undefined,
        date: new Date().toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      }
    },
    enabled: !!user && campaignId != null && campaignId > 0,
  })
}
