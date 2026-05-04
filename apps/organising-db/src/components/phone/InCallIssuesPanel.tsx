'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Flame, X, Loader2 } from 'lucide-react'
import { ISSUE_HEAT_LEVELS } from '@/lib/situation-analysis/constants'
import type { CapturedIssue } from '@/lib/phone/call-flow-state'
import type { ExpectedIssue } from '@/components/phone/setup/types'

// ─── Local types ──────────────────────────────────────────────────────────────

type IssueHeat = 1 | 2 | 3 | 4 | 5

interface TopIssueFromDb {
  label: string
  heat: number
  notes?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function heatColor(heat: number): string {
  switch (heat) {
    case 1: return 'text-blue-600 bg-blue-50 border-blue-200'
    case 2: return 'text-cyan-600 bg-cyan-50 border-cyan-200'
    case 3: return 'text-amber-600 bg-amber-50 border-amber-200'
    case 4: return 'text-orange-600 bg-orange-50 border-orange-200'
    case 5: return 'text-red-600 bg-red-50 border-red-200'
    default: return 'text-slate-600 bg-slate-50 border-slate-200'
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  campaignId: number
  /**
   * Pre-configured expected issues from script setup.
   * If null/empty the component fetches top_issues from the DB.
   */
  expectedIssues: ExpectedIssue[] | null
  captured: CapturedIssue[]
  onAdd: (issue: CapturedIssue) => void
  onUpdate: (index: number, issue: CapturedIssue) => void
  onRemove: (index: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InCallIssuesPanel({
  campaignId,
  expectedIssues,
  captured,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const supabase = createClient()
  const [customLabel, setCustomLabel] = useState('')
  const [customHeat, setCustomHeat] = useState<IssueHeat>(3)
  const [showCustomForm, setShowCustomForm] = useState(false)

  // Only query the DB when expectedIssues is not supplied
  const { data: dbIssues, isLoading } = useQuery({
    queryKey: ['campaign-situation-analyses', campaignId, 'current', 'top-issues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_situation_analyses')
        .select('top_issues')
        .eq('campaign_id', campaignId)
        .eq('is_current', true)
        .maybeSingle()
      if (error) throw error
      if (!data) return [] as ExpectedIssue[]
      const raw = ((data.top_issues ?? []) as TopIssueFromDb[]).filter(
        (i): i is TopIssueFromDb => typeof i === 'object' && i !== null && typeof i.label === 'string'
      )
      return raw.map((i, idx): ExpectedIssue => ({
        issue_label: i.label,
        heat: Math.max(1, Math.min(5, i.heat)) as IssueHeat,
        source_top_issue_index: idx,
        notes: i.notes,
      }))
    },
    enabled: campaignId > 0 && (!expectedIssues || expectedIssues.length === 0),
  })

  // Build the checklist: prefer prop, fall back to DB data
  const checklistItems: ExpectedIssue[] =
    expectedIssues && expectedIssues.length > 0 ? expectedIssues : (dbIssues ?? [])

  const loading = (!expectedIssues || expectedIssues.length === 0) && isLoading

  // Which source indices are currently captured
  const capturedSourceIndices = new Set(
    captured.map((c) => c.source_top_issue_index).filter((idx): idx is number => idx != null)
  )

  function isChecked(issue: ExpectedIssue): boolean {
    const srcIdx = issue.source_top_issue_index
    if (srcIdx != null) return capturedSourceIndices.has(srcIdx)
    return captured.some(
      (c) => c.issue_label === issue.issue_label && c.source_top_issue_index == null
    )
  }

  function toggle(issue: ExpectedIssue) {
    const srcIdx = issue.source_top_issue_index ?? null
    if (srcIdx != null && capturedSourceIndices.has(srcIdx)) {
      const removeIdx = captured.findIndex((c) => c.source_top_issue_index === srcIdx)
      if (removeIdx >= 0) onRemove(removeIdx)
    } else if (srcIdx == null && isChecked(issue)) {
      const removeIdx = captured.findIndex(
        (c) => c.issue_label === issue.issue_label && c.source_top_issue_index == null
      )
      if (removeIdx >= 0) onRemove(removeIdx)
    } else {
      onAdd({
        issue_label: issue.issue_label,
        heat: issue.heat,
        source_top_issue_index: srcIdx,
        notes: issue.notes,
      })
    }
  }

  function addCustom() {
    if (!customLabel.trim()) return
    onAdd({ issue_label: customLabel.trim(), heat: customHeat, source_top_issue_index: null })
    setCustomLabel('')
    setCustomHeat(3)
    setShowCustomForm(false)
  }

  const customCaptured = captured.filter((c) => c.source_top_issue_index == null)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          Issues
          {captured.length > 0 && (
            <Badge variant="secondary" className="text-xs">{captured.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Expected issues checklist */}
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading issues…
          </div>
        ) : checklistItems.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Expected issues
            </p>
            {checklistItems.map((issue, idx) => {
              const checked = isChecked(issue)
              const capturedItem = checked
                ? captured.find(
                    (c) => c.source_top_issue_index === (issue.source_top_issue_index ?? null)
                  )
                : null
              const capturedIdx = capturedItem ? captured.indexOf(capturedItem) : -1

              return (
                <div
                  key={idx}
                  className={`rounded-md border px-2.5 py-1.5 transition-colors ${
                    checked ? 'bg-orange-50 border-orange-200' : 'border-border hover:bg-muted/30'
                  }`}
                >
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(issue)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs">{issue.issue_label}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 border ${heatColor(issue.heat)}`}
                        >
                          {ISSUE_HEAT_LEVELS.find((h) => h.value === issue.heat)?.label ?? issue.heat}
                        </Badge>
                      </div>
                      {/* Heat override when checked */}
                      {checked && capturedItem && capturedIdx >= 0 && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">Heat:</span>
                          {ISSUE_HEAT_LEVELS.map(({ value: hv, label }) => (
                            <button
                              key={hv}
                              type="button"
                              onClick={() => onUpdate(capturedIdx, { ...capturedItem, heat: hv as IssueHeat })}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                capturedItem.heat === hv
                                  ? heatColor(hv)
                                  : 'border-border text-muted-foreground hover:bg-muted/40'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              )
            })}
          </div>
        ) : null}

        {/* Custom issue form */}
        {checklistItems.length > 0 && <Separator />}
        {showCustomForm ? (
          <div className="space-y-2 rounded-lg border border-dashed p-2">
            <p className="text-xs font-medium">Add issue</p>
            <Input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Issue label…"
              className="h-7 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCustom()
                if (e.key === 'Escape') setShowCustomForm(false)
              }}
            />
            <div className="flex gap-1 flex-wrap">
              {ISSUE_HEAT_LEVELS.map(({ value: hv, label }) => (
                <button
                  key={hv}
                  type="button"
                  onClick={() => setCustomHeat(hv as IssueHeat)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                    customHeat === hv ? heatColor(hv) : 'border-border text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                onClick={addCustom}
                disabled={!customLabel.trim()}
              >
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
            Add issue
          </Button>
        )}

        {/* Captured custom issues (not from checklist) */}
        {customCaptured.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Custom issues
              </p>
              {customCaptured.map((issue) => {
                const globalIdx = captured.indexOf(issue)
                return (
                  <div
                    key={globalIdx}
                    className="rounded-md border border-orange-200 bg-orange-50 px-2.5 py-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{issue.issue_label}</span>
                      <button
                        type="button"
                        onClick={() => onRemove(globalIdx)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {ISSUE_HEAT_LEVELS.map(({ value: hv, label }) => (
                        <button
                          key={hv}
                          type="button"
                          onClick={() => onUpdate(globalIdx, { ...issue, heat: hv as IssueHeat })}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                            issue.heat === hv
                              ? heatColor(hv)
                              : 'border-border text-muted-foreground hover:bg-muted/40'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <Input
                      value={issue.notes ?? ''}
                      onChange={(e) => onUpdate(globalIdx, { ...issue, notes: e.target.value || undefined })}
                      placeholder="Notes (optional)"
                      className="h-6 text-xs"
                    />
                  </div>
                )
              })}
            </div>
          </>
        )}

        {captured.length === 0 && checklistItems.length === 0 && !showCustomForm && !loading && (
          <p className="text-xs text-muted-foreground italic">
            No issues configured for this campaign.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
