'use client'

import { useState } from 'react'
import { useUpdateGateCriterion, useSubmitGateAssessment } from '@/lib/hooks/useGateAssessment'
import { evaluateGate, formatMetricValue } from '@/lib/utils/gate-logic'
import { Button } from '@/components/ui/button'
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
import { GATE_NAMES } from '@/types'
import type { GateCriterion, GateAssessment as GateAssessmentType, GateDefinition } from '@/types'
import { toast } from 'sonner'

interface GateAssessmentProps {
  gate: GateDefinition & {
    gate_criteria: GateCriterion[]
    gate_assessments: GateAssessmentType[]
  }
  campaignId: number
  canAssess: boolean
}

export function GateAssessmentComponent({ gate, campaignId, canAssess }: GateAssessmentProps) {
  const [editingCriterionId, setEditingCriterionId] = useState<number | null>(null)
  const [criterionValues, setCriterionValues] = useState<Record<number, string>>({})
  const [criterionNotes, setCriterionNotes] = useState<Record<number, string>>({})
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [overrideJustification, setOverrideJustification] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const updateCriterion = useUpdateGateCriterion()
  const submitAssessment = useSubmitGateAssessment()

  const evaluation = evaluateGate(gate.gate_criteria)

  const canPass = evaluation.allMet
  const canOverride = !evaluation.hardGatesMet ? false : !evaluation.allMet
  const isHardBlocked = !evaluation.hardGatesMet

  async function handleSaveCriterion(criterionId: number) {
    const value = criterionValues[criterionId]
    const notes = criterionNotes[criterionId]

    try {
      await updateCriterion.mutateAsync({
        criterion_id: criterionId,
        current_value: value,
        evidence_notes: notes,
        campaign_id: campaignId,
        gate_number: gate.gate_number,
      })
      setEditingCriterionId(null)
      toast.success('Criterion updated')
    } catch {
      toast.error('Failed to update criterion')
    }
  }

  async function handlePass() {
    const snapshot = gate.gate_criteria.reduce<Record<string, string | null>>((acc, c) => {
      acc[c.criterion_name] = c.current_value
      return acc
    }, {})

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

    const snapshot = gate.gate_criteria.reduce<Record<string, string | null>>((acc, c) => {
      acc[c.criterion_name] = c.current_value
      return acc
    }, {})

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

  return (
    <div className="space-y-6">
      {/* Gate header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm',
            evaluation.allMet ? 'bg-green-100 text-green-700' :
            isHardBlocked ? 'bg-red-100 text-red-700' :
            'bg-amber-100 text-amber-700'
          )}>
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
              Between Stage {gate.gate_number} and Stage {gate.gate_number + 1}
            </p>
          </div>
          <Badge
            className={cn(
              'ml-auto text-xs',
              evaluation.allMet ? 'bg-green-100 text-green-700' :
              isHardBlocked ? 'bg-red-100 text-red-700' :
              'bg-amber-100 text-amber-700'
            )}
            variant="secondary"
          >
            {evaluation.metCount}/{evaluation.totalCount} criteria met
          </Badge>
        </div>

        {isHardBlocked && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            <Lock className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Hard gate blocked.</strong> {evaluation.failedHardGates.length} hard gate criterion/criteria must be met before progression is possible.
              This cannot be overridden.
            </p>
          </div>
        )}

        {gate.enforcement_type === 'soft' && !evaluation.allMet && !isHardBlocked && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Soft gate — override possible.</strong> Not all criteria are met. Progression can proceed with written justification.
            </p>
          </div>
        )}
      </div>

      {/* Criteria list */}
      <div className="space-y-3">
        {gate.gate_criteria.map((criterion) => {
          const isMet = criterion.is_met
          const isEditing = editingCriterionId === criterion.criterion_id
          const currentVal = criterionValues[criterion.criterion_id] ?? criterion.current_value ?? ''

          return (
            <Card key={criterion.criterion_id} className={cn(
              'transition-colors',
              isMet ? 'border-green-200' :
              criterion.is_hard_gate ? 'border-red-300 bg-red-50/50' :
              'border-slate-200'
            )}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {isMet ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : criterion.is_hard_gate ? (
                      <Lock className="h-5 w-5 text-red-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-slate-300" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{criterion.criterion_name}</p>
                      {criterion.is_hard_gate && (
                        <Badge className="bg-red-100 text-red-700 text-xs" variant="secondary">
                          <Lock className="h-3 w-3 mr-1" />
                          Hard Gate
                        </Badge>
                      )}
                    </div>

                    {criterion.description && (
                      <p className="text-xs text-muted-foreground">{criterion.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted-foreground">
                        Target: <strong>{formatMetricValue(criterion.target_value, criterion.metric_type as 'percentage' | 'count' | 'boolean' | 'date')}</strong>
                      </span>
                      <span className={cn(
                        'font-semibold',
                        isMet ? 'text-green-700' : 'text-red-700'
                      )}>
                        Current: {formatMetricValue(criterion.current_value, criterion.metric_type as 'percentage' | 'count' | 'boolean' | 'date')}
                      </span>
                    </div>

                    {isEditing && canAssess ? (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs whitespace-nowrap">Current value:</Label>
                          {criterion.metric_type === 'boolean' ? (
                            <select
                              value={currentVal}
                              onChange={(e) => setCriterionValues((p) => ({ ...p, [criterion.criterion_id]: e.target.value }))}
                              className="h-8 text-xs border rounded px-2"
                            >
                              <option value="">Select...</option>
                              <option value="true">Yes</option>
                              <option value="false">No</option>
                            </select>
                          ) : (
                            <Input
                              type={criterion.metric_type === 'date' ? 'date' : 'number'}
                              value={currentVal}
                              onChange={(e) => setCriterionValues((p) => ({ ...p, [criterion.criterion_id]: e.target.value }))}
                              className="h-8 text-xs w-28"
                              placeholder={criterion.metric_type === 'percentage' ? '0-100' : ''}
                            />
                          )}
                          {criterion.metric_type === 'percentage' && <span className="text-xs text-muted-foreground">%</span>}
                        </div>
                        <div>
                          <Label className="text-xs">Evidence notes:</Label>
                          <Textarea
                            value={criterionNotes[criterion.criterion_id] ?? criterion.evidence_notes ?? ''}
                            onChange={(e) => setCriterionNotes((p) => ({ ...p, [criterion.criterion_id]: e.target.value }))}
                            placeholder="What's the evidence for this value?"
                            rows={2}
                            className="mt-1 text-xs"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSaveCriterion(criterion.criterion_id)}>
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingCriterionId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {criterion.evidence_notes && (
                          <p className="text-xs text-muted-foreground italic">{criterion.evidence_notes}</p>
                        )}
                        {canAssess && (
                          <button
                            onClick={() => {
                              setCriterionValues((p) => ({ ...p, [criterion.criterion_id]: criterion.current_value || '' }))
                              setEditingCriterionId(criterion.criterion_id)
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

      {/* Assessment actions */}
      {canAssess && (
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-slate-50">
          <ClipboardCheck className="h-5 w-5 text-slate-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Gate Assessment</p>
            <p className="text-xs text-muted-foreground">
              {evaluation.metCount} of {evaluation.totalCount} criteria met
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canPass && (
              <Button onClick={handlePass} disabled={submitAssessment.isPending}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Pass Gate {gate.gate_number}
              </Button>
            )}
            {canOverride && gate.enforcement_type === 'soft' && (
              <Button variant="outline" onClick={() => setShowOverrideModal(true)}>
                Override with Justification
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Assessment history */}
      {gate.gate_assessments && gate.gate_assessments.length > 0 && (
        <div>
          <button
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
                    assessment.outcome === 'passed' ? 'bg-green-50 border-green-200' :
                    assessment.outcome === 'override_approved' ? 'bg-amber-50 border-amber-200' :
                    'bg-slate-50 border-slate-200'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs',
                        assessment.outcome === 'passed' ? 'bg-green-100 text-green-700' :
                        assessment.outcome === 'override_approved' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
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
                  {assessment.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{assessment.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Override modal */}
      <AlertDialog open={showOverrideModal} onOpenChange={setShowOverrideModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Gate Override Required
            </AlertDialogTitle>
            <AlertDialogDescription>
              Not all gate criteria are met. To proceed, you must provide a written justification that will be logged in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <Label>Justification for proceeding</Label>
            <Textarea
              value={overrideJustification}
              onChange={(e) => setOverrideJustification(e.target.value)}
              placeholder="Explain why it is appropriate to proceed to the next stage despite not fully meeting gate criteria..."
              rows={4}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Unmet criteria: {evaluation.failedSoftGates.map((c) => c.criterion_name).join(', ')}
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
