'use client'

import { useEffect, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Phase2WizardData, PriorBallot, KeyDispute } from './Phase2WizardLaunchCard'

interface Props {
  /** Required for standalone-mode pre-fill from the situation analysis.
   *  Phase 4 wires this at the call site; optional here so the component
   *  compiles without a page.tsx edit in Phase 3. */
  campaignId?: number
  wizardData: Phase2WizardData
  onChange: (updates: Partial<Phase2WizardData>) => void
  mode: 'continuation' | 'standalone'
}

const BLANK_BALLOT: PriorBallot = {
  ballot_kind: '',
  conducted_at: '',
  eligible_count: '',
  votes_yes: '',
  votes_no: '',
  outcome: '',
  notes: '',
}

const BLANK_DISPUTE: KeyDispute = {
  topic: '',
  oa_position: '',
  employer_position: '',
  urgency: 3,
  notes: '',
}

export function EmployerBehaviourStep({ campaignId, wizardData, onChange, mode }: Props) {
  const supabase = createClient()
  const prefillAttempted = useRef(false)
  const [prefillBanner, setPrefillBanner] = useState(false)

  // Standalone-mode pre-fill: fetch the latest SA row and map top_issues
  // entries that have oa_position or employer_position set into key_disputes.
  // Only runs once and only when key_disputes is currently empty.
  useEffect(() => {
    if (mode !== 'standalone') return
    if (!campaignId) return
    if (prefillAttempted.current) return
    if (wizardData.key_disputes.length > 0) return

    prefillAttempted.current = true

    async function prefill() {
      const { data } = await supabase
        .from('campaign_situation_analyses')
        .select('top_issues, key_disputes')
        .eq('campaign_id', campaignId!)
        .eq('is_current', true)
        .maybeSingle()

      if (!data) return

      // Map top_issues rows that have at least one position field set into
      // the Phase 2 wizard's KeyDispute shape.
      const topIssues: Array<{
        label?: string
        oa_position?: string
        employer_position?: string
      }> = Array.isArray(data.top_issues) ? data.top_issues : []

      const carried: KeyDispute[] = topIssues
        .filter((issue) => issue.oa_position || issue.employer_position)
        .map((issue) => ({
          topic: issue.label ?? '',
          oa_position: issue.oa_position ?? '',
          employer_position: issue.employer_position ?? '',
          urgency: 3,
          notes: '',
        }))

      if (carried.length > 0) {
        onChange({ key_disputes: carried })
        setPrefillBanner(true)
      }
    }

    prefill()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, campaignId])

  function updateBallot(index: number, patch: Partial<PriorBallot>) {
    const updated = wizardData.prior_employer_ballots.map((b, i) =>
      i === index ? { ...b, ...patch } : b
    )
    onChange({ prior_employer_ballots: updated })
  }

  function removeBallot(index: number) {
    onChange({
      prior_employer_ballots: wizardData.prior_employer_ballots.filter(
        (_, i) => i !== index
      ),
    })
  }

  function updateDispute(index: number, patch: Partial<KeyDispute>) {
    const updated = wizardData.key_disputes.map((d, i) =>
      i === index ? { ...d, ...patch } : d
    )
    onChange({ key_disputes: updated })
  }

  function removeDispute(index: number) {
    onChange({
      key_disputes: wizardData.key_disputes.filter((_, i) => i !== index),
    })
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">Employer behaviour</h2>
        </div>

        {prefillBanner && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <Badge variant="secondary" className="mr-2 text-blue-700 border-blue-300">
              Pre-filled
            </Badge>
            Disputes carried from your situation analysis — review and add any missing.
          </div>
        )}

        {/* Employer ballot intent */}
        <div className="space-y-2">
          <Label>Employer ballot intent</Label>
          <Select
            value={wizardData.employer_ballot_intent || 'unknown'}
            onValueChange={(v) =>
              onChange({ employer_ballot_intent: v === 'unknown' ? '' : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select intent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unknown">Unknown</SelectItem>
              <SelectItem value="not_indicated">Not indicated</SelectItem>
              <SelectItem value="signalled">Signalled intent</SelectItem>
              <SelectItem value="imminent">Ballot imminent</SelectItem>
              <SelectItem value="lodged">Application lodged</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            Whether the employer is likely to apply for a protected action ballot
            order.
          </p>
        </div>

        {/* Prior employer ballots */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Prior employer ballots</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  prior_employer_ballots: [
                    ...wizardData.prior_employer_ballots,
                    { ...BLANK_BALLOT },
                  ],
                })
              }
            >
              <Plus className="h-4 w-4" />
              Add ballot
            </Button>
          </div>
          {wizardData.prior_employer_ballots.length === 0 && (
            <p className="text-xs text-slate-500 italic">
              No prior employer ballots recorded.
            </p>
          )}
          {wizardData.prior_employer_ballots.map((ballot, i) => (
            <div key={i} className="border rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Ballot {i + 1}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeBallot(i)}
                >
                  <Trash2 className="h-4 w-4 text-slate-500" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Ballot kind</Label>
                  <Select
                    value={ballot.ballot_kind || 'unknown'}
                    onValueChange={(v) =>
                      updateBallot(i, {
                        ballot_kind: v === 'unknown' ? '' : v,
                      })
                    }
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">Unknown</SelectItem>
                      <SelectItem value="employer_pabo">Employer PABO</SelectItem>
                      <SelectItem value="protected_action">Protected action</SelectItem>
                      <SelectItem value="approval">Approval ballot</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Conducted date</Label>
                  <Input
                    type="date"
                    value={ballot.conducted_at}
                    onChange={(e) =>
                      updateBallot(i, { conducted_at: e.target.value })
                    }
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Eligible count</Label>
                  <Input
                    type="number"
                    min="0"
                    value={ballot.eligible_count}
                    onChange={(e) =>
                      updateBallot(i, { eligible_count: e.target.value })
                    }
                    className="text-xs"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Votes yes</Label>
                  <Input
                    type="number"
                    min="0"
                    value={ballot.votes_yes}
                    onChange={(e) =>
                      updateBallot(i, { votes_yes: e.target.value })
                    }
                    className="text-xs"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Votes no</Label>
                  <Input
                    type="number"
                    min="0"
                    value={ballot.votes_no}
                    onChange={(e) =>
                      updateBallot(i, { votes_no: e.target.value })
                    }
                    className="text-xs"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Outcome</Label>
                  <Select
                    value={ballot.outcome || 'unknown'}
                    onValueChange={(v) =>
                      updateBallot(i, { outcome: v === 'unknown' ? '' : v })
                    }
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">Unknown</SelectItem>
                      <SelectItem value="passed">Passed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="withdrawn">Withdrawn</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={ballot.notes}
                  onChange={(e) => updateBallot(i, { notes: e.target.value })}
                  rows={2}
                  className="text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Key disputes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Key disputes</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  key_disputes: [
                    ...wizardData.key_disputes,
                    { ...BLANK_DISPUTE },
                  ],
                })
              }
            >
              <Plus className="h-4 w-4" />
              Add dispute
            </Button>
          </div>
          {wizardData.key_disputes.length === 0 && (
            <p className="text-xs text-slate-500 italic">
              No key disputes recorded.
            </p>
          )}
          {wizardData.key_disputes.map((dispute, i) => (
            <div key={i} className="border rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Dispute {i + 1}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDispute(i)}
                >
                  <Trash2 className="h-4 w-4 text-slate-500" />
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Topic</Label>
                <Input
                  value={dispute.topic}
                  onChange={(e) => updateDispute(i, { topic: e.target.value })}
                  placeholder="e.g. Overtime rates, roster cycles"
                  className="text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">OA position</Label>
                  <Textarea
                    value={dispute.oa_position}
                    onChange={(e) =>
                      updateDispute(i, { oa_position: e.target.value })
                    }
                    rows={2}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Employer position</Label>
                  <Textarea
                    value={dispute.employer_position}
                    onChange={(e) =>
                      updateDispute(i, { employer_position: e.target.value })
                    }
                    rows={2}
                    className="text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Urgency (1 = low, 5 = critical)
                </Label>
                <Select
                  value={String(dispute.urgency)}
                  onValueChange={(v) =>
                    updateDispute(i, { urgency: Number(v) })
                  }
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — Low</SelectItem>
                    <SelectItem value="2">2 — Minor</SelectItem>
                    <SelectItem value="3">3 — Moderate</SelectItem>
                    <SelectItem value="4">4 — High</SelectItem>
                    <SelectItem value="5">5 — Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={dispute.notes}
                  onChange={(e) => updateDispute(i, { notes: e.target.value })}
                  rows={2}
                  className="text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
