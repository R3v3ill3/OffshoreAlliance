'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useWtpCategories, useAddCustomWtpOption, useWorksites, useSectors, useCampaignOrganisingUnits } from '@/lib/hooks/usePlannerOptions'
import { useAddWhereToPlay, useUpdateWhereToPlay, useDeleteWhereToPlay } from '@/lib/hooks/useStagePlan'
import { OptionSelector, type SelectableOption } from './OptionSelector'
import { WhereToPlayLandingDialog } from './WhereToPlayLandingDialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'
import {
  ChevronDown,
  ChevronUp,
  Compass,
  X,
  Ban,
  Link2,
  Target,
} from 'lucide-react'
import { toast } from 'sonner'
import type { PlanAmbition, PlanWhereToPlay } from '@/types/planner-types'

type WhereToPlayRow = PlanWhereToPlay & {
  wtp_categories?: { category_name: string } | null
  wtp_options?: { option_text: string } | null
  /** Phase 8 column — guarded as optional until db-types is regenerated. */
  linked_ambition_id?: number | null
}

interface WhereToPlayPanelProps {
  planId: number
  stageNumber: number
  campaignId: number
  agreementId?: number
  whereToPlay: WhereToPlayRow[]
  /**
   * Phase 8: stage ambitions surfaced in the landing dialog and the per-row
   * "Linked ambition" picker so each W2P choice can point at the ambition it
   * serves.
   */
  ambitions?: Array<
    PlanAmbition & {
      ambition_options?: { option_text?: string } | null
    }
  >
}

/**
 * Phase 8: split the WTP categories into two presentation groups so
 * "who/where" decisions stay separate from "how-to-engage" decisions in the
 * panel UI. Pure presentational mapping — the categories themselves don't
 * carry a group column.
 */
function wtpCategoryGroup(categoryName: string): 'focus' | 'approach' {
  const n = categoryName.toLowerCase()
  if (
    n.includes('contact') ||
    n.includes('worksite') ||
    n.includes('geographic') ||
    n.includes('employer') ||
    n.includes('sector') ||
    n.includes('work group') ||
    n.includes('organising unit')
  ) {
    return 'focus'
  }
  return 'approach'
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
  ambitions = [],
}: WhereToPlayPanelProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [landingOpen, setLandingOpen] = useState(false)
  /** When the landing dialog routes the user to a category, optionally
      pre-link the next add to a stage ambition. Cleared after the next add. */
  const pendingAmbitionForCategory = useRef<Map<number, number>>(new Map())

  const { data: categories } = useWtpCategories(stageNumber)
  const { data: worksites } = useWorksites(agreementId)
  const { data: sectors } = useSectors()
  const { data: campaignOUs } = useCampaignOrganisingUnits(campaignId)
  const addWtp = useAddWhereToPlay()
  const updateWtp = useUpdateWhereToPlay()
  const deleteWtp = useDeleteWhereToPlay()
  const addCustomOption = useAddCustomWtpOption()

  // Phase 8: open the landing dialog automatically the first time this panel
  // renders for a stage that has ambitions but no W2P rows yet — that's the
  // moment the prompt is most useful. After dismissal the user can re-open
  // it with the toolbar button. The auto-open is gated by a ref so the
  // setState fires at most once per mount.
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (autoOpenedRef.current) return
    if (ambitions.length > 0 && whereToPlay.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLandingOpen(true)
      autoOpenedRef.current = true
    }
  }, [ambitions.length, whereToPlay.length])

  const ambitionsAlreadyLinked = useMemo(() => {
    const ids = new Set<number>()
    for (const w of whereToPlay) {
      if (w.linked_ambition_id != null) ids.add(w.linked_ambition_id)
    }
    return ids
  }, [whereToPlay])

  const groupedCategories = useMemo(() => {
    return (categories || []).map((c) => ({
      category_id: c.category_id,
      category_name: c.category_name,
      description: c.description,
      group: wtpCategoryGroup(c.category_name) as 'focus' | 'approach',
    }))
  }, [categories])

  function ambitionLabel(a: {
    ambition_id: number
    custom_text?: string | null
    ambition_options?: { option_text?: string } | null
  }): string {
    const t =
      a.ambition_options?.option_text ||
      a.custom_text ||
      `Ambition #${a.ambition_id}`
    return t.length > 60 ? t.slice(0, 60) + '…' : t
  }

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
          id: -(s.sector_id + 10000),
          text: s.sector_name,
          description: 'Work group / sector',
          use_count: 0,
        })
      })
    }

    if (catName.includes('organising unit')) {
      campaignOUs?.forEach((ou) => {
        const desc = [
          ou.ou_type.replace(/_/g, ' '),
          ou.total_workers_estimated != null ? `est. ${ou.total_workers_estimated} workers` : null,
          ou.commonality_logic,
        ].filter(Boolean).join(' · ')
        dynamicOptions.push({
          id: -(ou.ou_id + 20000),
          text: ou.name,
          description: desc || 'Organising unit',
          use_count: 0,
        })
      })
    }

    return [...baseOptions, ...dynamicOptions]
  }

  async function handleSelect(categoryId: number, option: SelectableOption) {
    const pendingAmbitionId = pendingAmbitionForCategory.current.get(categoryId)
    try {
      await addWtp.mutateAsync({
        plan_id: planId,
        wtp_category_id: categoryId,
        wtp_option_id: option.id > 0 ? option.id : undefined,
        custom_text: option.id < 0 ? option.text : undefined,
        priority: 2,
        is_exclusion: false,
        linked_ambition_id: pendingAmbitionId ?? null,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
      // Consume the pending link — only the first add inherits it.
      pendingAmbitionForCategory.current.delete(categoryId)
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
    const pendingAmbitionId = pendingAmbitionForCategory.current.get(categoryId)
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
        linked_ambition_id: pendingAmbitionId ?? null,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })
      pendingAmbitionForCategory.current.delete(categoryId)
    } catch {
      toast.error('Failed to add custom option')
    }
  }

  async function handleUpdateItem(
    wtpId: number,
    updates: Partial<{
      rationale: string
      is_exclusion: boolean
      priority: number
      linked_ambition_id: number | null
    }>
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Step 2: Where to Play</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose activities to pursue specific ambitions and define
            assessments. Select focus areas, exclude what isn&apos;t worth the
            effort, and link each choice back to the stage ambition it serves.
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
        {ambitions.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLandingOpen(true)}
            className="self-start"
          >
            <Compass className="h-3.5 w-3.5 mr-1" />
            Pursue an ambition
          </Button>
        )}
      </div>

      <WhereToPlayLandingDialog
        open={landingOpen}
        onOpenChange={setLandingOpen}
        ambitions={ambitions.map((a) => ({
          ambition_id: a.ambition_id,
          is_achieved: a.is_achieved ?? null,
          custom_text: a.custom_text ?? null,
          ambition_options: a.ambition_options ?? null,
        }))}
        categories={groupedCategories}
        ambitionsAlreadyLinked={ambitionsAlreadyLinked}
        onJumpToCategory={(categoryId, ambitionId) => {
          if (ambitionId != null) {
            pendingAmbitionForCategory.current.set(categoryId, ambitionId)
          }
          setExpandedCategories((prev) => new Set(prev).add(categoryId))
          setLandingOpen(false)
          // Scroll the user toward the expanded category. This is best-effort —
          // we use a transient frame so the DOM has time to expand.
          requestAnimationFrame(() => {
            const el = document.getElementById(`wtp-category-${categoryId}`)
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          })
        }}
      />

      {/* Category accordions, grouped Focus / Approach */}
      {(['focus', 'approach'] as const).map((group) => {
        const groupCats = groupedCategories.filter((c) => c.group === group)
        if (groupCats.length === 0) return null
        const sourceCategoryRows = (categories || []).filter((c) =>
          groupCats.some((g) => g.category_id === c.category_id)
        )
        return (
          <div key={group} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {group === 'focus' ? 'Focus — who and where' : 'Approach — how to engage'}
            </p>
            <div className="space-y-3">
              {sourceCategoryRows.map((category) => {
          const isExpanded = expandedCategories.has(category.category_id)
          const options = getWtpOptionsForCategory(category)
          const categorySelections = whereToPlay.filter((w) => w.wtp_category_id === category.category_id)
          const selectedOptionIds = categorySelections.map((w) => w.wtp_option_id).filter(Boolean) as number[]

          return (
            <Card
              key={category.category_id}
              id={`wtp-category-${category.category_id}`}
              className={cn(categorySelections.length > 0 && 'border-blue-200')}
            >
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

                            {ambitions.length > 0 && (
                              <div className="mt-2 flex items-center gap-2">
                                <Link2 className="h-3 w-3 text-muted-foreground" />
                                <Label className="text-[11px] text-muted-foreground whitespace-nowrap">
                                  Pursues
                                </Label>
                                <Select
                                  value={
                                    item.linked_ambition_id != null
                                      ? String(item.linked_ambition_id)
                                      : '__none__'
                                  }
                                  onValueChange={(v) =>
                                    handleUpdateItem(item.wtp_id, {
                                      linked_ambition_id:
                                        v === '__none__' ? null : Number(v),
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-7 flex-1 min-w-[180px] text-[11px]">
                                    <SelectValue placeholder="Not linked" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__" className="text-xs">
                                      Not linked to an ambition
                                    </SelectItem>
                                    {ambitions.map((a) => (
                                      <SelectItem
                                        key={a.ambition_id}
                                        value={String(a.ambition_id)}
                                        className="text-xs"
                                      >
                                        {ambitionLabel(a)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
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
          </div>
        )
      })}

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
