'use client'

/**
 * Global SMS tools hub — the campaigns-landing counterpart of
 * Outreach → SMS. Campaign is optional and explicit (email-wizard
 * pattern): no standing-campaign auto-select. Inbox and relays work
 * without a campaign; blasts, surveys and chats need one chosen first.
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

export function SmsToolsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const supabase = createClient()

  const campaignIdParam = searchParams.get('campaign_id')
  const parsed = campaignIdParam ? parseInt(campaignIdParam, 10) : NaN
  const campaignId = Number.isFinite(parsed) ? parsed : null

  const { data: campaigns = [] } = useQuery({
    queryKey: ['wizard-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('campaign_id, name, organiser_id')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
  })

  const setCampaignId = useCallback(
    (next: number | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next == null) params.delete('campaign_id')
      else params.set('campaign_id', String(next))
      const qs = params.toString()
      router.replace(qs ? `/campaigns/sms-tools?${qs}` : '/campaigns/sms-tools', {
        scroll: false,
      })
    },
    [router, searchParams],
  )

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
            Blasts, surveys, chats, inbox and relays. Link a campaign to
            build lists, write assessments, and send — or work the inbox
            and relays without one.
          </p>
        </div>
        <div className="w-full space-y-1 sm:w-72">
          <Label htmlFor="sms-tools-campaign">Campaign (optional)</Label>
          <Select
            value={campaignId?.toString() ?? '__none__'}
            onValueChange={(v) =>
              setCampaignId(v === '__none__' ? null : Number(v))
            }
          >
            <SelectTrigger id="sms-tools-campaign">
              <SelectValue placeholder="No campaign — inbox and relays" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                No campaign — inbox and relays
              </SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.campaign_id} value={c.campaign_id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Linking a campaign enables list building, assessments, blasts,
            surveys and chats.
          </p>
        </div>
      </div>

      <InlineSmsOpsPanel campaignId={campaignId} />
    </div>
  )
}
