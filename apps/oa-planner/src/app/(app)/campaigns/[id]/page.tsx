'use client'

import { use } from 'react'
import Link from 'next/link'
import { useCampaign } from '@/lib/hooks/useCampaigns'
import { useAllGates } from '@/lib/hooks/useGateAssessment'
import { CampaignTimeline } from '@/components/campaign/CampaignTimeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STAGE_NAMES } from '@/types'
import { cn } from '@/lib/utils'
import { ChevronRight, Shield, CheckCircle } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function CampaignDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const campaignId = parseInt(id)

  const { data: campaign, isLoading } = useCampaign(campaignId)
  const { data: gates } = useAllGates(campaignId)

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4 max-w-4xl mx-auto">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-48 bg-slate-200 rounded" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-200 rounded" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!campaign) {
    return <div className="p-6 text-center text-slate-500">Campaign not found</div>
  }

  const timeline = (campaign as any).campaign_timelines
  const stagePlans = (campaign as any).campaign_stage_plans || []
  const sortedStages = [...stagePlans].sort((a: { stage_number: number }, b: { stage_number: number }) => a.stage_number - b.stage_number)

  const activeStage = sortedStages.find((s: { status: string }) => s.status === 'active')
  const completedStages = sortedStages.filter((s: { status: string }) => s.status === 'completed').length

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/campaigns" className="hover:text-foreground">Campaigns</Link>
        <ChevronRight className="h-3 w-3" />
        <span>{campaign.name}</span>
      </div>

      {/* Campaign header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
          {campaign.description && (
            <p className="text-muted-foreground mt-1">{campaign.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge
              className={cn(
                campaign.status === 'active' ? 'bg-blue-100 text-blue-700' :
                campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
                'bg-slate-100 text-slate-600'
              )}
              variant="secondary"
            >
              {campaign.status}
            </Badge>
            {(campaign as any).organisers?.organiser_name && (
              <span className="text-sm text-muted-foreground">
                Lead: {(campaign as any).organisers.organiser_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/campaigns/${campaignId}/stage/${activeStage?.stage_number || 1}`}>
              Continue Planning
            </Link>
          </Button>
        </div>
      </div>

      {/* Progress summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{activeStage?.stage_number || '-'}</p>
            <p className="text-sm text-muted-foreground mt-1">Current Stage</p>
            {activeStage && (
              <p className="text-xs font-medium mt-1">{STAGE_NAMES[activeStage.stage_number as keyof typeof STAGE_NAMES]}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-green-600">{completedStages}</p>
            <p className="text-sm text-muted-foreground mt-1">Stages Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-slate-600">
              {gates?.filter((g) => g.gate_assessments?.some((a: { outcome: string }) => a.outcome === 'passed' || a.outcome === 'override_approved')).length || 0}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Gates Passed</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignTimeline
            stages={sortedStages}
            gates={(gates || []) as any}
            campaignId={campaignId}
            paboDate={timeline?.pabo_available_date}
            expiryDate={timeline?.agreement_expiry_date}
          />
        </CardContent>
      </Card>

      {/* Stage cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Stage Plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sortedStages.map((stage: { stage_number: number; stage_name: string; status: string; plan_id?: number }) => {
            const gate = gates?.find((g) => g.gate_number === stage.stage_number)

            return (
              <Link
                key={stage.stage_number}
                href={`/campaigns/${campaignId}/stage/${stage.stage_number}`}
              >
                <Card className={cn(
                  'hover:border-blue-300 transition-colors cursor-pointer',
                  stage.status === 'active' && 'border-blue-200 bg-blue-50/50'
                )}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                        stage.status === 'active' ? 'bg-blue-600 text-white' :
                        stage.status === 'completed' ? 'bg-green-500 text-white' :
                        stage.status === 'blocked' ? 'bg-red-500 text-white' :
                        'bg-slate-200 text-slate-500'
                      )}>
                        {stage.status === 'completed' ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          stage.stage_number
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{stage.stage_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-xs',
                              stage.status === 'active' ? 'bg-blue-100 text-blue-700' :
                              stage.status === 'completed' ? 'bg-green-100 text-green-700' :
                              stage.status === 'blocked' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-600'
                            )}
                          >
                            {stage.status}
                          </Badge>
                          {gate && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Shield className="h-3 w-3" />
                              Gate {gate.gate_number}
                            </div>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
