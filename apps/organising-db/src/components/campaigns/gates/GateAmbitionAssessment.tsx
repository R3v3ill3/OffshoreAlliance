'use client'

import { useState } from 'react'
import { useUpdatePlanAmbitionProgress, useSubmitGateAssessment } from '@/lib/hooks/useGateAssessment'
import {
  ambitionDisplayName,
  evaluatePlanAmbition,
  evaluateAmbitions,
  formatAmbitionMetricValue,
  resolveMetricType,
  type PlanAmbitionWithOption,
} from '@/lib/utils/ambition-gate-logic'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  CheckCircle,
  XCircle,
  Lock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
} from 'lucide-react'
import { format } from 'date-fns'
import { GATE_NAMES } from '@/types/planner-types'
import type { GateAssessment as GateAssessmentType, GateDefinition } from '@/types/planner-types'
import type { MetricType } from '@/types/planner-types'
import { toast } from 'sonner'

interface GateAmbitionAssessmentProps {
  gate: GateDefinition & { gate_assessments: GateAssessmentType[] }
  ambitions: PlanAmbitionWithOption[]
  campaignId: number
  canAssess: boolean
}

export function GateAmbitionAssessment({
  gate,
  ambitions,
  campaignId,
  canAssess,
}: GateAmbitionAssessmentProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [values, setValues] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [overrideJustification, setOverrideJustification] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const updateProgress = useUpdatePlanAmbitionProgress()
  const submitAssessment = useSubmitGateAssessment()

  const evaluation = evaluateAmbitions(ambitions)
  const canPass = evaluation.allMet
  const canOverride =
    gate.enforcement_type === 'soft' && evaluation.hardGatesMet && !evaluation.allMet
  const isHardBlocked = !evaluation.hardGatesMet

  async function handleSave(ambitionId: number) {
    try {
      await updateProgress.mutateAsync({
        ambition_id: ambitionId,
        current_value: values[ambitionId],
        evidence_notes: notes[ambitionId],
        campaign_id: campaignId,
        gate_number: gate.gate_number,
      })
      setEditingId(null)
      toast.success('Ambition progress updated')
    } catch {
      toast.error('Failed to update')
    }
  }

  async function handlePass() {
    const snapshot: Record<string, string | null> = {}
    for (const a of ambitions) {
      snapshot[`ambition_${a.ambition_id}`] = a.current_value
    }

    try {
      await submitAssessment.mutateAsync({
        gate_id: gate.gate_id,
        outcome: 'passed',
        snapshot,
        campaign_id: campaignId,
        gate_number: gate.gate_number,
      })
      toast.success(`Gate ${gate.gate_number} passed — Stage ${gate.gate_number + 1} unlocked!`)
    } catch {
      toast.error('Failed to record assessment')
    }
  }

  async function handleOverride() {
    if (!overrideJustification.trim()) {
      toast.error('A written justification is required to override a gate')
      return
    }

    const snapshot: Record<string, string | null> = {}
    for (const a of ambitions) {
      snapshot[`ambition_${a.ambition_id}`] = a.current_value
    }

    try {
      await submitAssessment.mutateAsync({
        gate_id: gate.gate_id,
        outcome: 'override_approved',
        override_justification: overrideJustification,
        snapshot,
        campaign_id: campaignId,
        gate_number: gate.gate_number,
      })
      setShowOverrideModal(false)
      toast.success('Gate override approved and logged')
    } catch {
      toast.error('Failed to submit override')
    }
  }

  function targetLabel(a: PlanAmbitionWithOption): string {
    const m = resolveMetricType(a)
    if (m === 'range') {
      return `${a.target_value ?? '—'}–${a.target_value_max ?? '—'}`
    }
    if (m === 'boolean') return a.target_value === 'true' ? 'Yes' : 'Required'
    return formatAmbitionMetricValue(a.target_value, m as MetricType)
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm',
              evaluation.allMet
                ? 'bg-green-100 text-green-700'
                : isHardBlocked
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
            )}
          >
            {evaluation.allMet ? (
              <CheckCircle className="h-5 w-5" />
            ) : isHardBlocked ? (
              <Lock className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Gate {gate.gate_number}: {gate.gate_name || GATE_NAMES[gate.gate_number as keyof typeof GATE_NAMES]}
            </h2>
            <p className="text-sm text-muted-foreground">
              Based on Stage {gate.gate_number} ambitions — between Stage {gate.gate_number} and Stage{' '}
              {gate.gate_number + 1}
            </p>
          </div>
          <Badge
            className={cn(
              'ml-auto text-xs',
              evaluation.allMet
                ? 'bg-green-100 text-green-700'
                : isHardBlocked
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
            )}
            variant="secondary"
          >
            {evaluation.metCount}/{evaluation.totalCount} met
          </Badge>
        </div>

        {isHardBlocked && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            <Lock className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Hard gate blocked.</strong> {evaluation.failedHardGates.length} hard ambition(s) must be met
              before progression. This cannot be overridden.
            </p>
          </div>
        )}

        {gate.enforcement_type === 'soft' && !evaluation.allMet && !isHardBlocked && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Soft gate — override possible.</strong> Not all ambitions are met. Progression can proceed with
              written justification.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {ambitions.map((ambition) => {
          const metric = resolveMetricType(ambition)
          const isMet = evaluatePlanAmbition(ambition)
          const isEditing = editingId === ambition.ambition_id
          const currentVal = values[ambition.ambition_id] ?? ambition.current_value ?? ''

          return (
            <Card
              key={ambition.ambition_id}
              className={cn(
                'transition-colors',
                isMet ? 'border-green-200' : ambition.is_hard_gate ? 'border-red-300 bg-red-50/50' : 'border-slate-200'
              )}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {isMet ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : ambition.is_hard_gate ? (
                      <Lock className="h-5 w-5 text-red-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-slate-300" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{ambitionDisplayName(ambition)}</p>
                      {ambition.is_system_default && (
                        <Badge variant="outline" className="text-xs">
                          Membership
                        </Badge>
                      )}
                      {ambition.is_hard_gate && (
                        <Badge className="bg-red-100 text-red-700 text-xs" variant="secondary">
                          <Lock className="h-3 w-3 mr-1" />
                          Hard
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <span className="text-muted-foreground">
                        Target: <strong>{targetLabel(ambition)}</strong>
                      </span>
                      {ambition.target_date && (
                        <span className="text-muted-foreground">
                          By:{' '}
                          <strong>{format(new Date(ambition.target_date + 'T12:00:00'), 'dd MMM yyyy')}</strong>
                        </span>
                      )}
                      <span className={cn('font-semibold', isMet ? 'text-green-700' : 'text-red-700')}>
                        Current: {formatAmbitionMetricValue(ambition.current_value, metric as MetricType)}
                      </span>
                    </div>

                    {isEditing && canAssess ? (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Label className="text-xs whitespace-nowrap">Current value:</Label>
                          {metric === 'boolean' ? (
                            <select
                              value={currentVal}
                              onChange={(e) =>
                                setValues((p) => ({ ...p, [ambition.ambition_id]: e.target.value }))
                              }
                              className="h-8 text-xs border rounded px-2"
                            >
                              <option value="">Select...</option>
                              <option value="true">Yes</option>
                              <option value="false">No</option>
                            </select>
                          ) : metric === 'date' ? (
                            <DateInput
                              value={currentVal}
                              onChange={(iso) =>
                                setValues((p) => ({ ...p, [ambition.ambition_id]: iso }))
                              }
                              className="h-8 text-xs w-36"
                            />
                          ) : (
                            <Input
                              type="number"
                              value={currentVal}
                              onChange={(e) =>
                                setValues((p) => ({ ...p, [ambition.ambition_id]: e.target.value }))
                              }
                              className="h-8 text-xs w-28"
                              placeholder={metric === 'percentage' ? '0-100' : metric === 'range' ? 'value' : ''}
                            />
                          )}
                          {metric === 'percentage' && (
                            <span className="text-xs text-muted-foreground">%</span>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">Evidence notes:</Label>
                          <Textarea
                            value={notes[ambition.ambition_id] ?? ambition.evidence_notes ?? ''}
                            onChange={(e) =>
                              setNotes((p) => ({ ...p, [ambition.ambition_id]: e.target.value }))
                            }
                            placeholder="Evidence for this value"
                            rows={2}
                            className="mt-1 text-xs"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSave(ambition.ambition_id)}>
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {ambition.evidence_notes && (
                          <p className="text-xs text-muted-foreground italic">{ambition.evidence_notes}</p>
                        )}
                        {canAssess && (
                          <button
                            type="button"
                            onClick={() => {
                              setValues((p) => ({
                                ...p,
                                [ambition.ambition_id]: ambition.current_value || '',
                              }))
                              setEditingId(ambition.ambition_id)
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Update value
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {canAssess && (
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-slate-50">
          <ClipboardCheck className="h-5 w-5 text-slate-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Gate Assessment</p>
            <p className="text-xs text-muted-foreground">
              {evaluation.metCount} of {evaluation.totalCount} ambitions met
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canPass && (
              <Button onClick={handlePass} disabled={submitAssessment.isPending}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Pass Gate {gate.gate_number}
              </Button>
            )}
            {canOverride && (
              <Button variant="outline" onClick={() => setShowOverrideModal(true)}>
                Override with Justification
              </Button>
            )}
          </div>
        </div>
      )}

      {gate.gate_assessments && gate.gate_assessments.length > 0 && (
        <div>
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-3"
            onClick={() => setShowHistory(!showHistory)}
          >
            <Clock className="h-4 w-4" />
            Assessment History ({gate.gate_assessments.length})
            {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showHistory && (
            <div className="space-y-2">
              {gate.gate_assessments.map((assessment) => (
                <div
                  key={assessment.assessment_id}
                  className={cn(
                    'p-3 rounded-lg border text-sm',
                    assessment.outcome === 'passed'
                      ? 'bg-green-50 border-green-200'
                      : assessment.outcome === 'override_approved'
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs',
                        assessment.outcome === 'passed'
                          ? 'bg-green-100 text-green-700'
                          : assessment.outcome === 'override_approved'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {assessment.outcome.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(assessment.assessment_date as string), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>
                  {assessment.override_justification && (
                    <p className="text-xs text-muted-foreground mt-1.5 italic">
                      Justification: {assessment.override_justification}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={showOverrideModal} onOpenChange={setShowOverrideModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Gate Override Required
            </AlertDialogTitle>
            <AlertDialogDescription>
              Not all stage ambitions are met. Provide a written justification for the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <Label>Justification for proceeding</Label>
            <Textarea
              value={overrideJustification}
              onChange={(e) => setOverrideJustification(e.target.value)}
              placeholder="Explain why it is appropriate to proceed..."
              rows={4}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Unmet: {evaluation.failedSoftGates.map((a) => ambitionDisplayName(a)).join(', ')}
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleOverride}
              disabled={!overrideJustification.trim()}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Approve Override & Log
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
