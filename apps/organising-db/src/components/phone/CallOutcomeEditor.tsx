'use client'

import { useState, useEffect } from 'react'
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
  Target, Plus, Loader2, CheckCircle, Trash2, Sparkles, X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { OutcomeCategory, OutcomeResponseType } from '@/types/planner-types'

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
  response_type: OutcomeResponseType
  response_options: { value: string; label: string }[] | null
  progress_explanation: string
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

const RESPONSE_TYPE_LABELS: Record<OutcomeResponseType, string> = {
  checkbox: 'Checkbox',
  text: 'Text input',
  select: 'Dropdown',
  number: 'Number',
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
  const [isTranslating, setIsTranslating] = useState(false)
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set())
  const [newOptionText, setNewOptionText] = useState<Record<string, string>>({})

  async function translateAmbitionsWithAI(ambitionsToTranslate: AmbitionRow[]): Promise<OutcomeRow[]> {
    setIsTranslating(true)
    try {
      const payload = ambitionsToTranslate.map((a) => ({
        ambition_id: a.ambition_id,
        text: getAmbitionLabel(a),
        metric_type: a.metric_type,
        target_value: a.target_value,
        target_unit: a.target_unit,
        category: a.ambition_option?.category ?? null,
      }))

      const res = await fetch('/api/phone-wizard/translate-ambitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ambitions: payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Translation failed')

      return (data.outcomes || []).map((o: Record<string, unknown>) => {
        const ambition = ambitionsToTranslate.find((a) => a.ambition_id === o.ambition_id)
        return {
          tempKey: `ambition-${o.ambition_id}`,
          name: (o.name as string) || '',
          description: (o.description as string) || '',
          outcome_category: 'conversation' as OutcomeCategory,
          is_positive: o.is_positive === true,
          maps_to_ambition_id: o.ambition_id as number,
          ambitionLabel: ambition ? getAmbitionLabel(ambition) : null,
          addAsAmbition: false,
          response_type: (['checkbox', 'text', 'select', 'number'].includes(o.response_type as string)
            ? o.response_type
            : 'checkbox') as OutcomeResponseType,
          response_options: (o.response_options as { value: string; label: string }[] | null) ?? null,
          progress_explanation: (o.progress_explanation as string) || '',
        }
      })
    } catch (err) {
      console.error('AI translation failed, using fallback:', err)
      return ambitionsToTranslate.map((a) => ({
        tempKey: `ambition-${a.ambition_id}`,
        name: fallbackOutcomeName(getAmbitionLabel(a)),
        description: '',
        outcome_category: 'conversation' as OutcomeCategory,
        is_positive: true,
        maps_to_ambition_id: a.ambition_id,
        ambitionLabel: getAmbitionLabel(a),
        addAsAmbition: false,
        response_type: 'checkbox' as OutcomeResponseType,
        response_options: null,
        progress_explanation: '',
      }))
    } finally {
      setIsTranslating(false)
    }
  }

  function fallbackOutcomeName(label: string): string {
    const lower = label.toLowerCase()
    if (lower.includes('member') && lower.includes('density')) return 'Worker agrees to join'
    if (lower.includes('member')) return 'Worker agrees to join/renew membership'
    if (lower.includes('delegate')) return 'Worker volunteers as delegate'
    if (lower.includes('hsr') || lower.includes('health')) return 'Worker volunteers as HSR'
    if (lower.includes('bargain') && lower.includes('rep')) return 'Worker volunteers as bargaining rep'
    if (lower.includes('survey')) return 'Completed survey questions'
    if (lower.includes('attend') || lower.includes('meeting')) return 'Confirms attendance at meeting'
    if (lower.includes('action') || lower.includes('mobilis')) return 'Commits to action/mobilisation'
    return `Worker confirms: ${label.slice(0, 60)}`
  }

  // Initialize from existing outcomes or translate ambitions with AI
  useEffect(() => {
    if (initialized) return
    if (outcomesLoading || ambitionsLoading) return

    if (existingOutcomes.length > 0) {
      const rows: OutcomeRow[] = existingOutcomes.map((eo) => {
        const ambition = eo.maps_to_ambition_id
          ? ambitions.find((a) => a.ambition_id === eo.maps_to_ambition_id)
          : null
        return {
          tempKey: `existing-${eo.outcome_id}`,
          name: eo.name,
          description: eo.description || '',
          outcome_category: eo.outcome_category,
          is_positive: eo.is_positive,
          maps_to_ambition_id: eo.maps_to_ambition_id,
          ambitionLabel: ambition ? getAmbitionLabel(ambition) : null,
          addAsAmbition: false,
          response_type: eo.response_type || 'checkbox',
          response_options: eo.response_options ?? null,
          progress_explanation: '',
        }
      })
      setOutcomes(rows)
      setEnabledKeys(new Set(rows.map((r) => r.tempKey)))
      setInitialized(true)
    } else if (ambitions.length > 0) {
      const activeAmbitions = ambitions.filter((a) => !a.is_achieved)
      if (activeAmbitions.length > 0) {
        void translateAmbitionsWithAI(activeAmbitions).then((rows) => {
          setOutcomes(rows)
          setEnabledKeys(new Set(rows.map((r) => r.tempKey)))
          setInitialized(true)
        })
      } else {
        setInitialized(true)
      }
    } else {
      setInitialized(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingOutcomes, ambitions, outcomesLoading, ambitionsLoading, initialized])

  function handleAddCustom() {
    const key = `custom-${Date.now()}`
    const row: OutcomeRow = {
      tempKey: key,
      name: '',
      description: '',
      outcome_category: 'conversation',
      is_positive: false,
      maps_to_ambition_id: null,
      ambitionLabel: null,
      addAsAmbition: false,
      response_type: 'checkbox',
      response_options: null,
      progress_explanation: '',
    }
    setOutcomes((prev) => [...prev, row])
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

  function handleAddOption(key: string) {
    const text = (newOptionText[key] || '').trim()
    if (!text) return
    setOutcomes((prev) => prev.map((o) => {
      if (o.tempKey !== key) return o
      const existing = o.response_options || []
      return { ...o, response_options: [...existing, { value: text.toLowerCase().replace(/\s+/g, '_'), label: text }] }
    }))
    setNewOptionText((prev) => ({ ...prev, [key]: '' }))
  }

  function handleRemoveOption(key: string, optionIndex: number) {
    setOutcomes((prev) => prev.map((o) => {
      if (o.tempKey !== key) return o
      const opts = [...(o.response_options || [])]
      opts.splice(optionIndex, 1)
      return { ...o, response_options: opts.length > 0 ? opts : null }
    }))
  }

  async function handleSave() {
    const enabled = outcomes.filter((o) => enabledKeys.has(o.tempKey) && o.name.trim())

    for (const o of enabled) {
      if (o.addAsAmbition && !o.maps_to_ambition_id && activeStagePlan) {
        try {
          const result = await addAmbition.mutateAsync({
            plan_id: activeStagePlan.plan_id,
            campaign_id: campaignId,
            stage_number: activeStagePlan.stage_number,
            custom_text: o.name,
            metric_type: 'count',
          })
          if (result?.ambition_id) {
            updateOutcome(o.tempKey, { maps_to_ambition_id: result.ambition_id, addAsAmbition: false })
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
          response_type: o.response_type,
          response_options: o.response_type === 'select' ? o.response_options : null,
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

  function renderOutcomeCard(outcome: OutcomeRow, isAmbitionLinked: boolean) {
    const enabled = enabledKeys.has(outcome.tempKey)

    return (
      <div key={outcome.tempKey} className={`flex items-start gap-2 p-2.5 rounded-lg border ${isAmbitionLinked ? 'bg-muted/10' : ''}`}>
        {isAmbitionLinked && (
          <Checkbox
            checked={enabled}
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
        )}
        <div className="flex-1 space-y-1.5 min-w-0">
          {isAmbitionLinked && outcome.ambitionLabel && (
            <p className="text-xs text-muted-foreground">
              <Sparkles className="inline h-3 w-3 mr-0.5" />
              {outcome.ambitionLabel}
            </p>
          )}
          <Input
            value={outcome.name}
            onChange={(e) => updateOutcome(outcome.tempKey, { name: e.target.value })}
            placeholder="Outcome name…"
            className="h-7 text-xs"
            disabled={isAmbitionLinked && !enabled}
          />
          {outcome.description && (
            <p className="text-[10px] text-muted-foreground italic">{outcome.description}</p>
          )}
          {outcome.progress_explanation && (
            <p className="text-[10px] text-blue-600">{outcome.progress_explanation}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Response type */}
            <Select
              value={outcome.response_type}
              onValueChange={(v) => updateOutcome(outcome.tempKey, { response_type: v as OutcomeResponseType })}
              disabled={isAmbitionLinked && !enabled}
            >
              <SelectTrigger className="h-6 text-[10px] w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RESPONSE_TYPE_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Category */}
            <Select
              value={outcome.outcome_category}
              onValueChange={(v) => updateOutcome(outcome.tempKey, { outcome_category: v as OutcomeCategory })}
              disabled={isAmbitionLinked && !enabled}
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
                disabled={isAmbitionLinked && !enabled}
                className="h-3.5 w-3.5"
              />
              <span className="text-[10px] text-green-700">Positive</span>
            </label>

            {!isAmbitionLinked && activeStagePlan && (
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

          {/* Select options editor */}
          {outcome.response_type === 'select' && (
            <div className="space-y-1 p-2 rounded border bg-muted/20">
              <Label className="text-[10px]">Dropdown options</Label>
              <div className="flex flex-wrap gap-1">
                {(outcome.response_options || []).map((opt, idx) => (
                  <Badge key={idx} variant="secondary" className="text-[10px] py-0 gap-1">
                    {opt.label}
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(outcome.tempKey, idx)}
                      className="hover:text-destructive"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1">
                <Input
                  value={newOptionText[outcome.tempKey] || ''}
                  onChange={(e) => setNewOptionText((prev) => ({ ...prev, [outcome.tempKey]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddOption(outcome.tempKey) } }}
                  placeholder="Add option…"
                  className="h-6 text-[10px] flex-1"
                />
                <Button
                  type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2"
                  onClick={() => handleAddOption(outcome.tempKey)}
                >
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>

        {!isAmbitionLinked && (
          <Button
            variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => handleRemove(outcome.tempKey)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
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
          {isTranslating && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              AI translating ambitions…
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Define what the caller should record during each call. Outcomes linked to campaign ambitions feed into the assessment system.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isTranslating && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Translating campaign ambitions into per-call outcomes…
          </div>
        )}

        {/* Ambition-linked outcomes */}
        {!isTranslating && outcomes.filter((o) => o.maps_to_ambition_id != null).length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              From campaign ambitions{activeStagePlan ? ` (Stage ${activeStagePlan.stage_number})` : ''}
            </Label>
            <div className="space-y-2">
              {outcomes.filter((o) => o.maps_to_ambition_id != null).map((o) => renderOutcomeCard(o, true))}
            </div>
          </div>
        )}

        {/* Custom outcomes */}
        {!isTranslating && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Custom outcomes</Label>
            <div className="space-y-2">
              {outcomes.filter((o) => o.maps_to_ambition_id == null).map((o) => renderOutcomeCard(o, false))}
            </div>
            <Button variant="outline" size="sm" className="text-xs mt-2" onClick={handleAddCustom}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Custom Outcome
            </Button>
          </div>
        )}

        {/* Save */}
        {!isTranslating && (
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
        )}
      </CardContent>
    </Card>
  )
}
