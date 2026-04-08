'use client'

import { use, useMemo, useState } from 'react'
import { useCampaign } from '@/lib/hooks/usePlannerCampaigns'
import { useStagePlan } from '@/lib/hooks/useStagePlan'
import { useP2wStepOverrides } from '@/lib/hooks/useP2wStepOverrides'
import {
  effectiveStepComplete,
  P2W_TAB_ORDER,
  type P2wStepCompletionInput,
  type P2wStepOverride,
  type P2wTabId,
} from '@/lib/planning/p2w-step-completion'
import type { AmbitionMetricRow } from '@/lib/planning/ambition-metric-status'
import { StageProgressBar } from '@/components/campaigns/planning/StageProgressBar'
import { AmbitionPanel } from '@/components/campaigns/planning/AmbitionPanel'
import { WhereToPlayPanel } from '@/components/campaigns/planning/WhereToPlayPanel'
import { TheoryOfWinningPanel } from '@/components/campaigns/planning/TheoryOfWinningPanel'
import { CapacitiesPanel } from '@/components/campaigns/planning/CapacitiesPanel'
import { ManagementSystemsPanel } from '@/components/campaigns/planning/ManagementSystemsPanel'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Target,
  MapPin,
  Sparkles,
  CheckCircle,
  CalendarDays,
  Check,
  Info,
  BookOpen,
  X,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { OverviewDialog } from '@/components/campaigns/planning/OverviewDialog'
import { stageHeaderBlurb } from '@/lib/planning/stage-narrative'
import { STAGE_NAMES } from '@/types/planner-types'
import { cn } from '@/lib/utils/cn'
import type { TheoryOfWinningRequest } from '@/types/planner-types'

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

  const completionInput = useMemo((): P2wStepCompletionInput | null => {
    if (!stagePlanData) return null
    return {
      ambitions: stagePlanData.ambitions as AmbitionMetricRow[],
      whereToPlayLength: stagePlanData.whereToPlay?.length ?? 0,
      currentTheory: stagePlanData.currentTheory ?? null,
      capacitiesLength: stagePlanData.capacities?.length ?? 0,
      managementSystemsLength: stagePlanData.managementSystems?.length ?? 0,
    }
  }, [stagePlanData])

  const { overrides, setOverride } = useP2wStepOverrides(campaignId, stageNumber)
  const [activeTab, setActiveTab] = useState<string>('ambitions')
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [showBlurb, setShowBlurb] = useState(true)

  const stageName = STAGE_NAMES[stageNumber as keyof typeof STAGE_NAMES] || `Stage ${stageNumber}`
  const plan = stagePlanData?.plan

  const sortedStagePlans = useMemo(() => {
    const plans =
      (campaign as {
        campaign_stage_plans?: {
          stage_number: number
          status: string
          planned_start_date?: string | null
        }[]
      } | undefined)?.campaign_stage_plans ?? []
    return [...plans].sort((a, b) => a.stage_number - b.stage_number)
  }, [campaign])
  const nextStagePlan = sortedStagePlans.find(
    (s: { stage_number: number; planned_start_date?: string | null }) => s.stage_number === stageNumber + 1
  )
  const nextStagePlannedStartDate: string | null = nextStagePlan?.planned_start_date ?? null

  const prevStage = stageNumber > 1 ? stageNumber - 1 : null
  const nextStage = stageNumber < 6 ? stageNumber + 1 : null

  // Build campaign context for Theory of Winning
  const timeline = (campaign as any)?.campaign_timelines
  const agreement = timeline?.agreements
  const campaignRow = campaign as { campaign_type?: string; enterprise_agreement_subtype?: string | null } | null

  const campaignContext: TheoryOfWinningRequest['campaign_context'] = {
    employer_name: (campaign as any)?.organisers?.organiser_name || '',
    worksite_names: [],
    agreement_name: agreement?.agreement_name || campaign?.name || '',
    agreement_expiry: agreement?.expiry_date || timeline?.agreement_expiry_date,
    sector: '',
    is_greenfield: agreement != null ? Boolean(agreement.is_greenfield) : false,
    days_to_pabo: timeline?.pabo_available_date
      ? Math.ceil((new Date(timeline.pabo_available_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : undefined,
    campaign_type: campaignRow?.campaign_type,
    enterprise_agreement_subtype: campaignRow?.enterprise_agreement_subtype ?? undefined,
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

  const headerBlurb = stageHeaderBlurb(stageNumber)

  const agreementId = timeline?.agreement_id

  const stepIndex = P2W_TAB_ORDER.indexOf(activeTab as P2wTabId)
  const safeStepIndex = stepIndex >= 0 ? stepIndex : 0
  const prevStepTab = safeStepIndex > 0 ? P2W_TAB_ORDER[safeStepIndex - 1] : null
  const nextStepTab =
    safeStepIndex >= 0 && safeStepIndex < P2W_TAB_ORDER.length - 1
      ? P2W_TAB_ORDER[safeStepIndex + 1]
      : null

  const activeOverride: P2wStepOverride =
    overrides[activeTab as P2wTabId] ?? 'auto'

  function stepDone(tabId: P2wTabId): boolean {
    if (!completionInput) return false
    return effectiveStepComplete(tabId, completionInput, overrides[tabId])
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {stageNumber}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">
                  {campaign?.name || 'Campaign'}
                </Link>
                <ChevronRight className="h-3 w-3" />
                <span>Stage {stageNumber}</span>
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">{stageName}</h1>
                {headerBlurb && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-slate-400 hover:text-blue-600 transition-colors">
                        <Info className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 text-sm">
                      {headerBlurb}
                    </PopoverContent>
                  </Popover>
                )}
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[10px] px-1.5 py-0 h-5 border-none',
                    plan.status === 'active' ? 'bg-blue-100 text-blue-700' :
                    plan.status === 'completed' ? 'bg-green-100 text-green-700' :
                    plan.status === 'blocked' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-600'
                  )}
                >
                  {plan.status}
                </Badge>
              </div>
              {headerBlurb && showBlurb && (
                <div className="flex items-start gap-2 mt-1">
                  <p className="text-xs text-muted-foreground leading-snug max-w-2xl">
                    {headerBlurb}
                  </p>
                  <button 
                    onClick={() => setShowBlurb(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 mt-0.5"
                    title="Hide blurb"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOverviewOpen(true)}>
              <BookOpen className="h-3 w-3 mr-1" />
              Overview
            </Button>
            {prevStage && (
              <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                <Link href={`/campaigns/${campaignId}/plan/stage/${prevStage}`}>
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  Stage {prevStage}
                </Link>
              </Button>
            )}
            {nextStage && (
              <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                <Link href={`/campaigns/${campaignId}/plan/stage/${nextStage}`}>
                  Stage {nextStage}
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
            {nextStage && (
              <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                <Link href={`/campaigns/${campaignId}/plan/gate/${stageNumber}`}>
                  Gate {stageNumber}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <StageProgressBar
        campaignId={campaignId}
        currentStageNumber={stageNumber}
        stages={sortedStagePlans}
      />

      {/* Tabs: Playing to Win steps for this stage */}
      <div className="flex-1 overflow-hidden min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b bg-white px-6 flex-shrink-0 pt-1 pb-0">
            <TabsList className="h-auto bg-transparent p-0 gap-0 w-full justify-start flex-wrap">
              {P2W_TABS.map((tab, i) => {
                const Icon = tab.icon
                const stepNum = i + 1
                const tabId = tab.id as P2wTabId
                const done = stepDone(tabId)
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 text-sm',
                      done && 'text-green-700 data-[state=active]:text-blue-600'
                    )}
                  >
                    <span
                      className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold hidden sm:flex',
                        done
                          ? 'bg-green-100 text-green-800'
                          : 'bg-slate-100 text-slate-500 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-600'
                      )}
                    >
                      {done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : stepNum}
                    </span>
                    <Icon className="h-4 w-4 sm:hidden" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-6 pb-10">
              <TabsContent value="ambitions" className="mt-0">
                <AmbitionPanel
                  planId={plan.plan_id}
                  stageNumber={stageNumber}
                  campaignId={campaignId}
                  plannedEndDate={plan.planned_end_date}
                  nextStagePlannedStartDate={nextStagePlannedStartDate}
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
                  campaignContext={{
                    agreement_name: campaignContext.agreement_name,
                    employer_name: campaignContext.employer_name,
                    worksite_names: campaignContext.worksite_names,
                    sector: campaignContext.sector,
                    campaign_type: campaignContext.campaign_type,
                    agreement_expiry: campaignContext.agreement_expiry,
                  }}
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

              <footer className="mt-10 pt-6 border-t border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!prevStepTab}
                      onClick={() => prevStepTab && setActiveTab(prevStepTab)}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous step
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!nextStepTab}
                      onClick={() => nextStepTab && setActiveTab(nextStepTab)}
                    >
                      Next step
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="p2w-step-status" className="text-xs text-muted-foreground whitespace-nowrap">
                      Step status (this browser)
                    </Label>
                    <Select
                      value={activeOverride}
                      onValueChange={(v) => setOverride(activeTab as P2wTabId, v as P2wStepOverride)}
                    >
                      <SelectTrigger id="p2w-step-status" className="h-9 w-[200px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automatic (from data)</SelectItem>
                        <SelectItem value="force-complete">Mark complete</SelectItem>
                        <SelectItem value="force-incomplete">Still in progress</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {activeTab === 'management' && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    {nextStage ? (
                      <Button asChild className="w-full sm:w-auto">
                        <Link href={`/campaigns/${campaignId}/plan/stage/${nextStage}`}>
                          Continue to Stage {nextStage}
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild variant="secondary" className="w-full sm:w-auto">
                        <Link href={`/campaigns/${campaignId}`}>Back to campaign overview</Link>
                      </Button>
                    )}
                  </div>
                )}
              </footer>
            </div>
          </div>
        </Tabs>
      </div>

      <OverviewDialog open={overviewOpen} onOpenChange={setOverviewOpen} />
    </div>
  )
}
