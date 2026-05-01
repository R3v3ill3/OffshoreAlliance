'use client'

import { useEffect, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Phase2WizardData } from './Phase2WizardLaunchCard'

interface Props {
  wizardData: Phase2WizardData
  onChange: (updates: Partial<Phase2WizardData>) => void
  mode: 'continuation' | 'standalone'
  /** Required for continuation-mode pre-fill. */
  campaignId?: number
}

export function WorkerSupportStep({ wizardData, onChange, mode, campaignId }: Props) {
  const supabase = createClient()
  const prefillAttempted = useRef(false)

  // Continuation-mode pre-fill: fetch the latest SA row and set
  // percent_supportive_estimated from worker_support_estimate if it exists
  // and the field is currently empty.
  useEffect(() => {
    if (mode !== 'continuation') return
    if (!campaignId) return
    if (prefillAttempted.current) return
    if (wizardData.worker_support_estimate.percent_supportive_estimated !== '') return

    prefillAttempted.current = true

    async function prefill() {
      const { data } = await supabase
        .from('campaign_situation_analyses')
        .select('worker_support_estimate')
        .eq('campaign_id', campaignId!)
        .eq('is_current', true)
        .maybeSingle()

      if (!data) return

      // SA worker_support_estimate is stored as a number (percent).
      const saEstimate = data.worker_support_estimate as number | null
      if (saEstimate != null) {
        onChange({
          worker_support_estimate: {
            ...wizardData.worker_support_estimate,
            percent_supportive_estimated: saEstimate,
          },
        })
      }
    }

    prefill()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, campaignId])
  const estimate = wizardData.worker_support_estimate

  function updateEstimate(
    patch: Partial<Phase2WizardData['worker_support_estimate']>
  ) {
    onChange({
      worker_support_estimate: { ...estimate, ...patch },
    })
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">Worker support estimate</h2>
        </div>
        <p className="text-xs text-slate-600">
          Before beginning Phase 2 it helps to record the organiser&apos;s
          current read of member sentiment. This is a point-in-time snapshot —
          it will be updated by formal strength assessments in Stage 9.
        </p>

        <div className="space-y-2">
          <Label htmlFor="pct_supportive">
            % of workers assessed as supportive (0–100)
          </Label>
          <Input
            id="pct_supportive"
            type="number"
            min={0}
            max={100}
            step={1}
            value={estimate.percent_supportive_estimated === '' ? '' : estimate.percent_supportive_estimated}
            onChange={(e) => {
              const raw = e.target.value
              updateEstimate({
                percent_supportive_estimated:
                  raw === '' ? '' : Math.min(100, Math.max(0, Number(raw))),
              })
            }}
            placeholder="e.g. 65"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="basis_of_estimate">Basis of estimate</Label>
          <Textarea
            id="basis_of_estimate"
            value={estimate.basis_of_estimate}
            onChange={(e) =>
              updateEstimate({ basis_of_estimate: e.target.value })
            }
            rows={3}
            placeholder="e.g. Conversations with delegates, informal show-of-hands at meetings, phone-bank results…"
          />
          <p className="text-xs text-slate-500">
            How confident is this estimate? What evidence supports it?
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="worker_support_notes">Notes</Label>
          <Textarea
            id="worker_support_notes"
            value={estimate.notes}
            onChange={(e) => updateEstimate({ notes: e.target.value })}
            rows={2}
            placeholder="Optional — any caveats or segmentation notes"
          />
        </div>
      </CardContent>
    </Card>
  )
}
