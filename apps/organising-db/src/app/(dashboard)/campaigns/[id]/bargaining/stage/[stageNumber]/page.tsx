'use client'

import { use, useMemo, useState, useEffect, useRef } from 'react'
import { useCampaign } from '@/lib/hooks/usePlannerCampaigns'
import { useStagePlan, useInitializeCampaignStagePlans } from '@/lib/hooks/useStagePlan'
import { useAllGates } from '@/lib/hooks/useGateAssessment'
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
import { P2WVerticalNav } from '@/components/campaigns/planning/P2WVerticalNav'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils/cn'
import type { TheoryOfWinningRequest } from '@/types/planner-types'

const BARGAINING_STAGE_NAMES: Record<number, string> = {
  7: 'Commence Bargaining',
  8: 'Active Bargaining',
  9: 'Intractable / Strength Assessment',
  10: 'Protected Industrial Action',
  11: 'Endorsement & Settlement',
}

const MIN_BARGAINING_STAGE = 7
const MAX_BARGAINING_STAGE = 11

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

export default function BargainingStagePage({ params }: PageProps) {
  const { id, stageNumber: stageNumStr } = use(params)
  const campaignId = parseInt(id)
  const stageNumber = parseInt(stageNumStr)

  const { data: campaign } = useCampaign(campaignId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stagePlanData, isLoading } = (useStagePlan as any)(campaignId, stageNumber, { phase: 'bargaining_to_win' })
  const { data: gates } = useAllGates(campaignId)

  // Auto-heal: if the stage plan is missing, trigger a one-shot mutation to
  // create the bargaining stage plans. After success, the query invalidates.
  const initMutation = useInitializeCampaignStagePlans()
  const initAttemptedRef = useRef(false)
  const shouldInit =
    !isLoading &&
    !!campaign &&
    stagePlanData !== undefined &&
    stagePlanData.plan === null &&
    !initAttemptedRef.current &&
    !initMutation.isPending &&
    !initMutation.isError

  useEffect(() => {
    if (!shouldInit) return
    initAttemptedRef.current = true
    initMutation.mutate({ campaign_id: campaignId, phase: 'bargaining_to_win' } as any)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldInit, campaignId])

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

  const stageName = BARGAINING_STAGE_NAMES[stageNumber] ?? `Stage ${stageNumber}`
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
    (s: { stage_number: number; planned_start_date?: string | null }) =>
      s.stage_number === stageNumber + 1
  )
  const nextStagePlannedStartDate: string | null = nextStagePlan?.planned_start_date ?? null

  const prevStage = stageNumber > MIN_BARGAINING_STAGE ? stageNumber - 1 : null
  const nextStage = stageNumber < MAX_BARGAINING_STAGE ? stageNumber + 1 : null

  const overlapStatus = useMemo(() => {
    if (!stagePlanData?.plan?.planned_start_date || !stagePlanData?.plan?.planned_end_date) {
      return { hasOverlap: false, hardLocked: false, message: null as string | null }
    }
    const curStart = stagePlanData.plan.planned_start_date
    const curEnd = stagePlanData.plan.planned_end_date
    const prevStagePlan = sortedStagePlans.find(
      (s: { stage_number: number; planned_end_date?: string | null }) =>
        s.stage_number === stageNumber - 1
    ) as { planned_end_date?: string | null } | undefined
    const overlapsPrev = !!(
      prevStagePlan?.planned_end_date &&
      curStart < prevStagePlan.planned_end_date
    )
    const overlapsNext = !!(
      nextStagePlannedStartDate && nextStagePlannedStartDate < curEnd
    )
    const gateBefore = gates?.find(
      (g: { gate_number: number }) => g.gate_number === stageNumber - 1
    ) as { enforcement_type?: string; is_active?: boolean } | undefined
    const gateAfter = gates?.find(
      (g: { gate_number: number }) => g.gate_number === stageNumber
    ) as { enforcement_type?: string; is_active?: boolean } | undefined
    const prevHard =
      overlapsPrev &&
      gateBefore?.enforcement_type === 'hard' &&
      gateBefore?.is_active === true
    const nextHard =
      overlapsNext &&
      gateAfter?.enforcement_type === 'hard' &&
      gateAfter?.is_active === true
    const hasOverlap = overlapsPrev || overlapsNext
    const hardLocked = prevHard || nextHard
    const parts: string[] = []
    if (overlapsPrev)
      parts.push(`overlaps with stage ${stageNumber - 1}${prevHard ? ' (hard gate locked)' : ''}`)
    if (overlapsNext)
      parts.push(`overlaps with stage ${stageNumber + 1}${nextHard ? ' (hard gate locked)' : ''}`)
    return {
      hasOverlap,
      hardLocked,
      message: parts.length > 0 ? `This stage ${parts.join(' and ')}.` : null,
    }
  }, [stagePlanData?.plan, sortedStagePlans, nextStagePlannedStartDate, gates, stageNumber])

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
    if (initMutation.isPending || (shouldInit && !initMutation.isError)) {
      return (
        <div className="p-6">
          <div className="max-w-xl mx-auto text-center space-y-3 pt-10">
            <h1 className="text-lg font-semibold">Setting up bargaining planner…</h1>
            <p className="text-sm text-muted-foreground">
              Initialising the bargaining stage plan. This usually takes a moment.
            </p>
            <div className="animate-pulse pt-4">
              <div className="h-2 bg-slate-200 rounded w-full" />
            </div>
          </div>
        </div>
      )
    }

    if (initMutation.isError) {
      const errMsg =
        initMutation.error instanceof Error
          ? initMutation.error.message
          : String(initMutation.error)
      return (
        <div className="p-6 text-center">
          <p className="text-slate-700 font-medium">Unable to initialise bargaining stage plans</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{errMsg}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={`/campaigns/${campaignId}/bargaining`}>Back to Bargaining</Link>
          </Button>
        </div>
      )
    }

    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Stage plan not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={`/campaigns/${campaignId}/bargaining`}>Back to Bargaining</Link>
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
                <Link href={`/campaigns/${campaignId}/bargaining`} className="hover:text-foreground">
                  Bargaining
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
                <Link href={`/campaigns/${campaignId}/bargaining/stage/${prevStage}`}>
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  Stage {prevStage}
                </Link>
              </Button>
            )}
            {nextStage && (
              <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                <Link href={`/campaigns/${campaignId}/bargaining/stage/${nextStage}`}>
                  Stage {nextStage}
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {overlapStatus.hasOverlap && overlapStatus.message && (
        <div
          className={cn(
            'border-b px-6 py-2 text-xs flex items-center gap-2',
            overlapStatus.hardLocked
              ? 'bg-blue-50 text-blue-900 border-blue-200'
              : 'bg-amber-50 text-amber-900 border-amber-200'
          )}
        >
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            {overlapStatus.message}{' '}
            {overlapStatus.hardLocked
              ? 'Hard active gate prevents further overlap on the locked side; resolve dates before changing.'
              : 'Soft / inactive gate — overlap is permitted while the gate stays soft.'}
          </span>
        </div>
      )}

      <StageProgressBar
        campaignId={campaignId}
        currentStageNumber={stageNumber}
        stages={sortedStagePlans}
      />

      {/* Vertical Playing-to-Win navigation + active step content */}
      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden min-h-0">
        <P2WVerticalNav
          steps={P2W_TABS}
          activeId={activeTab}
          onChange={setActiveTab}
          isComplete={(id) => stepDone(id as P2wTabId)}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-6 pb-10">
            {activeTab === 'ambitions' && (
              <AmbitionPanel
                planId={plan.plan_id}
                stageNumber={stageNumber}
                campaignId={campaignId}
                plannedEndDate={plan.planned_end_date}
                nextStagePlannedStartDate={nextStagePlannedStartDate}
                ambitions={(stagePlanData?.ambitions || []) as any}
              />
            )}

            {activeTab === 'where-to-play' && (
              <WhereToPlayPanel
                planId={plan.plan_id}
                stageNumber={stageNumber}
                campaignId={campaignId}
                agreementId={agreementId}
                whereToPlay={(stagePlanData?.whereToPlay || []) as any}
                ambitions={(stagePlanData?.ambitions || []) as any}
              />
            )}

            {activeTab === 'theory' && (
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
            )}

            {activeTab === 'capacities' && (
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
            )}

            {activeTab === 'management' && (
              <ManagementSystemsPanel
                planId={plan.plan_id}
                stageNumber={stageNumber}
                campaignId={campaignId}
                managementSystems={(stagePlanData?.managementSystems || []) as any}
              />
            )}

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
                    Step status
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
                      <Link href={`/campaigns/${campaignId}/bargaining/stage/${nextStage}`}>
                        Continue to Stage {nextStage}
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild variant="secondary" className="w-full sm:w-auto">
                      <Link href={`/campaigns/${campaignId}/bargaining`}>Back to bargaining overview</Link>
                    </Button>
                  )}
                </div>
              )}
            </footer>
          </div>
        </div>
      </div>

      <OverviewDialog open={overviewOpen} onOpenChange={setOverviewOpen} />
    </div>
  )
}
