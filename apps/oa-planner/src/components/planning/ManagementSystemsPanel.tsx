'use client'

import { useState } from 'react'
import { useManagementSystemOptions, useOrganisers } from '@/lib/hooks/useOptions'
import { useAddManagementSystem } from '@/lib/hooks/useStagePlan'
import { OptionSelector, type SelectableOption } from './OptionSelector'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CalendarDays, Plus } from 'lucide-react'
import { formatCategoryLabel } from '@/lib/utils/option-sorting'
import type { PlanManagementSystem, FrequencyType } from '@/types'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'

const FREQUENCY_LABELS: Record<FrequencyType, { label: string; color: string }> = {
  daily: { label: 'Daily', color: 'bg-red-100 text-red-700' },
  weekly: { label: 'Weekly', color: 'bg-blue-100 text-blue-700' },
  fortnightly: { label: 'Fortnightly', color: 'bg-purple-100 text-purple-700' },
  monthly: { label: 'Monthly', color: 'bg-green-100 text-green-700' },
  as_needed: { label: 'As needed', color: 'bg-slate-100 text-slate-600' },
}

interface ManagementSystemsPanelProps {
  planId: number
  stageNumber: number
  campaignId: number
  managementSystems: (PlanManagementSystem & {
    management_system_options?: { option_text: string; category: string; default_frequency: string | null } | null
    organisers?: { organiser_name: string } | null
  })[]
}

export function ManagementSystemsPanel({
  planId,
  stageNumber,
  campaignId,
  managementSystems,
}: ManagementSystemsPanelProps) {
  const [showSelector, setShowSelector] = useState(false)
  const { data: options } = useManagementSystemOptions(stageNumber)
  const { data: organisers } = useOrganisers()
  const addSystem = useAddManagementSystem()
  const queryClient = useQueryClient()
  const supabase = createClient()

  const selectedOptionIds = managementSystems.map((s) => s.system_option_id).filter(Boolean) as number[]

  const selectableOptions: SelectableOption[] = (options || []).map((o) => ({
    id: o.option_id,
    text: o.option_text,
    description: formatCategoryLabel(o.category),
    category: o.category,
    use_count: o.use_count,
  }))

  async function handleSelect(option: SelectableOption) {
    const fullOption = options?.find((o) => o.option_id === option.id)
    try {
      await addSystem.mutateAsync({
        plan_id: planId,
        system_option_id: option.id,
        frequency: fullOption?.default_frequency || 'weekly',
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to add management system')
    }
  }

  async function handleAddCustom(text: string) {
    try {
      await addSystem.mutateAsync({
        plan_id: planId,
        custom_text: text,
        frequency: 'weekly',
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to add system')
    }
  }

  async function handleUpdateSystem(
    systemId: number,
    updates: { frequency?: string; responsible_organiser_id?: number }
  ) {
    await supabase
      .from('plan_management_systems')
      .update(updates)
      .eq('system_id', systemId)

    queryClient.invalidateQueries({ queryKey: ['stage-plan', campaignId, stageNumber] })
  }

  // Group by category for summary view
  const grouped = managementSystems.reduce<Record<string, typeof managementSystems>>((acc, s) => {
    const cat = s.management_system_options?.category || 'custom'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Step 5: Management Systems</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Define the planning rhythms, reporting tools, and accountability structures for this stage.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSelector(!showSelector)}>
          <Plus className="h-4 w-4 mr-1" />
          Add System
        </Button>
      </div>

      {showSelector && (
        <Card>
          <CardContent className="pt-4">
            <OptionSelector
              options={selectableOptions}
              selectedIds={selectedOptionIds}
              onSelect={handleSelect}
              onDeselect={() => {}}
              onAddCustom={handleAddCustom}
              showCategories
              placeholder="Search management systems..."
              maxHeight="280px"
            />
            <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setShowSelector(false)}>
              Done
            </Button>
          </CardContent>
        </Card>
      )}

      {managementSystems.length === 0 && !showSelector ? (
        <div className="text-center py-12 rounded-lg border-2 border-dashed border-slate-200">
          <CalendarDays className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No management systems set yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add meeting rhythms, reporting tools and accountability structures</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowSelector(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Systems
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {formatCategoryLabel(category)}
              </h4>
              <div className="space-y-2">
                {items.map((system) => {
                  const text = system.management_system_options?.option_text || system.custom_text || 'Custom'
                  return (
                    <div key={system.system_id} className="flex items-center gap-3 p-3 rounded-lg border bg-white">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{text}</p>
                        {system.organisers && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Responsible: {system.organisers.organiser_name}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Select
                          value={system.frequency || 'weekly'}
                          onValueChange={(v) => handleUpdateSystem(system.system_id, { frequency: v })}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(FREQUENCY_LABELS).map(([value, config]) => (
                              <SelectItem key={value} value={value}>
                                {config.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={system.responsible_organiser_id?.toString() || ''}
                          onValueChange={(v) => handleUpdateSystem(system.system_id, { responsible_organiser_id: parseInt(v) })}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
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
                  )
                })}
              </div>
            </div>
          ))}

          {/* Summary calendar view */}
          <Card>
            <CardContent className="pt-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Commitment Summary
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(FREQUENCY_LABELS).map(([freq, config]) => {
                  const count = managementSystems.filter((s) => s.frequency === freq).length
                  if (count === 0) return null
                  return (
                    <div key={freq} className={cn('p-2 rounded-lg text-center text-xs', config.color)}>
                      <p className="font-bold text-lg">{count}</p>
                      <p className="font-medium">{config.label}</p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
