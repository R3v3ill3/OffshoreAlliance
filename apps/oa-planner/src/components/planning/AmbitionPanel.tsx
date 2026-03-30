'use client'

import { useState } from 'react'
import { useAmbitionOptions, useAddCustomAmbitionOption } from '@/lib/hooks/useOptions'
import { useAddAmbition, useUpdateAmbition, useDeleteAmbition } from '@/lib/hooks/useStagePlan'
import { OptionSelector, type SelectableOption } from './OptionSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { Target, Trash2, Plus, CheckCircle, Calendar } from 'lucide-react'
import { formatCategoryLabel } from '@/lib/utils/option-sorting'
import type { PlanAmbition } from '@/types'
import { toast } from 'sonner'

interface AmbitionPanelProps {
  planId: number
  stageNumber: number
  campaignId: number
  ambitions: (PlanAmbition & {
    ambition_options?: {
      option_text: string
      category: string
      has_variable: boolean
      variable_label: string | null
      variable_type: string | null
    } | null
  })[]
}

export function AmbitionPanel({ planId, stageNumber, campaignId, ambitions }: AmbitionPanelProps) {
  const [showSelector, setShowSelector] = useState(ambitions.length === 0)

  const { data: options } = useAmbitionOptions(stageNumber)
  const addAmbition = useAddAmbition()
  const updateAmbition = useUpdateAmbition()
  const deleteAmbition = useDeleteAmbition()
  const addCustomOption = useAddCustomAmbitionOption()

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

  async function handleSelect(option: SelectableOption) {
    const fullOption = options?.find((o) => o.option_id === option.id)
    if (!fullOption) return

    try {
      await addAmbition.mutateAsync({
        plan_id: planId,
        ambition_option_id: option.id,
        target_unit: fullOption.variable_type || undefined,
        sort_order: ambitions.length,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to add ambition')
    }
  }

  async function handleDeselect(optionId: number) {
    const ambition = ambitions.find((a) => a.ambition_option_id === optionId)
    if (!ambition) return

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

  async function handleAddCustom(text: string) {
    try {
      const customOption = await addCustomOption.mutateAsync({
        stage_number: stageNumber,
        category: 'custom',
        option_text: text,
        has_variable: false,
      })

      await addAmbition.mutateAsync({
        plan_id: planId,
        ambition_option_id: customOption.option_id,
        sort_order: ambitions.length,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to add custom ambition')
    }
  }

  async function handleUpdateTarget(
    ambitionId: number,
    field: 'target_value' | 'target_date' | 'is_achieved',
    value: string | boolean
  ) {
    try {
      await updateAmbition.mutateAsync({
        ambition_id: ambitionId,
        [field]: value,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to update ambition')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Step 1: Ambitions</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Define measurable success for this stage. Select from common ambitions or add your own.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSelector(!showSelector)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Ambition
        </Button>
      </div>

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
              placeholder="Search ambitions..."
              maxHeight="300px"
            />
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setShowSelector(false)}
            >
              Done selecting
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Selected ambitions */}
      {ambitions.length === 0 && !showSelector ? (
        <div className="text-center py-12 rounded-lg border-2 border-dashed border-slate-200">
          <Target className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No ambitions set yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add ambitions to define what success looks like for this stage</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setShowSelector(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add First Ambition
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {ambitions.map((ambition) => {
            const option = ambition.ambition_options
            const optionText = option?.option_text || ambition.custom_text || 'Custom ambition'
            const hasVariable = option?.has_variable || false
            const variableLabel = option?.variable_label
            const variableType = option?.variable_type

            const displayText = hasVariable
              ? optionText.replace('{target_value}', ambition.target_value ? `[${ambition.target_value}]` : '[set target]')
              : optionText

            return (
              <div
                key={ambition.ambition_id}
                className={cn(
                  'p-4 rounded-lg border',
                  ambition.is_achieved ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                    <Checkbox
                      checked={ambition.is_achieved ?? false}
                      onCheckedChange={(checked) =>
                        handleUpdateTarget(ambition.ambition_id, 'is_achieved', !!checked)
                      }
                      className="border-slate-300"
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <p className={cn(
                      'text-sm font-medium',
                      ambition.is_achieved ? 'line-through text-muted-foreground' : 'text-slate-900'
                    )}>
                      {displayText}
                    </p>

                    {option?.category && (
                      <Badge variant="secondary" className="text-xs">
                        {formatCategoryLabel(option.category)}
                      </Badge>
                    )}

                    {/* Target value input */}
                    {hasVariable && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">
                          {variableLabel || 'Target'}:
                        </Label>
                        <div className="flex items-center gap-1">
                          <Input
                            type={variableType === 'date' ? 'date' : 'text'}
                            value={ambition.target_value || ''}
                            onChange={(e) =>
                              handleUpdateTarget(ambition.ambition_id, 'target_value', e.target.value)
                            }
                            placeholder={variableType === 'percentage' ? '0-100' : variableType === 'number' ? '0' : ''}
                            className="w-24 h-7 text-sm"
                          />
                          {variableType === 'percentage' && (
                            <span className="text-xs text-muted-foreground">%</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Target date */}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <Label className="text-xs text-muted-foreground">Target date:</Label>
                      <Input
                        type="date"
                        value={ambition.target_date || ''}
                        onChange={(e) =>
                          handleUpdateTarget(ambition.ambition_id, 'target_date', e.target.value || '')
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

                  <button
                    onClick={() => handleDeselect(ambition.ambition_option_id || -1) || deleteAmbition.mutate({
                      ambition_id: ambition.ambition_id,
                      campaign_id: campaignId,
                      stage_number: stageNumber,
                    })}
                    className="flex-shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
