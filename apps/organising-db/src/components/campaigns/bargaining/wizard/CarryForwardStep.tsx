'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EurekaLoadingSpinner } from '@/components/ui/eureka-loading'
import { CheckSquare, Square, FileText } from 'lucide-react'
import type { Phase2WizardData } from './Phase2WizardLaunchCard'

interface Props {
  campaignId: number
  wizardData: Phase2WizardData
  onChange: (updates: Partial<Phase2WizardData>) => void
  mode: 'continuation' | 'standalone'
}

interface CampaignAmbition {
  campaign_ambition_id: number
  category: string
  label: string
  target_value: string | null
  target_unit: string | null
}

interface SituationAnalysis {
  situation_id: number
  version: number
  is_current: boolean
  employer_interaction_state: string | null
  created_at: string
}

export function CarryForwardStep({
  campaignId,
  wizardData,
  onChange,
  mode,
}: Props) {
  const supabase = createClient()

  const ambitionsQuery = useQuery({
    queryKey: ['campaign-ambitions-carryforward', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_ambitions')
        .select(
          'campaign_ambition_id, category, label, target_value, target_unit'
        )
        .eq('campaign_id', campaignId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as CampaignAmbition[]
    },
  })

  const situationQuery = useQuery({
    queryKey: ['campaign-situation-analyses-carryforward', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_situation_analyses')
        .select('situation_id, version, is_current, employer_interaction_state, created_at')
        .eq('campaign_id', campaignId)
        .order('version', { ascending: false })
      if (error) throw error
      return (data ?? []) as SituationAnalysis[]
    },
  })

  // Auto-select current situation analysis
  useEffect(() => {
    if (!situationQuery.data) return
    if (wizardData.carryforward_situation_analysis_id !== null) return
    const current = situationQuery.data.find((s) => s.is_current)
    if (current) {
      onChange({ carryforward_situation_analysis_id: current.situation_id })
    }
  }, [situationQuery.data, wizardData.carryforward_situation_analysis_id, onChange])

  // In continuation mode: auto-check all ambitions on first load
  useEffect(() => {
    if (mode !== 'continuation') return
    if (!ambitionsQuery.data) return
    if (wizardData.carryforward_ambition_ids.length > 0) return
    onChange({
      carryforward_ambition_ids: ambitionsQuery.data.map(
        (a) => a.campaign_ambition_id
      ),
    })
  }, [ambitionsQuery.data, mode, wizardData.carryforward_ambition_ids.length, onChange])

  function toggleAmbition(id: number) {
    const current = wizardData.carryforward_ambition_ids
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id]
    onChange({ carryforward_ambition_ids: next })
  }

  const CATEGORY_LABELS: Record<string, string> = {
    membership: 'Membership',
    member_leaders: 'Member leaders',
    activism: 'Activism',
    industrial_outcomes: 'Industrial outcomes',
  }

  const EMPLOYER_STATE_LABELS: Record<string, string> = {
    no_engagement: 'No engagement',
    preemptive_setup: 'Pre-emptive setup',
    bargaining_underway: 'Bargaining underway',
    agreement_balloted: 'Agreement balloted',
    employer_delaying: 'Employer delaying',
    industrial_action_phase: 'Industrial action phase',
    post_settlement: 'Post-settlement',
    other: 'Other',
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CheckSquare className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold">Carry forward</h2>
          </div>
          <p className="text-xs text-slate-600">
            Choose which Phase 1 ambitions to carry into Stage 7, and which
            situation analysis version to clone as the Phase 2 baseline.
          </p>
        </div>

        {/* Ambitions */}
        <div className="space-y-3">
          <Label>Campaign ambitions to carry forward</Label>
          {ambitionsQuery.isLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <EurekaLoadingSpinner size="sm" /> Loading ambitions…
            </div>
          )}
          {!ambitionsQuery.isLoading && (ambitionsQuery.data ?? []).length === 0 && (
            <p className="text-xs text-slate-500 italic">
              No campaign ambitions found. You can add ambitions on the Campaign
              Plan tab and return here, or proceed without carrying any forward.
            </p>
          )}
          <div className="space-y-1.5">
            {(ambitionsQuery.data ?? []).map((ambition) => {
              const checked = wizardData.carryforward_ambition_ids.includes(
                ambition.campaign_ambition_id
              )
              return (
                <button
                  key={ambition.campaign_ambition_id}
                  onClick={() => toggleAmbition(ambition.campaign_ambition_id)}
                  className="w-full flex items-start gap-2 px-3 py-2 rounded-md border text-left hover:bg-slate-50 transition-colors"
                >
                  {checked ? (
                    <CheckSquare className="h-4 w-4 text-slate-900 mt-0.5 shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800">{ambition.label}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {CATEGORY_LABELS[ambition.category] ?? ambition.category}
                      </Badge>
                      {ambition.target_value && (
                        <span className="text-[11px] text-slate-500">
                          Target: {ambition.target_value}
                          {ambition.target_unit ? ` ${ambition.target_unit}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Situation analysis */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            <Label>Situation analysis version to carry forward</Label>
          </div>
          {situationQuery.isLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <EurekaLoadingSpinner size="sm" /> Loading situation analyses…
            </div>
          )}
          {!situationQuery.isLoading && (situationQuery.data ?? []).length === 0 && (
            <p className="text-xs text-slate-500 italic">
              No situation analyses found. You can create one on the Overview tab
              before proceeding.
            </p>
          )}
          <div className="space-y-1.5">
            {(situationQuery.data ?? []).map((sa) => {
              const selected =
                wizardData.carryforward_situation_analysis_id === sa.situation_id
              return (
                <button
                  key={sa.situation_id}
                  onClick={() =>
                    onChange({
                      carryforward_situation_analysis_id: sa.situation_id,
                    })
                  }
                  className={
                    'w-full flex items-start gap-2 px-3 py-2 rounded-md border text-left transition-colors ' +
                    (selected
                      ? 'border-slate-900 bg-slate-50'
                      : 'hover:bg-slate-50')
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        Version {sa.version}
                      </span>
                      {sa.is_current && (
                        <Badge variant="success" className="text-[10px]">
                          Current
                        </Badge>
                      )}
                      {selected && (
                        <Badge variant="secondary" className="text-[10px]">
                          Selected
                        </Badge>
                      )}
                    </div>
                    {sa.employer_interaction_state && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        State:{' '}
                        {EMPLOYER_STATE_LABELS[sa.employer_interaction_state] ??
                          sa.employer_interaction_state}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          {wizardData.carryforward_situation_analysis_id !== null && (
            <p className="text-xs text-slate-500">
              The selected version will be cloned and incremented (v
              {(situationQuery.data?.find(
                (s) => s.situation_id === wizardData.carryforward_situation_analysis_id
              )?.version ?? 0) + 1}
              ) as the Phase 2 baseline. The original is preserved.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
