'use client'

import { useState } from 'react'
import { useWtpCategories, useAddCustomWtpOption, useWorksites, useSectors } from '@/lib/hooks/useOptions'
import { useAddWhereToPlay, useUpdateWhereToPlay, useDeleteWhereToPlay } from '@/lib/hooks/useStagePlan'
import { OptionSelector, type SelectableOption } from './OptionSelector'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronUp,
  X,
  Ban,
  Target,
} from 'lucide-react'
import { toast } from 'sonner'
import type { PlanWhereToPlay } from '@/types'

interface WhereToPlayPanelProps {
  planId: number
  stageNumber: number
  campaignId: number
  agreementId?: number
  whereToPlay: (PlanWhereToPlay & {
    wtp_categories?: { category_name: string } | null
    wtp_options?: { option_text: string } | null
  })[]
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'High', color: 'bg-red-100 text-red-700' },
  2: { label: 'Medium', color: 'bg-amber-100 text-amber-700' },
  3: { label: 'Low', color: 'bg-green-100 text-green-700' },
}

export function WhereToPlayPanel({
  planId,
  stageNumber,
  campaignId,
  agreementId,
  whereToPlay,
}: WhereToPlayPanelProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data: categories } = useWtpCategories(stageNumber)
  const { data: worksites } = useWorksites(agreementId)
  const { data: sectors } = useSectors()
  const addWtp = useAddWhereToPlay()
  const updateWtp = useUpdateWhereToPlay()
  const deleteWtp = useDeleteWhereToPlay()
  const addCustomOption = useAddCustomWtpOption()

  function toggleCategory(categoryId: number) {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  function getWtpOptionsForCategory(category: NonNullable<typeof categories>[0]): SelectableOption[] {
    const baseOptions = (category.wtp_options as Array<{
      option_id: number
      option_text: string
      description?: string | null
      use_count: number
      is_system_default?: boolean
    }> || []).map((o) => ({
      id: o.option_id,
      text: o.option_text,
      description: o.description,
      use_count: o.use_count,
      is_system_default: o.is_system_default,
    }))

    // Add dynamic options from database for specific categories
    const catName = category.category_name.toLowerCase()
    const dynamicOptions: SelectableOption[] = []

    if (catName.includes('worksite') || catName.includes('geographic')) {
      worksites?.forEach((w) => {
        if (w && 'worksite_id' in w && 'worksite_name' in w) {
          dynamicOptions.push({
            id: -(w.worksite_id as number), // Negative to distinguish from DB option IDs
            text: w.worksite_name as string,
            description: 'worksite_type' in w ? String(w.worksite_type || '') : undefined,
            use_count: 0,
          })
        }
      })
    }

    if (catName.includes('sector') || catName.includes('work group')) {
      sectors?.forEach((s) => {
        dynamicOptions.push({
          id: -(s.sector_id + 10000), // Offset to avoid conflicts
          text: s.sector_name,
          description: 'Work group / sector',
          use_count: 0,
        })
      })
    }

    return [...baseOptions, ...dynamicOptions]
  }

  async function handleSelect(categoryId: number, option: SelectableOption) {
    try {
      await addWtp.mutateAsync({
        plan_id: planId,
        wtp_category_id: categoryId,
        wtp_option_id: option.id > 0 ? option.id : undefined,
        custom_text: option.id < 0 ? option.text : undefined,
        priority: 2,
        is_exclusion: false,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to add where to play choice')
    }
  }

  async function handleDeselect(categoryId: number, wtpOptionId: number) {
    const item = whereToPlay.find(
      (w) => w.wtp_category_id === categoryId && w.wtp_option_id === wtpOptionId
    )
    if (!item) return

    try {
      await deleteWtp.mutateAsync({
        wtp_id: item.wtp_id,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to remove choice')
    }
  }

  async function handleAddCustom(categoryId: number, text: string) {
    try {
      const customOption = await addCustomOption.mutateAsync({
        category_id: categoryId,
        option_text: text,
      })

      await addWtp.mutateAsync({
        plan_id: planId,
        wtp_category_id: categoryId,
        wtp_option_id: customOption.option_id,
        priority: 2,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
    } catch {
      toast.error('Failed to add custom option')
    }
  }

  async function handleUpdateItem(
    wtpId: number,
    updates: Partial<{ rationale: string; is_exclusion: boolean; priority: number }>
  ) {
    try {
      await updateWtp.mutateAsync({
        wtp_id: wtpId,
        campaign_id: campaignId,
        stage_number: stageNumber,
        ...updates,
      })
    } catch {
      toast.error('Failed to update choice')
    }
  }

  const totalSelections = whereToPlay.length
  const exclusions = whereToPlay.filter((w) => w.is_exclusion)
  const inclusions = whereToPlay.filter((w) => !w.is_exclusion)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-slate-900">Step 2: Where to Play</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Choose where to concentrate effort — and where not to. Select options by category.
        </p>
        {totalSelections > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary">{inclusions.length} focus areas</Badge>
            {exclusions.length > 0 && (
              <Badge className="bg-red-100 text-red-700" variant="secondary">
                {exclusions.length} exclusions
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Category accordions */}
      <div className="space-y-3">
        {(categories || []).map((category) => {
          const isExpanded = expandedCategories.has(category.category_id)
          const options = getWtpOptionsForCategory(category)
          const categorySelections = whereToPlay.filter((w) => w.wtp_category_id === category.category_id)
          const selectedOptionIds = categorySelections.map((w) => w.wtp_option_id).filter(Boolean) as number[]

          return (
            <Card key={category.category_id} className={cn(categorySelections.length > 0 && 'border-blue-200')}>
              <button
                className="w-full text-left"
                onClick={() => toggleCategory(category.category_id)}
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-sm font-medium">{category.category_name}</CardTitle>
                      {categorySelections.length > 0 && (
                        <Badge className="bg-blue-100 text-blue-700 text-xs" variant="secondary">
                          {categorySelections.length} selected
                        </Badge>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  {category.description && (
                    <p className="text-xs text-muted-foreground text-left">{category.description}</p>
                  )}
                </CardHeader>
              </button>

              {isExpanded && (
                <CardContent className="px-4 pb-4 pt-0 space-y-4">
                  <OptionSelector
                    options={options}
                    selectedIds={selectedOptionIds}
                    onSelect={(opt) => handleSelect(category.category_id, opt)}
                    onDeselect={(optId) => handleDeselect(category.category_id, optId)}
                    onAddCustom={(text) => handleAddCustom(category.category_id, text)}
                    maxHeight="200px"
                    placeholder={`Search ${category.category_name.toLowerCase()}...`}
                  />

                  {/* Selected items detail */}
                  {categorySelections.length > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Selected choices
                      </p>
                      {categorySelections.map((item) => {
                        const text = item.wtp_options?.option_text || item.custom_text || 'Custom'
                        const isEditing = editingId === item.wtp_id

                        return (
                          <div key={item.wtp_id} className={cn(
                            'p-3 rounded-lg border text-sm',
                            item.is_exclusion ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-100'
                          )}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {item.is_exclusion && <Ban className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                                {!item.is_exclusion && <Target className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
                                <span className="font-medium truncate">{text}</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <Select
                                  value={item.priority?.toString() || '2'}
                                  onValueChange={(v) => handleUpdateItem(item.wtp_id, { priority: parseInt(v) })}
                                >
                                  <SelectTrigger className="h-6 w-20 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[1, 2, 3].map((p) => (
                                      <SelectItem key={p} value={p.toString()}>
                                        {PRIORITY_LABELS[p].label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <button
                                  onClick={() => handleUpdateItem(item.wtp_id, { is_exclusion: !item.is_exclusion })}
                                  className={cn(
                                    'text-xs px-2 py-0.5 rounded border transition-colors',
                                    item.is_exclusion
                                      ? 'border-red-300 bg-red-100 text-red-700'
                                      : 'border-slate-200 text-muted-foreground hover:border-red-300 hover:text-red-600'
                                  )}
                                  title={item.is_exclusion ? 'Mark as inclusion' : 'Mark as exclusion'}
                                >
                                  <Ban className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => setEditingId(isEditing ? null : item.wtp_id)}
                                  className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                  {isEditing ? 'Done' : 'Rationale'}
                                </button>
                                <button
                                  onClick={() => deleteWtp.mutate({
                                    wtp_id: item.wtp_id,
                                    campaign_id: campaignId,
                                    stage_number: stageNumber,
                                  })}
                                  className="text-muted-foreground hover:text-red-500"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {isEditing && (
                              <div className="mt-2">
                                <Label className="text-xs text-muted-foreground">Why this choice?</Label>
                                <Textarea
                                  defaultValue={item.rationale || ''}
                                  onBlur={(e) => handleUpdateItem(item.wtp_id, { rationale: e.target.value })}
                                  placeholder="Explain why this is a priority for this stage..."
                                  rows={2}
                                  className="mt-1 text-xs"
                                />
                              </div>
                            )}

                            {!isEditing && item.rationale && (
                              <p className="text-xs text-muted-foreground mt-1.5 italic">&ldquo;{item.rationale}&rdquo;</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {totalSelections === 0 && (
        <div className="text-center py-8 rounded-lg border-2 border-dashed border-slate-200">
          <Target className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No focus areas selected yet</p>
          <p className="text-xs text-muted-foreground mt-1">Expand a category above to select where to focus effort</p>
        </div>
      )}
    </div>
  )
}
