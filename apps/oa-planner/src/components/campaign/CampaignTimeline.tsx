'use client'

import Link from 'next/link'
import { format, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { STAGE_NAMES } from '@/types'
import { CheckCircle, Lock, AlertTriangle, Circle, Clock } from 'lucide-react'

interface StageData {
  stage_number: number
  stage_name: string
  status: string
  planned_start_date: string | null
  planned_end_date: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
}

interface GateData {
  gate_number: number
  gate_name: string
  enforcement_type: string
  gate_criteria?: { is_met: boolean; is_hard_gate: boolean }[]
  gate_assessments?: { outcome: string }[]
}

interface CampaignTimelineProps {
  stages: StageData[]
  gates: GateData[]
  campaignId: number
  paboDate?: string | null
  expiryDate?: string | null
}

function getGateStatus(gate: GateData): 'passed' | 'blocked' | 'pending' | 'future' {
  const latestAssessment = gate.gate_assessments?.[0]
  if (latestAssessment?.outcome === 'passed' || latestAssessment?.outcome === 'override_approved') {
    return 'passed'
  }
  const criteria = gate.gate_criteria || []
  if (criteria.some((c) => !c.is_met && c.is_hard_gate)) return 'blocked'
  if (criteria.some((c) => !c.is_met)) return 'pending'
  return 'future'
}

const GATE_COLORS = {
  passed: 'bg-green-500 text-white border-green-500',
  blocked: 'bg-red-500 text-white border-red-500',
  pending: 'bg-amber-400 text-white border-amber-400',
  future: 'bg-slate-200 text-slate-500 border-slate-200',
}

const STAGE_COLORS = {
  active: 'bg-blue-100 border-blue-300 text-blue-900',
  completed: 'bg-green-100 border-green-300 text-green-900',
  blocked: 'bg-red-100 border-red-300 text-red-900',
  draft: 'bg-slate-50 border-slate-200 text-slate-600',
}

export function CampaignTimeline({ stages, gates, campaignId, paboDate, expiryDate }: CampaignTimelineProps) {
  const daysToExpiry = expiryDate ? differenceInDays(new Date(expiryDate), new Date()) : null
  const daysToPabo = paboDate ? differenceInDays(new Date(paboDate), new Date()) : null

  return (
    <div className="space-y-4">
      {/* Expiry warning */}
      {expiryDate && (
        <div className={cn(
          'flex items-center gap-2 p-3 rounded-lg text-sm',
          (daysToExpiry || 0) < 180 ? 'bg-red-50 border border-red-200 text-red-800' :
          (daysToExpiry || 0) < 365 ? 'bg-amber-50 border border-amber-200 text-amber-800' :
          'bg-green-50 border border-green-200 text-green-800'
        )}>
          <Clock className="h-4 w-4 flex-shrink-0" />
          <span>
            Agreement expires <strong>{format(new Date(expiryDate), 'dd MMM yyyy')}</strong>
            {daysToPabo !== null && daysToPabo > 0 && (
              <> · PABO available in <strong>{daysToPabo} days</strong></>
            )}
            {daysToPabo !== null && daysToPabo <= 0 && (
              <> · <strong>PABO is available now!</strong></>
            )}
          </span>
        </div>
      )}

      {/* Timeline */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-center min-w-[600px]">
          {stages.sort((a, b) => a.stage_number - b.stage_number).map((stage, i) => {
            const gate = gates.find((g) => g.gate_number === stage.stage_number)
            const gateStatus = gate ? getGateStatus(gate) : 'future'
            const stageColorClass = STAGE_COLORS[stage.status as keyof typeof STAGE_COLORS] || STAGE_COLORS.draft

            return (
              <div key={stage.stage_number} className="flex items-center">
                {/* Stage block */}
                <Link
                  href={`/campaigns/${campaignId}/stage/${stage.stage_number}`}
                  className={cn(
                    'flex flex-col items-center p-3 rounded-lg border-2 min-w-[120px] text-center hover:opacity-90 transition-opacity cursor-pointer',
                    stageColorClass
                  )}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mb-1',
                    stage.status === 'active' ? 'bg-blue-600 text-white' :
                    stage.status === 'completed' ? 'bg-green-600 text-white' :
                    stage.status === 'blocked' ? 'bg-red-500 text-white' :
                    'bg-slate-300 text-slate-600'
                  )}>
                    {stage.stage_number}
                  </div>
                  <p className="text-xs font-semibold leading-tight">{STAGE_NAMES[stage.stage_number as keyof typeof STAGE_NAMES]}</p>
                  {stage.planned_start_date && (
                    <p className="text-xs opacity-70 mt-1">
                      {format(new Date(stage.planned_start_date), 'dd MMM')}
                    </p>
                  )}
                  <div className={cn(
                    'text-xs px-1.5 py-0.5 rounded mt-1 capitalize',
                    stage.status === 'active' ? 'bg-blue-200 text-blue-800' :
                    stage.status === 'completed' ? 'bg-green-200 text-green-800' :
                    stage.status === 'blocked' ? 'bg-red-200 text-red-800' :
                    'bg-slate-100 text-slate-500'
                  )}>
                    {stage.status}
                  </div>
                </Link>

                {/* Gate connector (not after last stage) */}
                {i < stages.length - 1 && gate && (
                  <div className="flex flex-col items-center mx-1">
                    <Link
                      href={`/campaigns/${campaignId}/gate/${gate.gate_number}`}
                      className={cn(
                        'w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors hover:opacity-80',
                        GATE_COLORS[gateStatus]
                      )}
                      title={`Gate ${gate.gate_number}: ${gate.gate_name}`}
                    >
                      {gateStatus === 'passed' ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : gateStatus === 'blocked' ? (
                        <Lock className="h-4 w-4" />
                      ) : gateStatus === 'pending' ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </Link>
                    <span className="text-xs text-muted-foreground mt-1 whitespace-nowrap">G{gate.gate_number}</span>
                  </div>
                )}
              </div>
            )
          })}

          {/* PABO marker */}
          {paboDate && (
            <div className="flex flex-col items-center ml-2">
              <div className="w-8 h-8 rounded bg-red-600 text-white flex items-center justify-center text-xs font-bold">
                PABO
              </div>
              <span className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                {format(new Date(paboDate), 'dd MMM')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
