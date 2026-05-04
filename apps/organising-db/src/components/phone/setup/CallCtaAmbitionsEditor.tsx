'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  AlertTriangle,
  Plus,
  Trash2,
  Target,
  ExternalLink,
} from 'lucide-react'
import type { CallCtaAmbition, CtaTargetResponse, CtaSupportLevel } from './types'

// ─── Local types ─────────────────────────────────────────────────────────────

interface CtaOutcomeDefinition {
  outcome_id: number
  name: string
  description: string | null
  response_type: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CTA_RESPONSE_OPTIONS: { value: CtaTargetResponse; label: string }[] = [
  { value: 'accepted', label: 'Accepted' },
  { value: 'considering', label: 'Considering' },
  { value: 'declined', label: 'Declined' },
  { value: 'not_reached', label: 'Not reached' },
]

const SUPPORT_LEVEL_OPTIONS: { value: CtaSupportLevel; label: string }[] = [
  { value: 'strong_supporter', label: 'Strong supporter' },
  { value: 'supporter', label: 'Supporter' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'unsupportive', label: 'Unsupportive' },
  { value: 'hostile', label: 'Hostile' },
]

// ─── Props ───────────────────────────────────────────────────────────────────

interface CallCtaAmbitionsEditorProps {
  scriptId?: number | null
  campaignId: number
  value: CallCtaAmbition[]
  onChange: (ambitions: CallCtaAmbition[]) => void
  readOnly?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyAmbition(label: string, outcomeId?: number | null): CallCtaAmbition {
  return {
    outcome_definition_id: outcomeId ?? null,
    cta_label: label,
    target_response: null,
    target_min_rating: null,
    target_binary: null,
    target_support_level: null,
    min_call_threshold_pct: null,
    notes: null,
  }
}

// ─── Row editor ──────────────────────────────────────────────────────────────

interface AmbitionRowProps {
  ambition: CallCtaAmbition
  index: number
  onChange: (index: number, updated: CallCtaAmbition) => void
  onRemove: (index: number) => void
  readOnly: boolean
  isCustom: boolean
}

function AmbitionRow({ ambition, index, onChange, onRemove, readOnly, isCustom }: AmbitionRowProps) {
  function update<K extends keyof CallCtaAmbition>(key: K, val: CallCtaAmbition[K]) {
    onChange(index, { ...ambition, [key]: val })
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {isCustom ? (
            <Input
              value={ambition.cta_label}
              onChange={(e) => update('cta_label', e.target.value)}
              placeholder="CTA label (e.g. Join the union)"
              disabled={readOnly}
              className="h-7 text-sm font-medium"
            />
          ) : (
            <p className="text-sm font-medium truncate">{ambition.cta_label}</p>
          )}
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Target response */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Target response
          </Label>
          <Select
            value={ambition.target_response ?? '__none__'}
            onValueChange={(v) => update('target_response', v === '__none__' ? null : v as CtaTargetResponse)}
            disabled={readOnly}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Any</SelectItem>
              {CTA_RESPONSE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Min rating */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Min rating (1–5)
          </Label>
          <Input
            type="number"
            min={1}
            max={5}
            value={ambition.target_min_rating ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Math.max(1, Math.min(5, parseInt(e.target.value, 10)))
              update('target_min_rating', isNaN(v as number) ? null : v)
            }}
            placeholder="None"
            disabled={readOnly}
            className="h-7 text-xs"
          />
        </div>

        {/* Support level */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Support level
          </Label>
          <Select
            value={ambition.target_support_level ?? '__none__'}
            onValueChange={(v) => update('target_support_level', v === '__none__' ? null : v as CtaSupportLevel)}
            disabled={readOnly}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Any</SelectItem>
              {SUPPORT_LEVEL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Threshold % */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Threshold %
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={ambition.min_call_threshold_pct ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Math.max(0, Math.min(100, parseInt(e.target.value, 10)))
              update('min_call_threshold_pct', isNaN(v as number) ? null : v)
            }}
            placeholder="None"
            disabled={readOnly}
            className="h-7 text-xs"
          />
        </div>
      </div>

      {/* Notes */}
      <Input
        value={ambition.notes ?? ''}
        onChange={(e) => update('notes', e.target.value || null)}
        placeholder="Notes (optional)"
        disabled={readOnly}
        className="h-7 text-xs"
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CallCtaAmbitionsEditor({
  scriptId,
  campaignId,
  value,
  onChange,
  readOnly = false,
}: CallCtaAmbitionsEditorProps) {
  const supabase = createClient()
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customLabel, setCustomLabel] = useState('')

  // Query CTA outcome definitions for this script
  const { data: ctaDefinitions = [], isLoading } = useQuery({
    queryKey: ['call-outcome-definitions', scriptId, 'cta'],
    queryFn: async () => {
      if (!scriptId) return []
      const { data, error } = await supabase
        .from('call_outcome_definitions')
        .select('outcome_id, name, description, response_type')
        .eq('script_id', scriptId)
        .eq('outcome_category', 'cta')
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as CtaOutcomeDefinition[]
    },
    enabled: !!scriptId,
  })

  const hasNoCtas = !isLoading && ctaDefinitions.length === 0

  function handleRowChange(index: number, updated: CallCtaAmbition) {
    const next = [...value]
    next[index] = updated
    onChange(next)
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function handleAddDefinition(def: CtaOutcomeDefinition) {
    if (value.some((a) => a.outcome_definition_id === def.outcome_id)) return
    onChange([...value, emptyAmbition(def.name, def.outcome_id)])
  }

  function handleAddCustom() {
    if (!customLabel.trim()) return
    onChange([...value, emptyAmbition(customLabel.trim())])
    setCustomLabel('')
    setShowCustomForm(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-blue-500" />
        <h4 className="text-sm font-semibold">CTA Ambitions</h4>
        {value.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {value.length}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Set per-script targets for each call-to-action outcome. The call runner uses these to
        flag when results fall below target.
      </p>

      {/* Warning: no CTA outcomes configured */}
      {hasNoCtas && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800">
                No call-to-action assessment configured.
              </p>
              <p className="text-xs text-amber-700">
                {scriptId
                  ? 'Please add a CTA outcome definition to this script before setting per-call ambitions.'
                  : 'Save the script first, then add CTA outcome definitions.'}
              </p>
            </div>
          </div>
          {scriptId && campaignId > 0 && (
            <a
              href={`/campaigns/${campaignId}/phone/scripts/${scriptId}`}
              className="inline-flex items-center gap-1 text-xs text-amber-700 underline hover:text-amber-900"
            >
              <ExternalLink className="h-3 w-3" />
              Open Call Outcome Editor
            </a>
          )}
          <p className="text-xs text-amber-700">
            You can still add free-form ambitions below.
          </p>
        </div>
      )}

      {/* Add from definitions */}
      {ctaDefinitions.length > 0 && !readOnly && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Add from CTA outcomes:</p>
          <div className="flex flex-wrap gap-1.5">
            {ctaDefinitions.map((def) => {
              const alreadyAdded = value.some((a) => a.outcome_definition_id === def.outcome_id)
              return (
                <button
                  key={def.outcome_id}
                  type="button"
                  onClick={() => handleAddDefinition(def)}
                  disabled={alreadyAdded}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    alreadyAdded
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  {alreadyAdded ? '✓ ' : '+ '}
                  {def.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Existing ambition rows */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((ambition, i) => (
            <AmbitionRow
              key={i}
              ambition={ambition}
              index={i}
              onChange={handleRowChange}
              onRemove={handleRemove}
              readOnly={readOnly}
              isCustom={!ambition.outcome_definition_id}
            />
          ))}
        </div>
      )}

      {/* Separator before add button */}
      {value.length > 0 && !readOnly && <Separator />}

      {/* Add custom ambition */}
      {!readOnly && (
        <div className="space-y-2">
          {showCustomForm ? (
            <div className="flex items-center gap-2">
              <Input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Custom CTA label (e.g. Request site visit)"
                className="h-8 text-sm flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustom()
                  if (e.key === 'Escape') setShowCustomForm(false)
                }}
                autoFocus
              />
              <Button type="button" size="sm" className="h-8 text-xs" onClick={handleAddCustom} disabled={!customLabel.trim()}>
                Add
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setShowCustomForm(false); setCustomLabel('') }}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowCustomForm(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add custom ambition
            </Button>
          )}
        </div>
      )}

      {value.length === 0 && !showCustomForm && (
        <p className="text-xs text-muted-foreground italic">
          No ambitions set. Add from CTA outcomes above or add a custom ambition.
        </p>
      )}
    </div>
  )
}
