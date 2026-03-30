'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format, addDays, subDays } from 'date-fns'
import { useAgreements, useOrganisers } from '@/lib/hooks/useOptions'
import { useCreateCampaign } from '@/lib/hooks/useCampaigns'
import { calculateBackwardsTimeline, calculateForwardsTimeline } from '@/lib/utils/timeline'
import { STAGE_NAMES, GATE_NAMES } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  Building2,
  Calendar,
  Users,
  Shield,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Clock,
  AlertTriangle,
  Lock,
} from 'lucide-react'

const STEPS = [
  { id: 1, title: 'Select Agreement', icon: Building2 },
  { id: 2, title: 'Set Parameters', icon: Users },
  { id: 3, title: 'Configure Timeline', icon: Calendar },
  { id: 4, title: 'Configure Gates', icon: Shield },
]

interface WizardState {
  // Step 1
  agreement_id?: number
  agreement_name?: string
  employer_name?: string
  expiry_date?: string
  sector_name?: string
  worksite_names?: string[]

  // Step 2
  campaign_name: string
  description: string
  organiser_id?: number
  msd_required: boolean

  // Step 3
  stage_dates: Array<{
    stage_number: number
    stage_name: string
    planned_start: string
    planned_end: string
    duration_weeks: number
  }>

  // Step 4
  gate_enforcement: Record<number, 'soft' | 'hard'>
  gate_criteria_overrides: Record<number, Record<string, string>>
}

export function CampaignCreationWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>({
    campaign_name: '',
    description: '',
    msd_required: false,
    stage_dates: [],
    gate_enforcement: { 1: 'soft', 2: 'soft', 3: 'soft', 4: 'soft', 5: 'soft' },
    gate_criteria_overrides: {},
  })

  const { data: agreements, isLoading: agreementsLoading } = useAgreements()
  const { data: organisers, isLoading: organisersLoading } = useOrganisers()
  const createCampaign = useCreateCampaign()

  const progress = ((step - 1) / (STEPS.length - 1)) * 100

  function handleAgreementSelect(agreementId: number) {
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

    // Auto-calculate timeline if expiry date exists
    let stageDates: WizardState['stage_dates'] = []
    if (expiryDate) {
      const paboDate = subDays(new Date(expiryDate), 30)
      const timeline = calculateBackwardsTimeline(paboDate)
      stageDates = timeline.map((t) => ({
        stage_number: t.stage_number,
        stage_name: STAGE_NAMES[t.stage_number as keyof typeof STAGE_NAMES],
        planned_start: format(t.planned_start, 'yyyy-MM-dd'),
        planned_end: format(t.planned_end, 'yyyy-MM-dd'),
        duration_weeks: t.duration_weeks,
      }))
    } else {
      // Start from today
      const today = new Date()
      const timeline = calculateForwardsTimeline(today)
      stageDates = timeline.map((t) => ({
        stage_number: t.stage_number,
        stage_name: STAGE_NAMES[t.stage_number as keyof typeof STAGE_NAMES],
        planned_start: format(t.planned_start, 'yyyy-MM-dd'),
        planned_end: format(t.planned_end, 'yyyy-MM-dd'),
        duration_weeks: t.duration_weeks,
      }))
    }

    setState((prev) => ({
      ...prev,
      agreement_id: agreementId,
      agreement_name: agreement.agreement_name,
      employer_name: employerName,
      expiry_date: expiryDate || undefined,
      sector_name: sectorName,
      worksite_names: worksiteNames,
      campaign_name: `${shortName} EBA ${year}`,
      stage_dates: stageDates,
    }))
  }

  function updateStageDuration(stageNumber: number, weeks: number) {
    if (!weeks || weeks < 1) return

    setState((prev) => {
      const newDates = [...prev.stage_dates]
      const idx = newDates.findIndex((s) => s.stage_number === stageNumber)
      if (idx === -1) return prev

      // Recalculate from this stage onwards
      newDates[idx].duration_weeks = weeks
      newDates[idx].planned_end = format(
        addDays(new Date(newDates[idx].planned_start), weeks * 7),
        'yyyy-MM-dd'
      )

      for (let i = idx + 1; i < newDates.length; i++) {
        newDates[i].planned_start = newDates[i - 1].planned_end
        newDates[i].planned_end = format(
          addDays(new Date(newDates[i].planned_start), newDates[i].duration_weeks * 7),
          'yyyy-MM-dd'
        )
      }

      return { ...prev, stage_dates: newDates }
    })
  }

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
      const campaign = await createCampaign.mutateAsync({
        name: state.campaign_name,
        description: state.description,
        campaign_type: 'bargaining',
        organiser_id: state.organiser_id,
        start_date: state.stage_dates[0]?.planned_start || format(new Date(), 'yyyy-MM-dd'),
        agreement_id: state.agreement_id,
        expiry_date: state.expiry_date,
        msd_required: state.msd_required,
        stage_dates: state.stage_dates,
        gate_overrides: Object.fromEntries(
          Object.entries(state.gate_enforcement).map(([k, v]) => [k, { enforcement_type: v }])
        ),
      })

      toast.success('Campaign created successfully')
      router.push(`/campaigns/${campaign.campaign_id}`)
    } catch (error) {
      toast.error('Failed to create campaign. Please try again.')
      console.error(error)
    }
  }

  const daysToExpiry = state.expiry_date
    ? Math.ceil((new Date(state.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const daysToPane = state.expiry_date ? (daysToExpiry || 0) - 30 : null

  return (
    <div className="max-w-3xl mx-auto">
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
              Choose the agreement this campaign relates to. We&apos;ll auto-populate employer, worksite and expiry details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      )}

      {/* Step 2: Parameters */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Set Campaign Parameters</CardTitle>
            <CardDescription>Configure the campaign name, lead organiser and key settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input
                id="campaign-name"
                value={state.campaign_name}
                onChange={(e) => setState((p) => ({ ...p, campaign_name: e.target.value }))}
                placeholder="e.g. Chevron EBA 2026"
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
                    {organisers?.map((o) => (
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
                  If yes, the 50%+ MSD criterion in Gate 4 becomes a hard gate — non-negotiable.
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
                <p>MSD is enabled. The Gate 4 criterion requiring 50%+ member support will be a <strong>hard gate</strong> — stage progression will be blocked until this is met.</p>
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
              {state.expiry_date
                ? `Timeline calculated working backwards from PABO date (${format(subDays(new Date(state.expiry_date), 30), 'dd MMM yyyy')}). Adjust stage durations as needed.`
                : 'No agreement expiry date — timeline calculated forwards from today. Adjust as needed.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <div key={stage.stage_number} className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                    {stage.stage_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{stage.stage_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(stage.planned_start), 'dd MMM yyyy')} →{' '}
                      {format(new Date(stage.planned_end), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Input
                      type="number"
                      min="1"
                      max="52"
                      value={stage.duration_weeks}
                      onChange={(e) => updateStageDuration(stage.stage_number, parseInt(e.target.value))}
                      className="w-16 text-center text-sm"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">weeks</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Gates */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Gates</CardTitle>
            <CardDescription>
              Review and adjust gate enforcement types. Hard gates block progression; soft gates warn but allow override with justification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {([1, 2, 3, 4, 5] as const).map((gateNum) => {
              const isMsdGate = gateNum === 4 && state.msd_required
              return (
                <div key={gateNum} className="p-4 rounded-lg border">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">Gate {gateNum}:</span>
                        <span className="text-sm">{GATE_NAMES[gateNum]}</span>
                        {isMsdGate && (
                          <Badge className="bg-red-100 text-red-700 text-xs">
                            <Lock className="h-3 w-3 mr-1" />
                            MSD Hard Gate
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Between Stage {gateNum} and Stage {gateNum + 1}
                      </p>
                    </div>

                    <Select
                      value={state.gate_enforcement[gateNum]}
                      onValueChange={(v) =>
                        setState((p) => ({
                          ...p,
                          gate_enforcement: { ...p.gate_enforcement, [gateNum]: v as 'soft' | 'hard' },
                        }))
                      }
                      disabled={isMsdGate}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="soft">Soft gate</SelectItem>
                        <SelectItem value="hard">Hard gate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {state.gate_enforcement[gateNum] === 'hard' && !isMsdGate && (
                    <p className="text-xs text-amber-700 mt-2">
                      ⚠ Hard gate: progression to Stage {gateNum + 1} will be blocked until all criteria are met.
                    </p>
                  )}
                </div>
              )
            })}
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
            onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
            disabled={step === 1 && !state.agreement_id}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={createCampaign.isPending || !state.organiser_id || !state.campaign_name}
          >
            {createCampaign.isPending ? 'Creating...' : 'Create Campaign'}
          </Button>
        )}
      </div>
    </div>
  )
}
