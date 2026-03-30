'use client'

import { useState } from 'react'
import { useGenerateTheory } from '@/lib/hooks/useTheoryOfWinning'
import { useSaveTheory } from '@/lib/hooks/useStagePlan'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Edit3,
  Check,
  Clock,
  History,
} from 'lucide-react'
import type {
  PlanAmbition,
  PlanWhereToPlay,
  PlanCapacity,
  PlanTheoryOfWinning,
  TheoryOfWinningRequest,
  GapAnalysisItem,
  RiskAssessmentItem,
} from '@/types'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { STAGE_NAMES } from '@/types'

interface TheoryOfWinningPanelProps {
  planId: number
  stageNumber: number
  campaignId: number
  ambitions: (PlanAmbition & { ambition_options?: { option_text: string; category: string } | null })[]
  whereToPlay: (PlanWhereToPlay & {
    wtp_categories?: { category_name: string } | null
    wtp_options?: { option_text: string } | null
  })[]
  capacities: (PlanCapacity & { capacity_options?: { option_text: string; category: string } | null })[]
  theories: PlanTheoryOfWinning[]
  currentTheory: PlanTheoryOfWinning | null
  campaignContext: TheoryOfWinningRequest['campaign_context']
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'bg-red-50 border-red-200 text-red-900',
  medium: 'bg-amber-50 border-amber-200 text-amber-900',
  low: 'bg-green-50 border-green-200 text-green-900',
}

const SEVERITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}

export function TheoryOfWinningPanel({
  planId,
  stageNumber,
  campaignId,
  ambitions,
  whereToPlay,
  capacities,
  theories,
  currentTheory,
  campaignContext,
}: TheoryOfWinningPanelProps) {
  const [editMode, setEditMode] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [showRisks, setShowRisks] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const generateTheory = useGenerateTheory()
  const saveTheory = useSaveTheory()

  const hasEnoughData = ambitions.length > 0 && whereToPlay.length > 0

  async function handleGenerate() {
    if (!hasEnoughData) return

    const request: TheoryOfWinningRequest = {
      campaign_id: campaignId,
      plan_id: planId,
      stage_number: stageNumber,
      stage_name: STAGE_NAMES[stageNumber as keyof typeof STAGE_NAMES],
      ambitions: ambitions.map((a) => ({
        text: a.ambition_options?.option_text || a.custom_text || '',
        target_value: a.target_value || undefined,
        target_unit: a.target_unit || undefined,
        category: a.ambition_options?.category || 'custom',
      })),
      where_to_play: whereToPlay.map((w) => ({
        category: w.wtp_categories?.category_name || '',
        option_text: w.wtp_options?.option_text || w.custom_text || '',
        is_exclusion: w.is_exclusion ?? false,
        priority: w.priority ?? 0,
        rationale: w.rationale || undefined,
      })),
      capacities: capacities.map((c) => ({
        category: c.capacity_options?.category || 'custom',
        option_text: c.capacity_options?.option_text || c.custom_text || '',
        status: c.status,
      })),
      campaign_context: campaignContext,
      previous_stage_theory: stageNumber > 1
        ? theories.find((t) => t.is_current)?.if_then_statement
        : undefined,
    }

    try {
      const result = await generateTheory.mutateAsync(request)

      await saveTheory.mutateAsync({
        plan_id: planId,
        if_then_statement: result.if_then_statement,
        ai_generated: true,
        ai_model: 'claude-sonnet-4-20250514',
        ai_prompt_snapshot: request as unknown as Record<string, unknown>,
        gap_analysis: result.gap_analysis as unknown as Record<string, unknown>,
        risk_assessment: result.risk_assessment as unknown as Record<string, unknown>,
        member_agency_assessment: result.member_agency_assessment,
        employer_response_plan: result.employer_response_considerations,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })

      toast.success('Theory of Winning generated and saved')
    } catch (error) {
      toast.error('Failed to generate theory. Please check your API key and try again.')
      console.error(error)
    }
  }

  async function handleSaveEdit() {
    if (!editedText.trim()) return

    try {
      await saveTheory.mutateAsync({
        plan_id: planId,
        if_then_statement: editedText,
        ai_generated: false,
        gap_analysis: currentTheory?.gap_analysis as Record<string, unknown> || {},
        risk_assessment: currentTheory?.risk_assessment as Record<string, unknown> || {},
        member_agency_assessment: currentTheory?.member_agency_assessment || undefined,
        employer_response_plan: currentTheory?.employer_response_plan || undefined,
        campaign_id: campaignId,
        stage_number: stageNumber,
      })

      setEditMode(false)
      toast.success('Theory saved')
    } catch {
      toast.error('Failed to save theory')
    }
  }

  const gapAnalysis = currentTheory?.gap_analysis as GapAnalysisItem[] | null
  const riskAssessment = currentTheory?.risk_assessment as RiskAssessmentItem[] | null

  if (!hasEnoughData) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900">Step 3: Theory of Winning</h3>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered causal logic chain connecting your strategic choices to your ambitions.
          </p>
        </div>

        <div className="text-center py-12 rounded-lg border-2 border-dashed border-slate-200">
          <Sparkles className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">Complete Steps 1 & 2 first</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add at least 1 Ambition and 1 Where to Play choice to generate your Theory of Winning.
          </p>
          <div className="flex items-center justify-center gap-4 mt-4 text-xs">
            <span className={cn('flex items-center gap-1', ambitions.length > 0 ? 'text-green-600' : 'text-muted-foreground')}>
              {ambitions.length > 0 ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {ambitions.length} ambition{ambitions.length !== 1 ? 's' : ''} set
            </span>
            <span className={cn('flex items-center gap-1', whereToPlay.length > 0 ? 'text-green-600' : 'text-muted-foreground')}>
              {whereToPlay.length > 0 ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {whereToPlay.length} where-to-play choice{whereToPlay.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Step 3: Theory of Winning</h3>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated causal logic chain linking your choices to your ambitions, with gap analysis and risk assessment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {theories.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-4 w-4 mr-1" />
              History ({theories.length})
            </Button>
          )}
          <Button
            onClick={handleGenerate}
            disabled={generateTheory.isPending || saveTheory.isPending}
            size="sm"
          >
            {generateTheory.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                Analysing...
              </>
            ) : currentTheory ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" />
                Generate Theory
              </>
            )}
          </Button>
        </div>
      </div>

      {generateTheory.isPending && (
        <div className="flex items-center gap-3 p-6 rounded-lg bg-blue-50 border border-blue-200">
          <RefreshCw className="h-5 w-5 text-blue-600 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">Analysing your strategic choices...</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Reviewing {ambitions.length} ambitions and {whereToPlay.length} where-to-play choices.
            </p>
          </div>
        </div>
      )}

      {currentTheory && !generateTheory.isPending && (
        <div className="space-y-4">
          {/* Main if/then statement */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">If/Then Statement</CardTitle>
                <div className="flex items-center gap-2">
                  {currentTheory.ai_generated && (
                    <Badge className="bg-purple-100 text-purple-700 text-xs" variant="secondary">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Generated
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">v{currentTheory.version}</span>
                  {!editMode ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditedText(currentTheory.if_then_statement)
                        setEditMode(true)
                      }}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" onClick={handleSaveEdit}>
                        <Check className="h-4 w-4 mr-1" />
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {editMode ? (
                <Textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={6}
                  className="text-sm"
                  autoFocus
                />
              ) : (
                <p className="text-sm leading-relaxed text-slate-700 italic">
                  &ldquo;{currentTheory.if_then_statement}&rdquo;
                </p>
              )}
            </CardContent>
          </Card>

          {/* Gap Analysis */}
          {gapAnalysis && gapAnalysis.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">Gap Analysis</h4>
              {gapAnalysis.map((gap, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-lg border text-sm',
                    SEVERITY_COLORS[gap.severity] || SEVERITY_COLORS.medium
                  )}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={cn('text-xs', SEVERITY_BADGE[gap.severity])} variant="secondary">
                          {gap.severity.toUpperCase()}
                        </Badge>
                        <span className="text-xs font-medium capitalize">
                          {gap.gap_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="font-medium">{gap.description}</p>
                      {gap.recommendation && (
                        <p className="text-xs mt-1 opacity-80">
                          <strong>Recommendation:</strong> {gap.recommendation}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Risk Assessment (collapsible) */}
          {riskAssessment && riskAssessment.length > 0 && (
            <div>
              <button
                className="flex items-center gap-2 w-full text-left text-sm font-semibold text-slate-900 mb-2"
                onClick={() => setShowRisks(!showRisks)}
              >
                {showRisks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Risk Assessment ({riskAssessment.length} risks)
              </button>
              {showRisks && (
                <div className="space-y-2">
                  {riskAssessment.map((risk, i) => (
                    <div key={i} className="p-3 rounded-lg border bg-slate-50 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={cn('text-xs', SEVERITY_BADGE[risk.likelihood])} variant="secondary">
                          Likelihood: {risk.likelihood}
                        </Badge>
                        <Badge className={cn('text-xs', SEVERITY_BADGE[risk.impact])} variant="secondary">
                          Impact: {risk.impact}
                        </Badge>
                      </div>
                      <p className="font-medium">{risk.risk}</p>
                      {risk.mitigation && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <strong>Mitigation:</strong> {risk.mitigation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Member Agency Assessment */}
          {currentTheory.member_agency_assessment && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Member Agency Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700">{currentTheory.member_agency_assessment}</p>
              </CardContent>
            </Card>
          )}

          {/* Employer Response */}
          {currentTheory.employer_response_plan && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Employer Response Considerations</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700">{currentTheory.employer_response_plan}</p>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            Generated {format(new Date(currentTheory.created_at as string), 'dd MMM yyyy HH:mm')}
            {currentTheory.ai_model && ` · ${currentTheory.ai_model}`}
          </p>
        </div>
      )}

      {/* Version history */}
      {showHistory && theories.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Version History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {theories.map((theory) => (
              <div
                key={theory.theory_id}
                className={cn(
                  'p-3 rounded-lg border text-xs',
                  theory.is_current ? 'border-blue-300 bg-blue-50' : 'bg-slate-50'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Version {theory.version}</span>
                  <div className="flex items-center gap-2">
                    {theory.is_current && <Badge className="bg-blue-100 text-blue-700 text-xs" variant="secondary">Current</Badge>}
                    {theory.ai_generated && <Sparkles className="h-3 w-3 text-purple-500" />}
                    <span className="text-muted-foreground">
                      {format(new Date(theory.created_at as string), 'dd MMM HH:mm')}
                    </span>
                  </div>
                </div>
                <p className="text-muted-foreground mt-1 line-clamp-2 italic">{theory.if_then_statement}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
