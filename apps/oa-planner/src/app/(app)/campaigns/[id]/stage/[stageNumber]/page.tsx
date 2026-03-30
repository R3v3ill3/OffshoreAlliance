'use client'

import { use } from 'react'
import { useCampaign } from '@/lib/hooks/useCampaigns'
import { useStagePlan } from '@/lib/hooks/useStagePlan'
import { AmbitionPanel } from '@/components/planning/AmbitionPanel'
import { WhereToPlayPanel } from '@/components/planning/WhereToPlayPanel'
import { TheoryOfWinningPanel } from '@/components/planning/TheoryOfWinningPanel'
import { CapacitiesPanel } from '@/components/planning/CapacitiesPanel'
import { ManagementSystemsPanel } from '@/components/planning/ManagementSystemsPanel'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Target, MapPin, Sparkles, CheckCircle, CalendarDays } from 'lucide-react'
import { STAGE_NAMES } from '@/types'
import { cn } from '@/lib/utils'
import type { TheoryOfWinningRequest } from '@/types'

interface PageProps {
  params: Promise<{ id: string; stageNumber: string }>
}

const P2W_TABS = [
  { id: 'ambitions', label: 'Ambitions', icon: Target },
  { id: 'where-to-play', label: 'Where to Play', icon: MapPin },
  { id: 'theory', label: 'Theory of Winning', icon: Sparkles },
  { id: 'capacities', label: 'Capacities', icon: CheckCircle },
  { id: 'management', label: 'Management', icon: CalendarDays },
]

export default function StageplanPage({ params }: PageProps) {
  const { id, stageNumber: stageNumStr } = use(params)
  const campaignId = parseInt(id)
  const stageNumber = parseInt(stageNumStr)

  const { data: campaign } = useCampaign(campaignId)
  const { data: stagePlanData, isLoading } = useStagePlan(campaignId, stageNumber)

  const stageName = STAGE_NAMES[stageNumber as keyof typeof STAGE_NAMES] || `Stage ${stageNumber}`
  const plan = stagePlanData?.plan

  const prevStage = stageNumber > 1 ? stageNumber - 1 : null
  const nextStage = stageNumber < 6 ? stageNumber + 1 : null

  // Build campaign context for Theory of Winning
  const timeline = (campaign as any)?.campaign_timelines
  const agreement = timeline?.agreements

  const campaignContext: TheoryOfWinningRequest['campaign_context'] = {
    employer_name: (campaign as any)?.organisers?.organiser_name || '',
    worksite_names: [],
    agreement_name: agreement?.agreement_name || campaign?.name || '',
    agreement_expiry: agreement?.expiry_date || timeline?.agreement_expiry_date,
    sector: '',
    is_greenfield: !timeline?.agreement_expiry_date,
    days_to_pabo: timeline?.pabo_available_date
      ? Math.ceil((new Date(timeline.pabo_available_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : undefined,
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-4 bg-slate-200 rounded w-96" />
          <div className="h-64 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Stage plan not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={`/campaigns/${campaignId}`}>Back to Campaign</Link>
        </Button>
      </div>
    )
  }

  const agreementId = timeline?.agreement_id

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">
            {campaign?.name || 'Campaign'}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>Stage {stageNumber}</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                {stageNumber}
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{stageName}</h1>
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-xs',
                    plan.status === 'active' ? 'bg-blue-100 text-blue-700' :
                    plan.status === 'completed' ? 'bg-green-100 text-green-700' :
                    plan.status === 'blocked' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-600'
                  )}
                >
                  {plan.status}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {prevStage && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/campaigns/${campaignId}/stage/${prevStage}`}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Stage {prevStage}
                </Link>
              </Button>
            )}
            {nextStage && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/campaigns/${campaignId}/stage/${nextStage}`}>
                  Stage {nextStage}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            )}
            {nextStage && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/campaigns/${campaignId}/gate/${stageNumber}`}>
                  Gate {stageNumber} Assessment
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="ambitions" className="h-full flex flex-col">
          <div className="border-b bg-white px-6 flex-shrink-0">
            <TabsList className="h-auto bg-transparent p-0 gap-0">
              {P2W_TABS.map((tab, i) => {
                const Icon = tab.icon
                const stepNum = i + 1
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex items-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 text-sm"
                  >
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-600 flex items-center justify-center text-xs font-semibold hidden sm:flex">
                      {stepNum}
                    </span>
                    <Icon className="h-4 w-4 sm:hidden" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-6">
              <TabsContent value="ambitions" className="mt-0">
                <AmbitionPanel
                  planId={plan.plan_id}
                  stageNumber={stageNumber}
                  campaignId={campaignId}
                  ambitions={(stagePlanData?.ambitions || []) as any}
                />
              </TabsContent>

              <TabsContent value="where-to-play" className="mt-0">
                <WhereToPlayPanel
                  planId={plan.plan_id}
                  stageNumber={stageNumber}
                  campaignId={campaignId}
                  agreementId={agreementId}
                  whereToPlay={(stagePlanData?.whereToPlay || []) as any}
                />
              </TabsContent>

              <TabsContent value="theory" className="mt-0">
                <TheoryOfWinningPanel
                  planId={plan.plan_id}
                  stageNumber={stageNumber}
                  campaignId={campaignId}
                  ambitions={(stagePlanData?.ambitions || []) as any}
                  whereToPlay={(stagePlanData?.whereToPlay || []) as any}
                  capacities={(stagePlanData?.capacities || []) as any}
                  theories={stagePlanData?.theories || []}
                  currentTheory={stagePlanData?.currentTheory || null}
                  campaignContext={campaignContext}
                />
              </TabsContent>

              <TabsContent value="capacities" className="mt-0">
                <CapacitiesPanel
                  planId={plan.plan_id}
                  stageNumber={stageNumber}
                  campaignId={campaignId}
                  capacities={(stagePlanData?.capacities || []) as any}
                  whereToPlay={(stagePlanData?.whereToPlay || []) as any}
                />
              </TabsContent>

              <TabsContent value="management" className="mt-0">
                <ManagementSystemsPanel
                  planId={plan.plan_id}
                  stageNumber={stageNumber}
                  campaignId={campaignId}
                  managementSystems={(stagePlanData?.managementSystems || []) as any}
                />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
