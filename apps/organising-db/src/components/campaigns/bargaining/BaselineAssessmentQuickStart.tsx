'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  campaignId: number
}

export function BaselineAssessmentQuickStart({ campaignId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState<string | null>(null)

  const handleLaunchPhoneWave = async () => {
    setLoading('phone')
    await supabase.rpc('seed_bargaining_quickstart_activities', { p_campaign_id: campaignId })
    const { data } = await supabase
      .from('campaign_activities')
      .select('activity_id')
      .eq('campaign_id', campaignId)
      .eq('template_key', 'bargaining_baseline_phone_wave')
      .single()
    setLoading(null)
    if (data) router.push(`/campaigns/${campaignId}/phone?activity_id=${data.activity_id}`)
  }

  const handleSendSMS = async () => {
    setLoading('sms')
    await supabase.rpc('seed_bargaining_quickstart_activities', { p_campaign_id: campaignId })
    const { data } = await supabase
      .from('campaign_activities')
      .select('activity_id')
      .eq('campaign_id', campaignId)
      .eq('template_key', 'bargaining_baseline_sms_survey')
      .single()
    setLoading(null)
    if (data) router.push(`/campaigns/${campaignId}/sms?activity_id=${data.activity_id}`)
  }

  const handleLeaderForm = () => {
    router.push(`/campaigns/${campaignId}/leader-forms`)
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="text-amber-900">Baseline rating coverage is low</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-amber-800">
          Less than 20% of workers are rated. Quick-start a baseline assessment:
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleLaunchPhoneWave}
            disabled={loading === 'phone'}
            size="sm"
          >
            {loading === 'phone' ? 'Setting up...' : 'Launch baseline phone wave'}
          </Button>
          <Button
            onClick={handleSendSMS}
            disabled={loading === 'sms'}
            variant="outline"
            size="sm"
          >
            {loading === 'sms' ? 'Setting up...' : 'Send SMS support survey'}
          </Button>
          <Button onClick={handleLeaderForm} variant="ghost" size="sm">
            Create a leader-form drop
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
