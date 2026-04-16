'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCallOutcomeDefinitions, useSaveCallOutcomes } from '@/lib/hooks/useCallOutcomes'
import { useAddAmbition } from '@/lib/hooks/useStagePlan'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Target, Plus, Loader2, CheckCircle, Trash2, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import type { OutcomeCategory } from '@/types/planner-types'

interface AmbitionRow {
  ambition_id: number
  plan_id: number
  custom_text: string | null
  target_value: string | null
  target_unit: string | null
  metric_type: string | null
  is_achieved: boolean
  ambition_option: { option_text: string; category: string } | null
}

interface OutcomeRow {
  tempKey: string
  name: string
  description: string
  outcome_category: OutcomeCategory
  is_positive: boolean
  maps_to_ambition_id: number | null
  ambitionLabel: string | null
  addAsAmbition: boolean
}

interface CallOutcomeEditorProps {
  campaignId: number
  scriptId: number
  scriptTitle?: string
  onSaved?: () => void
}

function getAmbitionLabel(a: AmbitionRow): string {
  if (a.ambition_option?.option_text) {
    let text = a.ambition_option.option_text
    if (a.target_value && text.includes('{target_value}')) {
      text = text.replace('{target_value}', a.target_value)
    }
    if (a.target_unit) text += ` ${a.target_unit}`
    return text
  }
  return a.custom_text || `Ambition #${a.ambition_id}`
}

export function CallOutcomeEditor({
  campaignId,
  scriptId,
  scriptTitle,
  onSaved,
}: CallOutcomeEditorProps) {
  const supabase = createClient()

  const { data: existingOutcomes = [], isLoading: outcomesLoading } = useCallOutcomeDefinitions(scriptId)
  const saveMutation = useSaveCallOutcomes(campaignId, scriptId)
  const addAmbition = useAddAmbition()

  const { data: activeStagePlan } = useQuery({
    queryKey: ['active-stage-plan-for-outcomes', campaignId],
    queryFn: async () => {
      const { data: plans, error } = await supabase
        .from('campaign_stage_plans')
        .select('plan_id, stage_number, status')
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .limit(1)

      if (error) throw error
      return plans?.[0] ?? null
    },
    enabled: !!campaignId,
  })

  const { data: ambitions = [], isLoading: ambitionsLoading } = useQuery({
    queryKey: ['ambitions-for-outcomes', activeStagePlan?.plan_id],
    queryFn: async () => {
      if (!activeStagePlan) return []
      const { data, error } = await supabase
        .from('plan_ambitions')
        .select('ambition_id, plan_id, custom_text, target_value, target_unit, metric_type, is_achieved, ambition_option:ambition_options(option_text, category)')
        .eq('plan_id', activeStagePlan.plan_id)
        .order('sort_order')

      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => {
        const opt = r.ambition_option as { option_text: string; category: string } | { option_text: string; category: string }[] | null
        return {
          ...r,
          ambition_option: Array.isArray(opt) ? opt[0] ?? null : opt,
        } as AmbitionRow
      })
    },
    enabled: !!activeStagePlan?.plan_id,
  })

  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([])
  const [initialized, setInitialized] = useState(false)

  // Initialize from existing outcomes + ambitions
  useEffect(() => {
    if (initialized) return
    if (outcomesLoading || ambitionsLoading) return

    const rows: OutcomeRow[] = []

    if (existingOutcomes.length > 0) {
      for (const eo of existingOutcomes) {
        const ambition = eo.maps_to_ambition_id
          ? ambitions.find((a) => a.ambition_id === eo.maps_to_ambition_id)
          : null
        rows.push({
          tempKey: `existing-${eo.outcome_id}`,
          name: eo.name,
          description: eo.description || '',
          outcome_category: eo.outcome_category,
          is_positive: eo.is_positive,
          maps_to_ambition_id: eo.maps_to_ambition_id,
          ambitionLabel: ambition ? getAmbitionLabel(ambition) : null,
          addAsAmbition: false,
        })
      }
    } else {
      for (const a of ambitions) {
        if (a.is_achieved) continue
        const label = getAmbitionLabel(a)
        rows.push({
          tempKey: `ambition-${a.ambition_id}`,
          name: suggestOutcomeName(label),
          description: '',
          outcome_category: 'conversation',
          is_positive: true,
          maps_to_ambition_id: a.ambition_id,
          ambitionLabel: label,
          addAsAmbition: false,
        })
      }
    }

    setOutcomes(rows)
    setInitialized(true)
  }, [existingOutcomes, ambitions, outcomesLoading, ambitionsLoading, initialized])

  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!initialized || outcomes.length === 0) return
    if (enabledKeys.size > 0) return
    setEnabledKeys(new Set(outcomes.map((o) => o.tempKey)))
  }, [initialized, outcomes, enabledKeys.size])

  function suggestOutcomeName(ambitionLabel: string): string {
    const lower = ambitionLabel.toLowerCase()
    if (lower.includes('member') && lower.includes('density')) return 'Worker agrees to join'
    if (lower.includes('member')) return 'Worker agrees to join/renew membership'
    if (lower.includes('delegate')) return 'Worker volunteers as delegate'
    if (lower.includes('hsr') || lower.includes('health')) return 'Worker volunteers as HSR'
    if (lower.includes('bargain') && lower.includes('rep')) return 'Worker volunteers as bargaining rep'
    if (lower.includes('survey')) return 'Completed survey questions'
    if (lower.includes('attend') || lower.includes('meeting')) return 'Confirms attendance at meeting'
    if (lower.includes('action') || lower.includes('mobilis')) return 'Commits to action/mobilisation'
    return `Worker confirms: ${ambitionLabel.slice(0, 60)}`
  }

  function handleAddCustom() {
    const key = `custom-${Date.now()}`
    setOutcomes((prev) => [...prev, {
      tempKey: key,
      name: '',
      description: '',
      outcome_category: 'conversation' as OutcomeCategory,
      is_positive: false,
      maps_to_ambition_id: null,
      ambitionLabel: null,
      addAsAmbition: false,
    }])
    setEnabledKeys((prev) => new Set([...prev, key]))
  }

  function handleRemove(key: string) {
    setOutcomes((prev) => prev.filter((o) => o.tempKey !== key))
    setEnabledKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  function updateOutcome(key: string, partial: Partial<OutcomeRow>) {
    setOutcomes((prev) => prev.map((o) => o.tempKey === key ? { ...o, ...partial } : o))
  }

  async function handleSave() {
    const enabled = outcomes.filter((o) => enabledKeys.has(o.tempKey) && o.name.trim())

    // Create new ambitions for custom outcomes marked "addAsAmbition"
    for (const o of enabled) {
      if (o.addAsAmbition && !o.maps_to_ambition_id && activeStagePlan) {
        try {
          const result = await addAmbition.mutateAsync({
            plan_id: activeStagePlan.plan_id,
            custom_text: o.name,
            metric_type: 'count',
          })
          if (result?.ambition_id) {
            updateOutcome(o.tempKey, {
              maps_to_ambition_id: result.ambition_id,
              addAsAmbition: false,
            })
            o.maps_to_ambition_id = result.ambition_id
          }
        } catch {
          toast.error(`Failed to create ambition for "${o.name}"`)
        }
      }
    }

    try {
      await saveMutation.mutateAsync({
        outcomes: enabled.map((o, i) => ({
          name: o.name,
          description: o.description || null,
          outcome_category: o.outcome_category,
          maps_to_ambition_id: o.maps_to_ambition_id,
          is_positive: o.is_positive,
          sort_order: i,
        })),
        scriptTitle,
      })
      toast.success('Call outcomes saved')
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save outcomes')
    }
  }

  if (outcomesLoading || ambitionsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-500" />
          Call Outcomes
          {existingOutcomes.length > 0 && (
            <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">
              {existingOutcomes.length} configured
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Define what the caller should record during each call. Outcomes linked to campaign ambitions feed into the assessment system.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ambition-linked outcomes */}
        {outcomes.filter((o) => o.maps_to_ambition_id != null).length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From campaign ambitions{activeStagePlan ? ` (Stage ${activeStagePlan.stage_number})` : ''}</Label>
            <div className="space-y-2">
              {outcomes.filter((o) => o.maps_to_ambition_id != null).map((outcome) => (
                <div key={outcome.tempKey} className="flex items-start gap-2 p-2.5 rounded-lg border bg-muted/10">
                  <Checkbox
                    checked={enabledKeys.has(outcome.tempKey)}
                    onCheckedChange={(checked) => {
                      setEnabledKeys((prev) => {
                        const n = new Set(prev)
                        if (checked) n.add(outcome.tempKey)
                        else n.delete(outcome.tempKey)
                        return n
                      })
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      <Sparkles className="inline h-3 w-3 mr-0.5" />
                      {outcome.ambitionLabel}
                    </p>
                    <Input
                      value={outcome.name}
                      onChange={(e) => updateOutcome(outcome.tempKey, { name: e.target.value })}
                      placeholder="Outcome name…"
                      className="h-7 text-xs"
                      disabled={!enabledKeys.has(outcome.tempKey)}
                    />
                    <div className="flex items-center gap-2">
                      <Select
                        value={outcome.outcome_category}
                        onValueChange={(v) => updateOutcome(outcome.tempKey, { outcome_category: v as OutcomeCategory })}
                        disabled={!enabledKeys.has(outcome.tempKey)}
                      >
                        <SelectTrigger className="h-6 text-[10px] w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="conversation">Conversation</SelectItem>
                          <SelectItem value="cta">CTA</SelectItem>
                          <SelectItem value="dial">Dial</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <Checkbox
                          checked={outcome.is_positive}
                          onCheckedChange={(v) => updateOutcome(outcome.tempKey, { is_positive: v === true })}
                          disabled={!enabledKeys.has(outcome.tempKey)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-[10px] text-green-700">Positive</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom outcomes */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Custom outcomes</Label>
          <div className="space-y-2">
            {outcomes.filter((o) => o.maps_to_ambition_id == null).map((outcome) => (
              <div key={outcome.tempKey} className="flex items-start gap-2 p-2.5 rounded-lg border">
                <div className="flex-1 space-y-1.5 min-w-0">
                  <Input
                    value={outcome.name}
                    onChange={(e) => updateOutcome(outcome.tempKey, { name: e.target.value })}
                    placeholder="Outcome name…"
                    className="h-7 text-xs"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={outcome.outcome_category}
                      onValueChange={(v) => updateOutcome(outcome.tempKey, { outcome_category: v as OutcomeCategory })}
                    >
                      <SelectTrigger className="h-6 text-[10px] w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conversation">Conversation</SelectItem>
                        <SelectItem value="cta">CTA</SelectItem>
                        <SelectItem value="dial">Dial</SelectItem>
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox
                        checked={outcome.is_positive}
                        onCheckedChange={(v) => updateOutcome(outcome.tempKey, { is_positive: v === true })}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-[10px] text-green-700">Positive</span>
                    </label>
                    {activeStagePlan && (
                      <label className="flex items-center gap-1 cursor-pointer">
                        <Checkbox
                          checked={outcome.addAsAmbition}
                          onCheckedChange={(v) => updateOutcome(outcome.tempKey, { addAsAmbition: v === true })}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-[10px] text-blue-700">Add as ambition</span>
                      </label>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleRemove(outcome.tempKey)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="text-xs mt-2" onClick={handleAddCustom}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Custom Outcome
          </Button>
        </div>

        {/* Save */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={() => void handleSave()}
            disabled={saveMutation.isPending || enabledKeys.size === 0}
          >
            {saveMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving…</>
            ) : (
              <><CheckCircle className="h-4 w-4 mr-1" />Save Outcomes</>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            {enabledKeys.size} outcome{enabledKeys.size !== 1 ? 's' : ''} enabled
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
