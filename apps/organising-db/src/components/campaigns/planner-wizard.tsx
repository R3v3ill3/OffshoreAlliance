'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { format, addDays, subDays } from 'date-fns'
import { useAgreements, useLeadOrganisers, useCurrentUserProfile } from '@/lib/hooks/usePlannerOptions'
import {
  useCreateCampaign,
  useAddPlanToCampaign,
  useExistingCampaignForPlanning,
  type PlannerStageDateInput,
} from '@/lib/hooks/usePlannerCampaigns'
import { resetClient } from '@/lib/supabase/client'
import {
  buildInitialStageTimeline,
  calculateForwardsTimeline,
  calculateProportionalTimeline,
  redistributeAfterCompletedPrefix,
  type StageDateRange,
} from '@/lib/utils/timeline'
import { STAGE_NAMES } from '@/types/planner-types'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils/cn'
import {
  Building2,
  Calendar,
  Users,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react'

const STEPS = [
  { id: 1, title: 'Select Agreement', icon: Building2 },
  { id: 2, title: 'Set Parameters', icon: Users },
  { id: 3, title: 'Configure Timeline', icon: Calendar },
]

interface WizardState {
  agreement_id?: number
  agreement_name?: string
  employer_name?: string
  expiry_date?: string
  sector_name?: string
  worksite_names?: string[]
  campaign_name: string
  description: string
  organiser_id?: number
  msd_required: boolean
  stage_dates: Array<{
    stage_number: number
    stage_name: string
    planned_start: string
    planned_end: string
    duration_weeks: number
  }>
  timeline_mode: 'proportional' | 'backwards' | 'forwards'
  org_campaign_end_ymd: string | null
  completed_prefix_stages: number
}

function atNoonYmd(ymd: string): Date {
  return new Date(`${ymd}T12:00:00`)
}

function rebuildTimelineFromCampaignStart(
  startYmd: string,
  prev: Array<{ stage_number: number; stage_name: string; planned_start: string; planned_end: string; duration_weeks: number }>
) {
  if (!startYmd || prev.length === 0) return prev
  const custom: Partial<Record<number, number>> = {}
  for (const s of prev) custom[s.stage_number] = s.duration_weeks
  const ranges = calculateForwardsTimeline(atNoonYmd(startYmd), custom)
  return ranges.map((t) => ({
    stage_number: t.stage_number,
    stage_name: STAGE_NAMES[t.stage_number as keyof typeof STAGE_NAMES],
    planned_start: format(t.planned_start, 'yyyy-MM-dd'),
    planned_end: format(t.planned_end, 'yyyy-MM-dd'),
    duration_weeks: t.duration_weeks,
  }))
}

function mapRangesToWizardStages(ranges: StageDateRange[]): WizardState['stage_dates'] {
  return ranges.map((t) => ({
    stage_number: t.stage_number,
    stage_name: STAGE_NAMES[t.stage_number as keyof typeof STAGE_NAMES],
    planned_start: format(t.planned_start, 'yyyy-MM-dd'),
    planned_end: format(t.planned_end, 'yyyy-MM-dd'),
    duration_weeks: t.duration_weeks,
  }))
}

function resolveTimelineMode(
  linked: boolean,
  ec: { start_date?: string | null; end_date?: string | null } | null | undefined,
  agreementExpiry: string | null | undefined
): 'proportional' | 'backwards' | 'forwards' {
  if (linked && ec?.start_date && ec?.end_date) return 'proportional'
  if (linked && ec?.start_date) return 'forwards'
  if (agreementExpiry) return 'backwards'
  return 'forwards'
}

function buildStagePayloadForSubmit(
  stages: WizardState['stage_dates'],
  organisingActive: boolean,
  completedPrefix: number
): PlannerStageDateInput[] {
  return stages.map((s) => {
    const n = s.stage_number
    if (organisingActive && completedPrefix > 0) {
      if (n <= completedPrefix) {
        return {
          ...s,
          plan_status: 'completed',
          actual_start: s.planned_start,
          actual_end: s.planned_end,
        }
      }
      if (n === completedPrefix + 1) {
        return { ...s, plan_status: 'active', actual_start: null, actual_end: null }
      }
      return { ...s, plan_status: 'draft', actual_start: null, actual_end: null }
    }
    return {
      ...s,
      plan_status: n === 1 ? 'active' : 'draft',
      actual_start: null,
      actual_end: null,
    }
  })
}

export function CampaignCreationWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>({
    campaign_name: '',
    description: '',
    msd_required: false,
    stage_dates: [],
    timeline_mode: 'forwards',
    org_campaign_end_ymd: null,
    completed_prefix_stages: 0,
  })

  const initialTimelineRef = useRef<StageDateRange[] | null>(null)

  const { data: agreements, isLoading: agreementsLoading } = useAgreements()
  const { data: leadOrganisers, isLoading: organisersLoading } = useLeadOrganisers()
  const { data: myProfile } = useCurrentUserProfile()
  const createCampaign = useCreateCampaign()
  const addPlan = useAddPlanToCampaign()

  // Read all relevant query params from the launching context
  const autoAgreementId = Number(searchParams.get('agreement_id')) || null
  const linkedCampaignId = Number(searchParams.get('campaign_id')) || null
  const paramOrganiserId = Number(searchParams.get('organiser_id')) || null
  const paramExpiryDate = searchParams.get('expiry_date') || null

  const isLinkedMode = !!linkedCampaignId

  const { data: existingCampaign, isLoading: existingCampaignLoading } =
    useExistingCampaignForPlanning(linkedCampaignId)
  const hasReplacementSubtypeOrExistingAgreementContext = Boolean(
    existingCampaign?.requires_replacement_agreement ||
      existingCampaign?.has_linked_agreement_context ||
      autoAgreementId
  )
  const agreementRequired = !isLinkedMode || hasReplacementSubtypeOrExistingAgreementContext

  // Fail-safe: if the "Loading campaign details…" state persists beyond 15s,
  // surface an escape hatch so the user is never silently trapped by a hung
  // Supabase auth lock or stuck query. See /Users/troyb/.claude/plans/the-campaign-wizard-is-warm-dolphin.md
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  useEffect(() => {
    if (!(isLinkedMode && existingCampaignLoading)) {
      setLoadTimedOut(false)
      return
    }
    const t = setTimeout(() => setLoadTimedOut(true), 15_000)
    return () => clearTimeout(t)
  }, [isLinkedMode, existingCampaignLoading])

  // Redirect to existing plan if one already exists for this campaign.
  // Only check on initial data load — once the wizard becomes active
  // (user has advanced from step 1 or a submission is in progress),
  // suppress redirect even if useExistingCampaignForPlanning refetches
  // and finds has_plan: true (which happens after our own mutation
  // inserts campaign_stage_plans).
  const hasRedirected = useRef(false)
  const wizardInteracted = useRef(false)
  useEffect(() => {
    if (hasRedirected.current || wizardInteracted.current) return
    if (!existingCampaign) return
    if (existingCampaign.has_plan) {
      hasRedirected.current = true
      router.replace(`/campaigns/${existingCampaign.campaign_id}`)
    }
  }, [existingCampaign, router])

  // Pre-select agreement from existing campaign context or URL param
  const hasAutoSelected = useRef(false)

  useEffect(() => {
    if (hasAutoSelected.current || !agreements || agreements.length === 0) return

    // Priority 1: Linked campaign's replaced_agreement_id or timeline agreement
    if (existingCampaign && !existingCampaign.has_plan) {
      const agreementToSelect =
        existingCampaign.replaced_agreement_id ??
        existingCampaign.timeline_agreement_id ??
        null

      if (agreementToSelect) {
        const found = agreements.find((a) => a.agreement_id === agreementToSelect)
        if (found) {
          hasAutoSelected.current = true
          handleAgreementSelect(agreementToSelect)
          setState((p) => ({
            ...p,
            campaign_name: existingCampaign.name || p.campaign_name,
            description: (existingCampaign.description as string) || p.description,
          }))
          setStep(2)
          return
        }
      }

      // Even without an agreement, pre-fill name/description from the existing campaign
      const ranges = buildInitialStageTimeline({
        linkedStart: existingCampaign.start_date ?? null,
        linkedEnd: existingCampaign.end_date ?? null,
        agreementExpiry: null,
      })
      // Seed initialTimelineRef so the "Stages already complete" selector can
      // redistribute from the baseline timeline. Without this the onValueChange
      // returns early and the user's selection is silently dropped.
      initialTimelineRef.current = ranges.map((r) => ({
        stage_number: r.stage_number,
        planned_start: new Date(r.planned_start),
        planned_end: new Date(r.planned_end),
        duration_weeks: r.duration_weeks,
      }))
      const mode = resolveTimelineMode(true, existingCampaign, null)
      hasAutoSelected.current = true
      setState((p) => ({
        ...p,
        campaign_name: existingCampaign.name || p.campaign_name,
        description: (existingCampaign.description as string) || p.description,
        stage_dates: mapRangesToWizardStages(ranges),
        timeline_mode: mode,
        org_campaign_end_ymd: existingCampaign.end_date ? String(existingCampaign.end_date) : null,
      }))
      return
    }

    // Priority 2: agreement_id from URL param (e.g. launched from dashboard or agreement page)
    if (autoAgreementId) {
      const found = agreements.find((a) => a.agreement_id === autoAgreementId)
      if (found) {
        hasAutoSelected.current = true
        handleAgreementSelect(autoAgreementId)
        setStep(2)
        return
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreements, existingCampaign, autoAgreementId])

  // Use expiry_date from query param as fallback when agreement doesn't have one
  useEffect(() => {
    if (!paramExpiryDate || state.expiry_date || !state.agreement_id) return
    setState((p) => ({ ...p, expiry_date: paramExpiryDate }))
  }, [paramExpiryDate, state.expiry_date, state.agreement_id])

  // Auto-default the organiser: query param > existing campaign > user profile
  useEffect(() => {
    if (!leadOrganisers || state.organiser_id) return

    if (paramOrganiserId) {
      setState((p) => ({ ...p, organiser_id: paramOrganiserId }))
      return
    }

    if (existingCampaign?.organiser_id) {
      setState((p) => ({ ...p, organiser_id: existingCampaign.organiser_id as number }))
      return
    }

    if (!myProfile) return

    if (myProfile.work_role === 'lead_organiser' && myProfile.organiser_id) {
      setState((p) => ({ ...p, organiser_id: myProfile.organiser_id as number }))
      return
    }

    if (myProfile.reports_to) {
      const manager = leadOrganisers.find((lo) => lo.user_profile_id === myProfile.reports_to)
      if (manager) {
        setState((p) => ({ ...p, organiser_id: manager.organiser_id }))
      }
    }
  }, [myProfile, leadOrganisers, state.organiser_id, paramOrganiserId, existingCampaign])

  const progress = ((step - 1) / (STEPS.length - 1)) * 100

  function markWizardActive() {
    wizardInteracted.current = true
  }

  function handleAgreementSelect(agreementId: number) {
    markWizardActive()
    const agreement = agreements?.find((a) => a.agreement_id === agreementId)
    if (!agreement) return

    const expiryDate = agreement.expiry_date
    const employerName = (agreement.employers as { employer_name?: string } | null)?.employer_name || ''
    const sectorName = (agreement.sectors as { sector_name?: string } | null)?.sector_name || ''
    const worksiteNames = (agreement.agreement_worksites as Array<{ worksites?: { worksite_name?: string } | null }> | null)
      ?.map((aw) => aw.worksites?.worksite_name || '')
      .filter(Boolean) || []

    const year = new Date().getFullYear()
    const shortName = agreement.short_name || employerName

    const ranges = buildInitialStageTimeline({
      linkedStart: isLinkedMode ? existingCampaign?.start_date ?? null : null,
      linkedEnd: isLinkedMode ? existingCampaign?.end_date ?? null : null,
      agreementExpiry: expiryDate ?? null,
    })

    const mode = resolveTimelineMode(isLinkedMode, existingCampaign, expiryDate ?? null)

    initialTimelineRef.current = ranges.map((r) => ({
      stage_number: r.stage_number,
      planned_start: new Date(r.planned_start),
      planned_end: new Date(r.planned_end),
      duration_weeks: r.duration_weeks,
    }))

    const stageDates = mapRangesToWizardStages(ranges)
    const linkedName =
      isLinkedMode && existingCampaign?.name ? String(existingCampaign.name) : null

    setState((prev) => ({
      ...prev,
      agreement_id: agreementId,
      agreement_name: agreement.agreement_name,
      employer_name: employerName,
      expiry_date: expiryDate || undefined,
      sector_name: sectorName,
      worksite_names: worksiteNames,
      campaign_name: linkedName ?? `${shortName} EBA ${year}`,
      stage_dates: stageDates,
      timeline_mode: mode,
      org_campaign_end_ymd:
        isLinkedMode && existingCampaign?.end_date ? String(existingCampaign.end_date) : null,
      completed_prefix_stages: 0,
    }))
  }

  function updateStageDuration(stageNumber: number, weeks: number) {
    if (!weeks || weeks < 0.1) return
    const days = Math.round(weeks * 7)
    updateStageDurationDays(stageNumber, days)
  }

  function updateStageDurationDays(stageNumber: number, days: number) {
    if (!days || days < 1) return

    setState((prev) => {
      const newDates = [...prev.stage_dates]
      const idx = newDates.findIndex((s) => s.stage_number === stageNumber)
      if (idx === -1) return prev

      newDates[idx] = {
        ...newDates[idx],
        duration_weeks: Math.round((days / 7) * 10) / 10,
        planned_end: format(
          addDays(new Date(newDates[idx].planned_start), days),
          'yyyy-MM-dd'
        ),
      }

      for (let i = idx + 1; i < newDates.length; i++) {
        newDates[i] = {
          ...newDates[i],
          planned_start: newDates[i - 1].planned_end,
          planned_end: format(
            addDays(new Date(newDates[i - 1].planned_end), Math.round(newDates[i].duration_weeks * 7)),
            'yyyy-MM-dd'
          ),
        }
      }

      return { ...prev, stage_dates: newDates }
    })
  }

  const isLinkedOrganisingActive =
    isLinkedMode && existingCampaign?.status?.toLowerCase() === 'active'
  const canContinueFromStep1 = state.agreement_id || !agreementRequired

  const isSubmitting = createCampaign.isPending || addPlan.isPending

  async function handleSubmit() {
    if (!state.organiser_id) {
      toast.error('Please select a lead organiser')
      return
    }
    if (!state.campaign_name) {
      toast.error('Please enter a campaign name')
      return
    }

    try {
      const stagePayload = buildStagePayloadForSubmit(
        state.stage_dates,
        isLinkedOrganisingActive,
        state.completed_prefix_stages
      )

      if (isLinkedMode && linkedCampaignId) {
        await addPlan.mutateAsync({
          campaign_id: linkedCampaignId,
          organiser_id: state.organiser_id,
          start_date: state.stage_dates[0]?.planned_start || format(new Date(), 'yyyy-MM-dd'),
          agreement_id: state.agreement_id,
          expiry_date: state.expiry_date,
          stage_dates: stagePayload,
        })

        toast.success('Campaign plan created successfully')
        router.push(`/campaigns/${linkedCampaignId}`)
      } else {
        const campaign = await createCampaign.mutateAsync({
          name: state.campaign_name,
          description: state.description,
          campaign_type: existingCampaign?.campaign_type || 'bargaining',
          organiser_id: state.organiser_id,
          start_date: state.stage_dates[0]?.planned_start || format(new Date(), 'yyyy-MM-dd'),
          agreement_id: state.agreement_id,
          expiry_date: state.expiry_date,
          msd_required: state.msd_required,
          stage_dates: stagePayload,
        })

        toast.success('Campaign created successfully')
        router.push(`/campaigns/${campaign.campaign_id}`)
      }
    } catch (error) {
      toast.error('Failed to create campaign plan. Please try again.')
      console.error(error)
    }
  }

  const daysToExpiry = state.expiry_date
    ? Math.ceil((new Date(state.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const daysToPane = state.expiry_date ? (daysToExpiry || 0) - 30 : null

  if (isLinkedMode && existingCampaignLoading && !loadTimedOut) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-muted-foreground text-sm">
        Loading campaign details...
      </div>
    )
  }

  if (isLinkedMode && existingCampaignLoading && loadTimedOut) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              <div>
                <CardTitle>Still loading campaign #{linkedCampaignId}</CardTitle>
                <CardDescription>
                  This is usually a transient connection issue. Retry, or go back
                  to the campaign and try again shortly.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button
              className="flex-1"
              onClick={() => {
                // A held Web Lock survives resetClient() — only a full document
                // unload reliably releases it. window.location.reload() forces
                // the unload; the fresh page load gets a new client + new lock.
                resetClient()
                window.location.reload()
              }}
            >
              Retry
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push(`/campaigns/${linkedCampaignId}`)}
            >
              Back to campaign
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLinkedMode && existingCampaign?.has_plan && !wizardInteracted.current) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center text-muted-foreground text-sm">
        This campaign already has a plan. Redirecting...
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Linked campaign banner */}
      {isLinkedMode && existingCampaign && (
        <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 p-4">
          <p className="text-sm font-semibold text-blue-900">
            Adding campaign plan to: {existingCampaign.name}
          </p>
          <p className="text-xs text-blue-700 mt-1">
            The campaign was created in the Organising DB. This wizard will add stage plans, gates, and timelines.
          </p>
        </div>
      )}

      {/* Progress header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const isComplete = step > s.id
            const isCurrent = step === s.id
            return (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors',
                      isComplete ? 'bg-green-500 border-green-500 text-white' :
                      isCurrent ? 'bg-blue-600 border-blue-600 text-white' :
                      'bg-white border-slate-200 text-slate-400'
                    )}
                  >
                    {isComplete ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span className={cn(
                    'text-xs mt-1 font-medium hidden sm:block',
                    isCurrent ? 'text-blue-600' : isComplete ? 'text-green-600' : 'text-slate-400'
                  )}>
                    {s.title}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    'h-0.5 flex-1 mx-2 mt-[-1rem] transition-colors',
                    step > s.id ? 'bg-green-400' : 'bg-slate-200'
                  )} />
                )}
              </div>
            )
          })}
        </div>
        <Progress value={progress} className="h-1" />
      </div>

      {/* Step 1: Select Agreement */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select Enterprise Agreement</CardTitle>
            <CardDescription>
              {agreementRequired
                ? 'Choose the agreement this campaign relates to. We will auto-populate employer, worksite and expiry details.'
                : 'Agreement selection is optional for this campaign. If there is no linked agreement yet, continue without selecting one.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!agreementRequired && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Agreement optional for this campaign</p>
                <p className="text-xs mt-1 text-amber-800">
                  You can continue without an enterprise agreement and attach one later if needed.
                </p>
              </div>
            )}
            {agreementsLoading ? (
              <div className="text-sm text-muted-foreground">Loading agreements...</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {agreements?.map((agreement) => {
                  const isSelected = state.agreement_id === agreement.agreement_id
                  const daysLeft = agreement.expiry_date
                    ? Math.ceil((new Date(agreement.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null

                  return (
                    <button
                      key={agreement.agreement_id}
                      onClick={() => handleAgreementSelect(agreement.agreement_id)}
                      className={cn(
                        'w-full text-left p-4 rounded-lg border-2 transition-colors',
                        isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{agreement.agreement_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {(agreement.employers as { employer_name?: string } | null)?.employer_name}
                            {agreement.expiry_date && ` • Expires ${format(new Date(agreement.expiry_date), 'dd MMM yyyy')}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge
                            variant={agreement.status === 'Current' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {agreement.status}
                          </Badge>
                          {daysLeft !== null && (
                            <Badge
                              className={cn(
                                'text-xs',
                                daysLeft < 180 ? 'bg-red-100 text-red-700' :
                                daysLeft < 365 ? 'bg-amber-100 text-amber-700' :
                                'bg-green-100 text-green-700'
                              )}
                              variant="secondary"
                            >
                              {daysLeft < 0 ? 'Expired' : `${Math.round(daysLeft / 30)}mo`}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {state.agreement_id && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-900">Selected Agreement Details</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-800">
                  <div><span className="font-medium">Employer:</span> {state.employer_name}</div>
                  <div><span className="font-medium">Sector:</span> {state.sector_name}</div>
                  {state.expiry_date && (
                    <>
                      <div><span className="font-medium">Expiry:</span> {format(new Date(state.expiry_date), 'dd MMM yyyy')}</div>
                      <div><span className="font-medium">PABO available:</span> {format(subDays(new Date(state.expiry_date), 30), 'dd MMM yyyy')}</div>
                    </>
                  )}
                  {daysToPane !== null && (
                    <div className="col-span-2">
                      <span className={cn(
                        'font-semibold',
                        daysToPane < 60 ? 'text-red-700' : daysToPane < 180 ? 'text-amber-700' : 'text-green-700'
                      )}>
                        {daysToPane > 0 ? `${daysToPane} days until PABO is available` : 'PABO is available now'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {!agreementRequired && !state.agreement_id && (
              <Button
                variant="outline"
                onClick={() => { markWizardActive(); setStep(2) }}
              >
                Continue without agreement
              </Button>
            )}
            {agreementRequired && !state.agreement_id && (
              <p className="text-xs text-amber-700">
                Select an agreement to continue. Replacement agreement campaigns require an agreement link.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Parameters */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Set Campaign Parameters</CardTitle>
            <CardDescription>
              {isLinkedMode
                ? 'Confirm the lead organiser and key settings for this campaign plan.'
                : 'Configure the campaign name, lead organiser and key settings.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input
                id="campaign-name"
                value={state.campaign_name}
                onChange={(e) => setState((p) => ({ ...p, campaign_name: e.target.value }))}
                placeholder="e.g. Chevron EBA 2026"
                readOnly={isLinkedMode}
                className={isLinkedMode ? 'bg-muted cursor-not-allowed' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={state.description}
                onChange={(e) => setState((p) => ({ ...p, description: e.target.value }))}
                placeholder="Brief description of this campaign..."
                rows={3}
                readOnly={isLinkedMode}
                className={isLinkedMode ? 'bg-muted cursor-not-allowed' : ''}
              />
            </div>

            <div className="space-y-2">
              <Label>Lead Organiser</Label>
              {organisersLoading ? (
                <div className="text-sm text-muted-foreground">Loading organisers...</div>
              ) : (
                <Select
                  value={state.organiser_id?.toString() ?? ''}
                  onValueChange={(v) => setState((p) => ({ ...p, organiser_id: parseInt(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select lead organiser..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leadOrganisers?.map((o) => (
                      <SelectItem key={o.organiser_id} value={o.organiser_id.toString()}>
                        {o.organiser_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium text-sm">MSD (Majority Support Determination) Required</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  If yes, organisers should treat MSD outcomes as non-negotiable (mark as hard gate on Stage 4 ambitions).
                </p>
              </div>
              <Switch
                checked={state.msd_required}
                onCheckedChange={(checked) => setState((p) => ({ ...p, msd_required: checked }))}
              />
            </div>

            {state.msd_required && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>MSD is enabled. On Stage 4, mark the relevant membership / MSD ambitions as <strong>hard gates</strong> when planning — progression will be blocked until those are met.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Timeline */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Timeline</CardTitle>
            <CardDescription>
              {state.timeline_mode === 'proportional'
                ? 'Stages are scaled between your Organising DB campaign start and end dates using the same duration ratios as the default OA Planner timeline. Adjust stage lengths as needed.'
                : state.timeline_mode === 'backwards' && state.expiry_date
                  ? `Timeline calculated working backwards from PABO date (${format(subDays(new Date(state.expiry_date), 30), 'dd MMM yyyy')}). Adjust stage durations as needed.`
                  : state.timeline_mode === 'forwards' && isLinkedMode && existingCampaign?.start_date
                    ? 'Timeline runs forward from your Organising DB campaign start date. Adjust stage durations as needed.'
                    : state.expiry_date
                      ? `Timeline calculated working backwards from PABO date (${format(subDays(new Date(state.expiry_date), 30), 'dd MMM yyyy')}). Adjust stage durations as needed.`
                      : 'No agreement expiry date — timeline calculated forwards from today. Adjust as needed.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLinkedOrganisingActive && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                <Label>Stages already complete</Label>
                <p className="text-xs text-muted-foreground">
                  This campaign is marked Active in Organising DB. Choose how many opening stages are already finished;
                  later stages will be rescheduled from the end of that block (using the same ratios in any remaining
                  window to your campaign end date, if set).
                </p>
                <Select
                  value={String(state.completed_prefix_stages)}
                  onValueChange={(v) => {
                    const n = parseInt(v, 10)
                    const base = initialTimelineRef.current
                    if (!base?.length) return
                    const next = redistributeAfterCompletedPrefix(base, n, state.org_campaign_end_ymd)
                    setState((p) => ({
                      ...p,
                      completed_prefix_stages: n,
                      stage_dates: mapRangesToWizardStages(next),
                    }))
                  }}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Completed stages" />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5].map((k) => (
                      <SelectItem key={k} value={String(k)}>
                        {k === 0 ? 'None — stage 1 is the active stage' : `Stages 1–${k} already complete`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="campaign-start">Campaign start date</Label>
              <p className="text-xs text-muted-foreground">
                Stage 1 begins on this date (defaults from the timeline below). Adjust for back-fill or campaigns already under way.
              </p>
              <div className="max-w-[180px]">
                <DateInput
                  id="campaign-start"
                  value={state.stage_dates[0]?.planned_start ?? ''}
                  onChange={(v) => {
                    if (!v) return
                    if (state.timeline_mode === 'proportional' && state.org_campaign_end_ymd) {
                      const base = calculateProportionalTimeline(
                        atNoonYmd(v),
                        atNoonYmd(state.org_campaign_end_ymd)
                      )
                      initialTimelineRef.current = base.map((r) => ({
                        stage_number: r.stage_number,
                        planned_start: new Date(r.planned_start),
                        planned_end: new Date(r.planned_end),
                        duration_weeks: r.duration_weeks,
                      }))
                      const k = state.completed_prefix_stages
                      const final =
                        k > 0
                          ? redistributeAfterCompletedPrefix(
                              initialTimelineRef.current,
                              k,
                              state.org_campaign_end_ymd
                            )
                          : base
                      setState((p) => ({
                        ...p,
                        stage_dates: mapRangesToWizardStages(final),
                      }))
                      return
                    }
                    setState((p) => ({
                      ...p,
                      stage_dates: rebuildTimelineFromCampaignStart(v, p.stage_dates),
                    }))
                  }}
                />
              </div>
            </div>

            {state.expiry_date && daysToPane !== null && (
              <div className={cn(
                'flex items-center gap-2 p-3 rounded-lg text-sm',
                daysToPane < 60 ? 'bg-red-50 border border-red-200 text-red-800' :
                daysToPane < 180 ? 'bg-amber-50 border border-amber-200 text-amber-800' :
                'bg-green-50 border border-green-200 text-green-800'
              )}>
                <Clock className="h-4 w-4 flex-shrink-0" />
                <p>
                  <strong>{daysToPane > 0 ? `${daysToPane} days` : 'PABO is already available'}</strong>
                  {daysToPane > 0 ? ' until PABO becomes available' : ''}
                  {state.expiry_date && ` · Agreement expires ${format(new Date(state.expiry_date), 'dd MMM yyyy')}`}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {state.stage_dates.map((stage) => (
                <div key={stage.stage_number} className="rounded-lg border bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                      {stage.stage_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{stage.stage_name}</p>
                        {isLinkedOrganisingActive &&
                          stage.stage_number <= state.completed_prefix_stages && (
                            <Badge variant="secondary" className="text-xs">
                              Marked complete
                            </Badge>
                          )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(stage.planned_start), 'dd/MM/yyyy')} →{' '}
                        {format(new Date(stage.planned_end), 'dd/MM/yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-11">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="1"
                        value={Math.round(stage.duration_weeks * 7)}
                        onChange={(e) => updateStageDurationDays(stage.stage_number, parseInt(e.target.value))}
                        className="w-16 text-center text-sm"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">days</span>
                    </div>
                    <span className="text-xs text-muted-foreground">/</span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={stage.duration_weeks}
                        onChange={(e) => updateStageDuration(stage.stage_number, parseFloat(e.target.value))}
                        className="w-16 text-center text-sm"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">weeks</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        <span className="text-sm text-muted-foreground">Step {step} of {STEPS.length}</span>

        {step < STEPS.length ? (
          <Button
            onClick={() => { markWizardActive(); setStep((s) => Math.min(STEPS.length, s + 1)) }}
            disabled={step === 1 && !canContinueFromStep1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !state.organiser_id || !state.campaign_name}
          >
            {isSubmitting ? 'Creating...' : isLinkedMode ? 'Create Campaign Plan' : 'Create Campaign'}
          </Button>
        )}
      </div>
    </div>
  )
}
