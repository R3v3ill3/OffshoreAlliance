'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Plus, Flame, Loader2, InfoIcon } from 'lucide-react'
import { ISSUE_HEAT_LEVELS } from '@/lib/situation-analysis/constants'
import type { ExpectedIssue, IssueHeatValue, TopIssueForSeeding } from './types'

// ─── DB row shape for situation analysis ─────────────────────────────────────

interface TopIssueFromDb {
  label: string
  heat: number
  notes?: string
}

interface SituationAnalysisRow {
  situation_id: number
  top_issues: TopIssueFromDb[]
  is_current: boolean
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface IssueIdentificationEditorProps {
  campaignId: number
  value: ExpectedIssue[]
  onChange: (issues: ExpectedIssue[]) => void
  readOnly?: boolean
  /**
   * Called when the host should invoke seed_campaign_top_issues_from_call.
   * Fired when the editor has new user-entered issues and no current
   * situation analysis exists. The host persists at its own discretion.
   */
  onSeedRequest?: (issues: TopIssueForSeeding[]) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEAT_LABEL: Record<number, string> = Object.fromEntries(
  ISSUE_HEAT_LEVELS.map(({ value, label }) => [value, label])
)

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

// ─── Component ────────────────────────────────────────────────────────────────

export function IssueIdentificationEditor({
  campaignId,
  value,
  onChange,
  readOnly = false,
  onSeedRequest,
}: IssueIdentificationEditorProps) {
  const supabase = createClient()
  const [showNewForm, setShowNewForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newHeat, setNewHeat] = useState<IssueHeatValue>(3)
  const [newNotes, setNewNotes] = useState('')

  // Load current campaign situation analysis
  const { data: analysis, isLoading } = useQuery({
    queryKey: ['campaign-situation-analyses', campaignId, 'current'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_situation_analyses')
        .select('situation_id, top_issues, is_current')
        .eq('campaign_id', campaignId)
        .eq('is_current', true)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return data as SituationAnalysisRow
    },
    enabled: campaignId > 0,
  })

  const topIssues: TopIssueFromDb[] = (analysis?.top_issues ?? []).filter(
    (i): i is TopIssueFromDb => typeof i === 'object' && i !== null && typeof i.label === 'string'
  )
  const hasTopIssues = topIssues.length > 0
  const noCurrentAnalysis = !isLoading && !analysis

  // Check if an issue at index `i` is currently selected
  function isSelected(index: number) {
    return value.some((v) => v.source_top_issue_index === index)
  }

  function toggleTopIssue(index: number, issue: TopIssueFromDb) {
    if (isSelected(index)) {
      onChange(value.filter((v) => v.source_top_issue_index !== index))
    } else {
      onChange([
        ...value,
        {
          issue_label: issue.label,
          heat: Math.max(1, Math.min(5, issue.heat)) as IssueHeatValue,
          source_top_issue_index: index,
          notes: issue.notes,
        },
      ])
    }
  }

  function updateSelectedHeat(index: number, heat: IssueHeatValue) {
    onChange(
      value.map((v) =>
        v.source_top_issue_index === index ? { ...v, heat } : v
      )
    )
  }

  function handleAddNew() {
    if (!newLabel.trim()) return
    const issue: ExpectedIssue = {
      issue_label: newLabel.trim(),
      heat: newHeat,
      source_top_issue_index: null,
      notes: newNotes.trim() || undefined,
    }
    const next = [...value, issue]
    onChange(next)

    // Notify host for potential seeding
    if (noCurrentAnalysis) {
      onSeedRequest?.(
        next.map((i) => ({ label: i.issue_label, heat: i.heat, notes: i.notes }))
      )
    }

    setNewLabel('')
    setNewHeat(3)
    setNewNotes('')
    setShowNewForm(false)
  }

  function removeCustomIssue(issueLabel: string) {
    onChange(value.filter((v) => v.source_top_issue_index == null && v.issue_label !== issueLabel || v.source_top_issue_index != null))
  }

  const customIssues = value.filter((v) => v.source_top_issue_index == null)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-orange-500" />
        <h4 className="text-sm font-semibold">Issue Identification</h4>
        {value.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {value.length} issue{value.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Select the workplace issues to focus on during calls. Organiser-assessed heat (1 Cold → 5 Burning).
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading campaign issues…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Seeding notice */}
          {noCurrentAnalysis && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <InfoIcon className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">
                No campaign situation analysis found. Issues you add here will be saved as the
                campaign&apos;s initial top issues when you proceed.
              </p>
            </div>
          )}

          {/* Top issues checklist */}
          {hasTopIssues && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Campaign top issues
              </p>
              <div className="space-y-1.5">
                {topIssues.map((issue, i) => {
                  const selected = isSelected(i)
                  const selectedItem = value.find((v) => v.source_top_issue_index === i)
                  const currentHeat = selectedItem?.heat ?? (Math.max(1, Math.min(5, issue.heat)) as IssueHeatValue)

                  return (
                    <div
                      key={i}
                      className={`rounded-md border px-2.5 py-2 transition-colors ${
                        selected ? 'bg-orange-50 border-orange-200' : 'border-border hover:bg-muted/30'
                      }`}
                    >
                      <label className={`flex items-start gap-2.5 ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => !readOnly && toggleTopIssue(i, issue)}
                          disabled={readOnly}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm">{issue.label}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 border ${heatColor(issue.heat)}`}
                            >
                              {HEAT_LABEL[issue.heat] ?? issue.heat}
                            </Badge>
                          </div>

                          {/* Per-call heat override when selected */}
                          {selected && !readOnly && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Heat for this call:</span>
                              <div className="flex gap-1">
                                {ISSUE_HEAT_LEVELS.map(({ value: hv, label }) => (
                                  <button
                                    key={hv}
                                    type="button"
                                    onClick={() => updateSelectedHeat(i, hv as IssueHeatValue)}
                                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                      currentHeat === hv
                                        ? heatColor(hv)
                                        : 'border-border text-muted-foreground hover:bg-muted/40'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Custom issues (user-entered, no source index) */}
          {customIssues.length > 0 && (
            <>
              {hasTopIssues && <Separator />}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Additional issues
                </p>
                <div className="space-y-1.5">
                  {customIssues.map((issue, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm">{issue.issue_label}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 border ${heatColor(issue.heat)}`}
                          >
                            {HEAT_LABEL[issue.heat] ?? issue.heat}
                          </Badge>
                        </div>
                        {issue.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{issue.notes}</p>
                        )}
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => removeCustomIssue(issue.issue_label)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Add new issue form */}
          {!readOnly && (
            <>
              <Separator />
              {showNewForm ? (
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                  <p className="text-xs font-medium">Add issue</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Issue label</Label>
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="e.g. Unsafe shift lengths"
                      className="h-7 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Heat</Label>
                    <div className="flex gap-1.5">
                      {ISSUE_HEAT_LEVELS.map(({ value: hv, label }) => (
                        <button
                          key={hv}
                          type="button"
                          onClick={() => setNewHeat(hv as IssueHeatValue)}
                          className={`text-xs px-2 py-1 rounded border transition-colors ${
                            newHeat === hv
                              ? heatColor(hv)
                              : 'border-border text-muted-foreground hover:bg-muted/40'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes (optional)</Label>
                    <Input
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="Additional context"
                      className="h-7 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleAddNew}
                      disabled={!newLabel.trim()}
                    >
                      Add
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setShowNewForm(false); setNewLabel(''); setNewHeat(3); setNewNotes('') }}
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
                  className="h-8 text-xs"
                  onClick={() => setShowNewForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add issue
                </Button>
              )}
            </>
          )}

          {!hasTopIssues && value.length === 0 && !showNewForm && !noCurrentAnalysis && (
            <p className="text-xs text-muted-foreground italic">
              No top issues configured for this campaign yet. Add one above.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
