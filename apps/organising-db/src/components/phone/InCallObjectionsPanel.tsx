'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Plus, ShieldAlert, X, Loader2 } from 'lucide-react'
import type { CapturedObjection } from '@/lib/phone/call-flow-state'

// ─── Local types ──────────────────────────────────────────────────────────────

interface ObjectionBankRow {
  objection_id: number
  label: string
  description: string | null
  is_default: boolean
}

type ObjectionOutcome = CapturedObjection['outcome']

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTCOME_OPTIONS: { value: ObjectionOutcome; label: string; color: string }[] = [
  { value: 'fully_resolved', label: 'Resolved', color: 'text-green-700 bg-green-50 border-green-200' },
  { value: 'partially_resolved', label: 'Partial', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { value: 'not_resolved', label: 'Unresolved', color: 'text-red-700 bg-red-50 border-red-200' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  campaignId: number
  captured: CapturedObjection[]
  onAdd: (obj: CapturedObjection) => void
  onUpdate: (index: number, obj: CapturedObjection) => void
  onRemove: (index: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InCallObjectionsPanel({ campaignId, captured, onAdd, onUpdate, onRemove }: Props) {
  const supabase = createClient()
  const [customLabel, setCustomLabel] = useState('')
  const [customOutcome, setCustomOutcome] = useState<ObjectionOutcome>('not_resolved')
  const [showCustomForm, setShowCustomForm] = useState(false)

  const { data: bank = [], isLoading } = useQuery({
    queryKey: ['call-objections', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_objections')
        .select('objection_id, label, description, is_default, campaign_id, sort_order')
        .or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
        .order('is_default', { ascending: false })
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as ObjectionBankRow[]
    },
  })

  const capturedIds = new Set(
    captured.map((c) => c.objection_id).filter((id): id is number => id != null)
  )

  function addFromBank(row: ObjectionBankRow) {
    if (capturedIds.has(row.objection_id)) return
    onAdd({ objection_id: row.objection_id, custom_label: row.label, outcome: 'not_resolved' })
  }

  function addCustom() {
    if (!customLabel.trim()) return
    onAdd({ objection_id: null, custom_label: customLabel.trim(), outcome: customOutcome })
    setCustomLabel('')
    setCustomOutcome('not_resolved')
    setShowCustomForm(false)
  }

  function getLabel(obj: CapturedObjection): string {
    return obj.custom_label ?? (obj.objection_id != null ? `Objection #${obj.objection_id}` : 'Custom objection')
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          Objections
          {captured.length > 0 && (
            <Badge variant="secondary" className="text-xs">{captured.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Quick add from bank */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading objection bank…
          </div>
        ) : bank.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Quick add</p>
            <div className="flex flex-wrap gap-1.5">
              {bank.map((row) => {
                const already = capturedIds.has(row.objection_id)
                return (
                  <button
                    key={row.objection_id}
                    type="button"
                    onClick={() => addFromBank(row)}
                    disabled={already}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      already
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                        : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    {already ? '✓ ' : '+ '}
                    {row.label}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* Custom objection form */}
        <Separator />
        {showCustomForm ? (
          <div className="space-y-2 rounded-lg border border-dashed p-2">
            <p className="text-xs font-medium">Custom objection</p>
            <Input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Describe the objection…"
              className="h-7 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCustom()
                if (e.key === 'Escape') setShowCustomForm(false)
              }}
            />
            <Select value={customOutcome} onValueChange={(v) => setCustomOutcome(v as ObjectionOutcome)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button type="button" size="sm" className="h-7 text-xs" onClick={addCustom} disabled={!customLabel.trim()}>
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setShowCustomForm(false); setCustomLabel('') }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowCustomForm(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Custom objection
          </Button>
        )}

        {/* Captured objections */}
        {captured.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Captured this call
              </p>
              {captured.map((obj, i) => (
                <div key={i} className="rounded-md border bg-muted/20 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{getLabel(obj)}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Outcome chips */}
                  <div className="flex flex-wrap gap-1">
                    {OUTCOME_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => onUpdate(i, { ...obj, outcome: o.value })}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          obj.outcome === o.value
                            ? o.color
                            : 'border-border text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {/* Notes */}
                  <Input
                    value={obj.notes ?? ''}
                    onChange={(e) => onUpdate(i, { ...obj, notes: e.target.value || undefined })}
                    placeholder="Notes (optional)"
                    className="h-6 text-xs"
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {captured.length === 0 && bank.length === 0 && !isLoading && !showCustomForm && (
          <p className="text-xs text-muted-foreground italic">No objections captured yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
