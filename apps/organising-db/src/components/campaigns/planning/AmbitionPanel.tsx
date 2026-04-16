'use client'

import { useState, useCallback, useRef } from 'react'
import { useAmbitionOptions } from '@/lib/hooks/usePlannerOptions'
import { useAddAmbition, useUpdateAmbition, useDeleteAmbition } from '@/lib/hooks/useStagePlan'
import { useCampaignCurrentStats, type CampaignCurrentStats } from '@/lib/hooks/useCampaignCurrentStats'
import { CurrentSituationBanner } from './CurrentSituationBanner'
import { OptionSelector, type SelectableOption } from './OptionSelector'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils/cn'
import { format, parseISO, isValid } from 'date-fns'
import { Trash2, Plus, CheckCircle, Calendar, Link2 } from 'lucide-react'
import { formatCategoryLabel } from '@/lib/utils/option-sorting'
import { isAmbitionMetricIncomplete } from '@/lib/planning/ambition-metric-status'
import type { PlanAmbition, AmbitionScope } from '@/types/planner-types'
import { toast } from 'sonner'

type AmbitionRow = PlanAmbition & {
  ambition_options?: {
    option_text: string
    category: string
    has_variable: boolean | null
    variable_label: string | null
    variable_type: string | null
    default_scope?: string | null
  } | null
}

/**
 * Infer a sensible default scope for a custom ambition based on its metric.
 * Text / date metrics look like milestone or evidence gates (setup); numeric
 * metrics default to worker_assessable so ratings can roll up.
 */
function defaultScopeForCustomMetric(
  metric: 'count' | 'percentage' | 'range' | 'boolean' | 'text'
): AmbitionScope {
  return metric === 'text' ? 'campaign_setup' : 'worker_assessable'
}

interface AmbitionPanelProps {
  planId: number
  stageNumber: number
  campaignId: number
  /** Stage planned end — default target date for new ambitions */
  plannedEndDate?: string | null
  /** Next stage's planned start — used to block hard gate if ambition target_date exceeds it */
  nextStagePlannedStartDate?: string | null
  ambitions: AmbitionRow[]
}

function mapVariableTypeToMetric(
  variableType: string | null | undefined
): string | undefined {
  if (!variableType) return undefined
  if (variableType === 'number') return 'count'
  if (variableType === 'percentage') return 'percentage'
  if (variableType === 'date') return 'date'
  return undefined
}

/**
 * Returns a contextual "Currently: X" hint for ambitions where current data
 * can inform the target the user is setting.
 */
function currentValueHint(
  ambition: AmbitionRow,
  stats: CampaignCurrentStats
): string | null {
  const category = ambition.ambition_options?.category
  const metric = ambition.metric_type || mapVariableTypeToMetric(ambition.ambition_options?.variable_type)
  const optionText = ambition.ambition_options?.option_text ?? ''

  if (category === 'contact_targets') {
    if (metric === 'count') return `Currently: ${stats.namedWorkers} named workers`
    if (optionText.toLowerCase().includes('phone and email'))
      return `Currently: ${stats.phonePct}% have phone & email`
    if (metric === 'percentage') return `Currently: ${stats.namedPctOfEstimate}% of est. identified`
  }

  if (category === 'membership_growth' || category === 'recruitment') {
    if (metric === 'percentage')
      return `Currently: ${stats.densityOfEstimate}% density (${stats.memberLikeCount} members)`
    if (metric === 'count')
      return `Currently: ${stats.memberLikeCount} members of ${stats.namedWorkers} named`
  }

  if (category === 'leadership' || category === 'structure') {
    const text = optionText.toLowerCase()
    if (category === 'structure' && metric === 'count' && text.includes('organising unit')) {
      return `Currently: ${stats.ouCount} organising units defined`
    }
    if (category === 'structure' && metric === 'percentage' && stats.ouCount > 0) {
      if (text.includes('contact')) {
        return `Currently: ${stats.ousWithContact}/${stats.ouCount} units have a contact (${Math.round((stats.ousWithContact / stats.ouCount) * 100)}%)`
      }
      if (text.includes('activist')) {
        return `Currently: ${stats.ousWithActivist}/${stats.ouCount} units have an activist (${Math.round((stats.ousWithActivist / stats.ouCount) * 100)}%)`
      }
      if (text.includes('delegate')) {
        return `Currently: ${stats.ousWithDelegate}/${stats.ouCount} units have a delegate (${Math.round((stats.ousWithDelegate / stats.ouCount) * 100)}%)`
      }
    }
    if (metric === 'count')
      return `Currently: ${stats.delegates} delegates, ${stats.activists} activists, ${stats.contacts} contacts`
  }

  if (category === 'engagement') {
    if (metric === 'percentage' && stats.namedWorkers > 0)
      return `Universe: ${stats.namedWorkers} named workers`
  }

  if (ambition.is_system_default) {
    if (metric === 'count')
      return `Currently: ${stats.memberLikeCount} members`
    if (metric === 'percentage')
      return `Currently: ${stats.densityOfEstimate}% of est. / ${stats.densityOfNamed}% of named`
  }

  return null
}

export function AmbitionPanel({
  planId,
  stageNumber,
  campaignId,
  plannedEndDate,
  nextStagePlannedStartDate,
  ambitions,
}: AmbitionPanelProps) {
  const stats = useCampaignCurrentStats(campaignId)

  const [customOpen, setCustomOpen] = useState(false)
  const [customStatement, setCustomStatement] = useState('')
  const [customMetric, setCustomMetric] = useState<'count' | 'percentage' | 'range' | 'boolean' | 'text'>('percentage')
  const [customTarget, setCustomTarget] = useState('')
  const [customTargetMax, setCustomTargetMax] = useState('')
  const [customTargetDate, setCustomTargetDate] = useState(plannedEndDate || '')

  const { data: options } = useAmbitionOptions(stageNumber)
  const addAmbition = useAddAmbition()
  const updateAmbition = useUpdateAmbition()
  const deleteAmbition = useDeleteAmbition()

  const defaultTargetDate = plannedEndDate || ''

  const selectedOptionIds = ambitions
    .map((a) => a.ambition_option_id)
    .filter(Boolean) as number[]

  const selectableOptions: SelectableOption[] = (options || []).map((o) => ({
    id: o.option_id,
    text: o.option_text.replace('{target_value}', '___'),
    description: formatCategoryLabel(o.category),
    category: o.category,
    use_count: o.use_count,
    is_system_default: o.is_system_default,
  }))

  const extraSelectedItems = ambitions
    .filter((a) => a.ambition_option_id == null)
    .map((a) => ({
      key: `custom-${a.ambition_id}`,
      text: a.custom_text?.trim() || 'Custom ambition',
      description: a.is_system_default ? 'Custom (required)' : 'Custom',
      onRemove: () => {
        if (a.is_system_default) {
          toast.error('This ambition cannot be removed')
          return
        }
        void deleteAmbition.mutateAsync({
          ambition_id: a.ambition_id,
          campaign_id: campaignId,
          stage_number: stageNumber,
        })
      },
    }))

  async function handleSelect(option: SelectableOption) {
    const fullOption = options?.find((o) => o.option_id === option.id)
    if (!fullOption) return

    const optionScope = (fullOption.default_scope as AmbitionScope | undefined) ?? 'worker_assessable'

    try {
      await addAmbition.mutateAsync({
        plan_id: planId,
        ambition_option_id: option.id,
        target_unit: fullOption.variable_type || undefined,
        metric_type: mapVariableTypeToMetric(fullOption.variable_type),
        target_date: defaultTargetDate || undefined,
        target_date_user_overridden: false,
        sort_order: ambitions.length,
        ambition_scope: optionScope,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to add ambition')
    }
  }

  async function handleDeselect(optionId: number) {
    const ambition = ambitions.find((a) => a.ambition_option_id === optionId)
    if (!ambition || ambition.is_system_default) return

    try {
      await deleteAmbition.mutateAsync({
        ambition_id: ambition.ambition_id,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to remove ambition')
    }
  }

  async function submitCustomAmbition() {
    if (!customStatement.trim()) {
      toast.error('Enter an ambition statement')
      return
    }
    if (customMetric === 'range' && (!customTarget.trim() || !customTargetMax.trim())) {
      toast.error('Enter min and max for a range metric')
      return
    }
    if (customMetric !== 'boolean' && customMetric !== 'range' && !customTarget.trim()) {
      toast.error('Enter a success threshold')
      return
    }

    try {
      await addAmbition.mutateAsync({
        plan_id: planId,
        custom_text: customStatement.trim(),
        metric_type: customMetric,
        target_value:
          customMetric === 'boolean' ? 'true' : customMetric === 'range' ? customTarget.trim() : customTarget.trim(),
        target_value_max: customMetric === 'range' ? customTargetMax.trim() : undefined,
        target_date: customTargetDate || defaultTargetDate || undefined,
        target_date_user_overridden: !!(customTargetDate && customTargetDate !== defaultTargetDate),
        sort_order: ambitions.length,
        ambition_scope: defaultScopeForCustomMetric(customMetric),
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
      setCustomOpen(false)
      setCustomStatement('')
      setCustomTarget('')
      setCustomTargetMax('')
      setCustomTargetDate(defaultTargetDate || '')
      toast.success('Custom ambition added')
    } catch {
      toast.error('Failed to add custom ambition')
    }
  }

  // Auto-link: find the system-default membership count and density ambitions
  const memberCountAmbition = ambitions.find(
    (a) => a.is_system_default && a.metric_type === 'count'
  )
  const memberDensityAmbition = ambitions.find(
    (a) => a.is_system_default && a.metric_type === 'percentage'
  )
  const canAutoLink =
    !!memberCountAmbition &&
    !!memberDensityAmbition &&
    stats.totalWorkerEstimate > 0

  // Track whether the user manually overrode the auto-linked value
  const autoLinkSuppressed = useRef(new Set<number>())

  const patchAmbition = useCallback(
    async (
      ambitionId: number,
      patch: Record<string, string | boolean | null | undefined>
    ) => {
      try {
        await updateAmbition.mutateAsync({
          ambition_id: ambitionId,
          campaign_id: campaignId,
          stage_number: stageNumber,
          ...patch,
        })
      } catch {
        toast.error('Failed to update ambition')
        return
      }

      // Auto-link: when target_value changes on one membership ambition,
      // calculate and update the counterpart
      if (
        canAutoLink &&
        patch.target_value != null &&
        typeof patch.target_value === 'string'
      ) {
        const val = parseFloat(patch.target_value)
        if (isNaN(val)) return

        const est = stats.totalWorkerEstimate
        const current = stats.memberLikeCount

        if (ambitionId === memberCountAmbition!.ambition_id) {
          // Count changed -> update density
          autoLinkSuppressed.current.delete(memberDensityAmbition!.ambition_id)
          const newDensity = Math.round(((current + val) / est) * 1000) / 10
          try {
            await updateAmbition.mutateAsync({
              ambition_id: memberDensityAmbition!.ambition_id,
              campaign_id: campaignId,
              stage_number: stageNumber,
              target_value: String(Math.min(100, Math.max(0, newDensity))),
            })
          } catch { /* non-critical */ }
        } else if (ambitionId === memberDensityAmbition!.ambition_id) {
          // Density changed -> update count
          autoLinkSuppressed.current.delete(memberCountAmbition!.ambition_id)
          const newCount = Math.max(0, Math.round((val / 100) * est - current))
          try {
            await updateAmbition.mutateAsync({
              ambition_id: memberCountAmbition!.ambition_id,
              campaign_id: campaignId,
              stage_number: stageNumber,
              target_value: String(newCount),
            })
          } catch { /* non-critical */ }
        }
      }
    },
    [updateAmbition, campaignId, stageNumber, canAutoLink, memberCountAmbition, memberDensityAmbition, stats]
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-slate-900">Step 1: Ambitions</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Pick from suggested ambitions below, or add your own. Then set targets and dates (defaults to stage end) and
          mark each as a hard or soft gate for progression.
        </p>
      </div>

      <CurrentSituationBanner stats={stats} />

      <Button
        type="button"
        variant="outline"
        className="w-full h-11 border-dashed border-2 text-base font-medium border-slate-300 hover:border-blue-400 hover:bg-blue-50/50"
        onClick={() => setCustomOpen(true)}
      >
        <Plus className="h-5 w-5 mr-2" />
        Custom ambition
      </Button>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom ambition</DialogTitle>
            <DialogDescription>
              How will success be measured? Target date defaults to this stage&apos;s planned end; you can override.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Statement</Label>
              <Input
                value={customStatement}
                onChange={(e) => setCustomStatement(e.target.value)}
                placeholder="e.g. Identify organising units across operations"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Metric</Label>
              <Select value={customMetric} onValueChange={(v) => setCustomMetric(v as typeof customMetric)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="count">Number (count)</SelectItem>
                  <SelectItem value="range">Range (min–max)</SelectItem>
                  <SelectItem value="boolean">Yes / No</SelectItem>
                  <SelectItem value="text">Text / evidence</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {customMetric === 'range' ? (
              <div className="flex gap-2">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Min</Label>
                  <Input value={customTarget} onChange={(e) => setCustomTarget(e.target.value)} />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Max</Label>
                  <Input value={customTargetMax} onChange={(e) => setCustomTargetMax(e.target.value)} />
                </div>
              </div>
            ) : customMetric !== 'boolean' ? (
              <div className="space-y-1">
                <Label className="text-xs">Success threshold</Label>
                <Input
                  value={customTarget}
                  onChange={(e) => setCustomTarget(e.target.value)}
                  placeholder={customMetric === 'percentage' ? 'e.g. 50' : 'Target value'}
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label className="text-xs">Target date</Label>
              <DateInput value={customTargetDate} onChange={setCustomTargetDate} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitCustomAmbition()} disabled={addAmbition.isPending}>
              Add ambition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-4">
          <OptionSelector
            options={selectableOptions}
            selectedIds={selectedOptionIds}
            onSelect={handleSelect}
            onDeselect={handleDeselect}
            extraSelectedItems={extraSelectedItems}
            selectedHeading="Your selections"
            libraryHeading="Suggested ambitions"
            muteLibraryRows
            allowCustom={false}
            showCategories
            placeholder="Search ambitions..."
            maxHeight="300px"
          />
        </CardContent>
      </Card>

      {ambitions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">
          No ambitions on your plan yet — choose from the list above or use <span className="font-medium">Custom ambition</span>.
        </p>
      ) : (
        <div className="space-y-3">
          {ambitions.map((ambition) => {
            const option = ambition.ambition_options
            const optionText = option?.option_text || ambition.custom_text || 'Ambition'
            const hasVariable = option?.has_variable || false
            const variableLabel = option?.variable_label
            const variableType = option?.variable_type
            const rowMetric = ambition.metric_type || mapVariableTypeToMetric(variableType)

            const displayText = hasVariable
              ? optionText.replace('{target_value}', ambition.target_value ? `[${ambition.target_value}]` : '[set target]')
              : optionText

            const showNumericTargets =
              hasVariable ||
              rowMetric === 'count' ||
              rowMetric === 'percentage' ||
              rowMetric === 'range' ||
              rowMetric === 'text'

            const metricIncomplete =
              !ambition.is_achieved && isAmbitionMetricIncomplete(ambition)
            const fromCatalog = ambition.ambition_option_id != null

            return (
              <div
                key={ambition.ambition_id}
                className={cn(
                  'p-4 rounded-lg border',
                  ambition.is_achieved && 'bg-green-50 border-green-200',
                  !ambition.is_achieved &&
                    metricIncomplete &&
                    'border-amber-400 bg-amber-50/60 border-l-4 border-l-amber-500',
                  !ambition.is_achieved &&
                    !metricIncomplete &&
                    fromCatalog &&
                    'bg-blue-50/50 border-slate-200 border-l-4 border-l-blue-200',
                  !ambition.is_achieved &&
                    !metricIncomplete &&
                    !fromCatalog &&
                    'bg-white border-slate-200 border-l-4 border-l-slate-300'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                    <Checkbox
                      checked={ambition.is_achieved ?? false}
                      onCheckedChange={(checked) =>
                        void patchAmbition(ambition.ambition_id, { is_achieved: !!checked })
                      }
                      className="border-slate-300"
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        ambition.is_achieved ? 'line-through text-muted-foreground' : 'text-slate-900'
                      )}
                    >
                      {displayText}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      {option?.category && (
                        <Badge variant="secondary" className="text-xs">
                          {formatCategoryLabel(option.category)}
                        </Badge>
                      )}
                      {!option?.category && ambition.custom_text && (
                        <Badge variant="secondary" className="text-xs">
                          Custom
                        </Badge>
                      )}
                      {ambition.is_system_default && (
                        <Badge variant="outline" className="text-xs">
                          Membership
                        </Badge>
                      )}
                      {ambition.ambition_scope === 'campaign_setup' ? (
                        <Badge variant="outline" className="text-xs border-slate-300 text-slate-600">
                          Setup (not per-worker)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-sky-300 text-sky-700 bg-sky-50">
                          Worker-assessable
                        </Badge>
                      )}
                      {metricIncomplete && (
                        <Badge className="text-xs bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200">
                          Target not set
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Scope:</Label>
                      <Select
                        value={ambition.ambition_scope}
                        onValueChange={(v) =>
                          void patchAmbition(ambition.ambition_id, {
                            ambition_scope: v as AmbitionScope,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-[220px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="worker_assessable">Worker-assessable (rolled up)</SelectItem>
                          <SelectItem value="campaign_setup">Campaign setup (not per-worker)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Gate:</Label>
                      <Select
                        value={ambition.is_hard_gate ? 'hard' : 'soft'}
                        onValueChange={(v) => {
                          if (v === 'hard' && nextStagePlannedStartDate && ambition.target_date) {
                            const targetD = parseISO(ambition.target_date)
                            const nextStart = parseISO(nextStagePlannedStartDate)
                            if (isValid(targetD) && isValid(nextStart) && targetD > nextStart) {
                              toast.error(
                                `Cannot set as hard gate — ambition target date ` +
                                `(${format(targetD, 'dd/MM/yyyy')}) is after Stage ${stageNumber + 1}'s ` +
                                `planned start (${format(nextStart, 'dd/MM/yyyy')}). ` +
                                `Only ambitions completing within this stage can be hard gates.`
                              )
                              return
                            }
                          }
                          void patchAmbition(ambition.ambition_id, { is_hard_gate: v === 'hard' })
                        }}
                      >
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="soft">Soft (override ok)</SelectItem>
                          <SelectItem value="hard">Hard (must meet)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {showNumericTargets && (() => {
                      const hint = currentValueHint(ambition, stats)
                      const isLinkedAmbition =
                        canAutoLink &&
                        (ambition.ambition_id === memberCountAmbition?.ambition_id ||
                         ambition.ambition_id === memberDensityAmbition?.ambition_id)

                      return (
                        <div className="space-y-1">
                          {rowMetric === 'range' ? (
                            <div className="flex gap-2 items-end">
                              <div>
                                <Label className="text-xs text-muted-foreground">Min</Label>
                                <Input
                                  className="h-7 w-20 text-sm"
                                  value={ambition.target_value || ''}
                                  onChange={(e) => void patchAmbition(ambition.ambition_id, { target_value: e.target.value })}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Max</Label>
                                <Input
                                  className="h-7 w-20 text-sm"
                                  value={ambition.target_value_max || ''}
                                  onChange={(e) =>
                                    void patchAmbition(ambition.ambition_id, { target_value_max: e.target.value || null })
                                  }
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                                {variableLabel || (rowMetric === 'percentage' ? 'Target %' : rowMetric === 'count' ? 'Target #' : 'Target')}:
                              </Label>
                              <div className="flex items-center gap-1">
                                <Input
                                  type={variableType === 'date' ? 'date' : 'text'}
                                  value={ambition.target_value || ''}
                                  onChange={(e) =>
                                    void patchAmbition(ambition.ambition_id, { target_value: e.target.value })
                                  }
                                  placeholder={
                                    variableType === 'percentage' || rowMetric === 'percentage'
                                      ? '0-100'
                                      : rowMetric === 'count'
                                        ? '0'
                                        : ''
                                  }
                                  className="w-24 h-7 text-sm"
                                />
                                {(variableType === 'percentage' || rowMetric === 'percentage') && (
                                  <span className="text-xs text-muted-foreground">%</span>
                                )}
                                {isLinkedAmbition && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Link2 className="h-3.5 w-3.5 text-blue-400" />
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="max-w-xs text-xs">
                                        Linked to {ambition.ambition_id === memberCountAmbition?.ambition_id
                                          ? 'density' : 'member count'} ambition.
                                        Editing this target auto-updates the other based on
                                        {' '}{stats.totalWorkerEstimate} estimated workers and
                                        {' '}{stats.memberLikeCount} current members.
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </div>
                          )}
                          {hint && (
                            <p className="text-[11px] text-blue-600/80 pl-0.5">{hint}</p>
                          )}
                        </div>
                      )
                    })()}

                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <Label className="text-xs text-muted-foreground">Target date:</Label>
                      <DateInput
                        value={ambition.target_date || ''}
                        onChange={(iso) =>
                          void patchAmbition(ambition.ambition_id, {
                            target_date: iso || null,
                            target_date_user_overridden: true,
                          })
                        }
                        className="w-36 h-7 text-xs"
                      />
                    </div>

                    {ambition.is_achieved && (
                      <div className="flex items-center gap-1 text-green-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">Achieved</span>
                      </div>
                    )}
                  </div>

                  {!ambition.is_system_default && (
                    <button
                      type="button"
                      onClick={() =>
                        void deleteAmbition.mutateAsync({
                          ambition_id: ambition.ambition_id,
                          campaign_id: campaignId,
                          stage_number: stageNumber,
                        })
                      }
                      className="flex-shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
                      title="Remove ambition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
