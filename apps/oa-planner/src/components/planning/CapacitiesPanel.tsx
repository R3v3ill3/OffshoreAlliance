'use client'

import { useState, useMemo } from 'react'
import { useCapacityOptions, useOrganisers } from '@/lib/hooks/useOptions'
import { useAddCapacity, useUpdateCapacity } from '@/lib/hooks/useStagePlan'
import { OptionSelector, type SelectableOption } from './OptionSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CheckCircle, AlertTriangle, Clock, HelpCircle, Zap, Plus } from 'lucide-react'
import { formatCategoryLabel } from '@/lib/utils/option-sorting'
import type { PlanCapacity, PlanWhereToPlay, CapacityStatus } from '@/types'
import { toast } from 'sonner'

interface CapacitiesPanelProps {
  planId: number
  stageNumber: number
  campaignId: number
  capacities: (PlanCapacity & {
    capacity_options?: { option_text: string; category: string; linked_wtp_categories?: number[] | null } | null
    organisers?: { organiser_name: string } | null
  })[]
  whereToPlay: (PlanWhereToPlay & { wtp_categories?: { category_id: number; category_name: string } | null })[]
}

const STATUS_CONFIG: Record<CapacityStatus, { label: string; icon: React.ReactNode; color: string; badge: string }> = {
  available: {
    label: 'Available',
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'bg-green-50 border-green-200',
    badge: 'bg-green-100 text-green-700',
  },
  gap: {
    label: 'Gap',
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'bg-red-50 border-red-200',
    badge: 'bg-red-100 text-red-700',
  },
  in_progress: {
    label: 'In Progress',
    icon: <Clock className="h-4 w-4" />,
    color: 'bg-amber-50 border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
  },
  needed: {
    label: 'Needed',
    icon: <HelpCircle className="h-4 w-4" />,
    color: 'bg-slate-50 border-slate-200',
    badge: 'bg-slate-100 text-slate-700',
  },
}

export function CapacitiesPanel({
  planId,
  stageNumber,
  campaignId,
  capacities,
  whereToPlay,
}: CapacitiesPanelProps) {
  const [showSelector, setShowSelector] = useState(false)
  const [expandedCapacity, setExpandedCapacity] = useState<number | null>(null)

  const { data: options } = useCapacityOptions(stageNumber)
  const { data: organisers } = useOrganisers()
  const addCapacity = useAddCapacity()
  const updateCapacity = useUpdateCapacity()

  // Get WTP category IDs selected by the organiser
  const selectedWtpCategoryIds = useMemo(
    () => whereToPlay.map((w) => w.wtp_category_id),
    [whereToPlay]
  )

  // Auto-suggest capacities based on WTP selections
  const suggestedOptions = useMemo(() => {
    if (!options) return []
    return options.filter((o) => {
      if (!o.linked_wtp_categories || o.linked_wtp_categories.length === 0) return true
      return o.linked_wtp_categories.some((catId) => selectedWtpCategoryIds.includes(catId))
    })
  }, [options, selectedWtpCategoryIds])

  const selectedOptionIds = capacities.map((c) => c.capacity_option_id).filter(Boolean) as number[]

  const selectableOptions: SelectableOption[] = (suggestedOptions || options || []).map((o) => ({
    id: o.option_id,
    text: o.option_text,
    description: formatCategoryLabel(o.category),
    category: o.category,
    use_count: o.use_count,
  }))

  async function handleSelect(option: SelectableOption) {
    try {
      await addCapacity.mutateAsync({
        plan_id: planId,
        capacity_option_id: option.id,
        status: 'needed',
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to add capacity')
    }
  }

  async function handleDeselect(_optionId: number) {
    toast('Use the remove button on the capacity card')
  }

  async function handleAddCustom(text: string) {
    try {
      await addCapacity.mutateAsync({
        plan_id: planId,
        custom_text: text,
        status: 'needed',
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to add capacity')
    }
  }

  async function handleStatusChange(capacityId: number, status: CapacityStatus) {
    try {
      await updateCapacity.mutateAsync({
        capacity_id: capacityId,
        status,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to update status')
    }
  }

  async function handleUpdateGap(
    capacityId: number,
    field: 'gap_description' | 'resolution_plan' | 'resolution_date' | 'assigned_to',
    value: string | number
  ) {
    try {
      await updateCapacity.mutateAsync({
        capacity_id: capacityId,
        [field]: value || null,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to update')
    }
  }

  const gapCount = capacities.filter((c) => c.status === 'gap').length
  const availableCount = capacities.filter((c) => c.status === 'available').length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Step 4: Capacities & Resources</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Identify what&apos;s needed to execute your Where to Play choices. Auto-suggestions based on your selections.
          </p>
          {capacities.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Badge className="bg-green-100 text-green-700" variant="secondary">
                {availableCount} available
              </Badge>
              {gapCount > 0 && (
                <Badge className="bg-red-100 text-red-700" variant="secondary">
                  {gapCount} gap{gapCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSelector(!showSelector)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Resource
        </Button>
      </div>

      {/* Auto-suggestion banner */}
      {whereToPlay.length > 0 && capacities.length === 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
          <Zap className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Auto-suggestions available</p>
            <p className="text-xs mt-0.5">
              Based on your Where to Play selections, we&apos;ve pre-filtered the most relevant resources.
              Click &quot;Add Resource&quot; to see suggestions.
            </p>
          </div>
        </div>
      )}

      {/* Option selector */}
      {showSelector && (
        <Card>
          <CardContent className="pt-4">
            <OptionSelector
              options={selectableOptions}
              selectedIds={selectedOptionIds}
              onSelect={handleSelect}
              onDeselect={handleDeselect}
              onAddCustom={handleAddCustom}
              showCategories
              placeholder="Search resources..."
              maxHeight="280px"
            />
            <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setShowSelector(false)}>
              Done
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Capacity cards */}
      {capacities.length === 0 && !showSelector ? (
        <div className="text-center py-12 rounded-lg border-2 border-dashed border-slate-200">
          <CheckCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No resources added yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add the capacities and resources needed to execute this stage</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowSelector(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Resources
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {capacities.map((capacity) => {
            const text = capacity.capacity_options?.option_text || capacity.custom_text || 'Custom resource'
            const category = capacity.capacity_options?.category
            const statusConfig = STATUS_CONFIG[capacity.status as CapacityStatus] || STATUS_CONFIG.needed
            const isExpanded = expandedCapacity === capacity.capacity_id
            const isGap = capacity.status === 'gap'

            return (
              <div
                key={capacity.capacity_id}
                className={cn('rounded-lg border overflow-hidden', statusConfig.color)}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className={cn('flex-shrink-0', isGap ? 'text-red-500' : 'text-slate-500')}>
                    {statusConfig.icon}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{text}</p>
                    {category && (
                      <p className="text-xs text-muted-foreground">{formatCategoryLabel(category)}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Select
                      value={capacity.status}
                      onValueChange={(v) => handleStatusChange(capacity.capacity_id, v as CapacityStatus)}
                    >
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                          <SelectItem key={value} value={value}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {isGap && (
                      <button
                        onClick={() => setExpandedCapacity(isExpanded ? null : capacity.capacity_id)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        {isExpanded ? 'Hide' : 'Details'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Gap details */}
                {isGap && isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-red-200 pt-3">
                    <div className="space-y-1">
                      <Label className="text-xs">What&apos;s missing?</Label>
                      <Textarea
                        defaultValue={capacity.gap_description || ''}
                        onBlur={(e) => handleUpdateGap(capacity.capacity_id, 'gap_description', e.target.value)}
                        placeholder="Describe what specific capability or resource is missing..."
                        rows={2}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Resolution Plan</Label>
                      <Textarea
                        defaultValue={capacity.resolution_plan || ''}
                        onBlur={(e) => handleUpdateGap(capacity.capacity_id, 'resolution_plan', e.target.value)}
                        placeholder="How will this gap be closed?"
                        rows={2}
                        className="text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Target Resolution Date</Label>
                        <Input
                          type="date"
                          defaultValue={capacity.resolution_date || ''}
                          onBlur={(e) => handleUpdateGap(capacity.capacity_id, 'resolution_date', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Assigned To</Label>
                        <Select
                          value={capacity.assigned_to?.toString() || ''}
                          onValueChange={(v) => handleUpdateGap(capacity.capacity_id, 'assigned_to', parseInt(v))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Assign..." />
                          </SelectTrigger>
                          <SelectContent>
                            {organisers?.map((o) => (
                              <SelectItem key={o.organiser_id} value={o.organiser_id.toString()}>
                                {o.organiser_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
