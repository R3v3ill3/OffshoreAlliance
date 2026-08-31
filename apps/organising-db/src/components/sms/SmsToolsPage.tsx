'use client'

/**
 * Global SMS tools hub — the campaigns-landing counterpart of
 * Outreach → SMS. Campaign is optional and explicit (email-wizard
 * pattern): no standing-campaign auto-select.
 *
 * Standalone — not part of a campaign creates a hidden per-episode
 * campaign behind the UI so FKs, RLS and inbox threads stay campaign-
 * scoped. Assessment picker and "whole campaign" audience are hidden.
 */

import { useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InlineSmsOpsPanel } from '@/components/sms/InlineSmsOpsPanel'
import { SmsActivityOverview } from '@/components/sms/SmsActivityOverview'
import { excludeSmsEpisodes } from '@/lib/campaign/visible-campaigns'

export function SmsToolsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const supabase = createClient()

  const campaignIdParam = searchParams.get('campaign_id')
  const parsed = campaignIdParam ? parseInt(campaignIdParam, 10) : NaN
  const campaignId = Number.isFinite(parsed) ? parsed : null
  const standaloneParam = searchParams.get('standalone') === '1'

  const { data: campaigns = [] } = useQuery({
    queryKey: ['wizard-campaigns'],
    queryFn: async () => {
      const { data, error } = await excludeSmsEpisodes(
        supabase
          .from('campaigns')
          .select('campaign_id, name, organiser_id')
          .order('created_at', { ascending: false }),
      )
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
  })

  const { data: selectedCampaign } = useQuery({
    queryKey: ['sms-tools-selected-campaign', campaignId],
    queryFn: async () => {
      if (campaignId == null) return null
      const { data, error } = await supabase
        .from('campaigns')
        .select('campaign_id, is_sms_episode')
        .eq('campaign_id', campaignId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!user && campaignId != null,
  })

  const standaloneMode =
    standaloneParam || !!selectedCampaign?.is_sms_episode
  const linkedCampaignId = standaloneMode ? null : campaignId

  const setScope = useCallback(
    (next: 'none' | 'standalone' | number) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next === 'none') {
        params.delete('campaign_id')
        params.delete('standalone')
      } else if (next === 'standalone') {
        params.delete('campaign_id')
        params.set('standalone', '1')
      } else {
        params.delete('standalone')
        params.set('campaign_id', String(next))
      }
      const qs = params.toString()
      router.replace(qs ? `/campaigns/sms-tools?${qs}` : '/campaigns/sms-tools', {
        scroll: false,
      })
    },
    [router, searchParams],
  )

  const selectValue = standaloneMode
    ? '__standalone__'
    : linkedCampaignId != null
      ? String(linkedCampaignId)
      : '__none__'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/campaigns">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquare className="h-6 w-6" />
            SMS tools
          </h1>
          <p className="text-sm text-muted-foreground">
            Blasts, surveys, chats, inbox and relays. Link a campaign, or
            mark a send as standalone — not part of a campaign.
          </p>
        </div>
        <div className="w-full space-y-1 sm:w-80">
          <Label htmlFor="sms-tools-campaign">Send as</Label>
          <Select
            value={selectValue}
            onValueChange={(v) => {
              if (v === '__none__') setScope('none')
              else if (v === '__standalone__') setScope('standalone')
              else setScope(Number(v))
            }}
          >
            <SelectTrigger id="sms-tools-campaign">
              <SelectValue placeholder="Inbox and relays only" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                Inbox and relays only
              </SelectItem>
              <SelectItem value="__standalone__">
                Standalone — not part of a campaign
              </SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.campaign_id} value={c.campaign_id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {standaloneMode
              ? 'Each blast, survey or chat is stored as its own hidden campaign. Assessments and wall-chart tools stay off.'
              : linkedCampaignId != null
                ? 'List building, assessments, blasts, surveys and chats use this campaign.'
                : 'Pick a campaign or standalone to send. Inbox and relays work either way.'}
          </p>
        </div>
      </div>

      {/* Whole-of-universe first: the hub's purpose is seeing what has
          run and what is running, which the campaign-scoped panel below
          cannot show when no campaign is selected. */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium">All SMS activity</h2>
        <SmsActivityOverview campaignId={linkedCampaignId} />
      </div>

      {/* The working panel, once a scope is chosen. Without one it has
          nothing to act on, so say that rather than render empty tabs. */}
      {linkedCampaignId != null ? (
        <InlineSmsOpsPanel
          campaignId={linkedCampaignId}
          standaloneMode={standaloneMode}
        />
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Pick a campaign, or Standalone, in &ldquo;Send as&rdquo; above to
          build a list and send. The inbox and relays work without one.
        </p>
      )}
    </div>
  )
}
