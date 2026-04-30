'use client'

/**
 * Phase 2 Wizard Launch Card
 *
 * Shown on the Campaign detail page (or Stage 6 capacity panel) to offer
 * entry into the "Begin Phase 2: Bargaining to Win" wizard.
 *
 * Two modes:
 *   - continuation: launched from Phase 1 Stage 6; pre-fills active ambitions
 *   - standalone: launched from the campaign overview at any time
 *
 * Visual pattern mirrors SocWizardLaunchCard.
 */

import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Scale, ArrowRight } from 'lucide-react'

// ── Shared wizard data type (used by all step components) ─────────────────

export interface PriorBallot {
  ballot_kind: string
  conducted_at: string
  eligible_count: string
  votes_yes: string
  votes_no: string
  outcome: string
  notes: string
}

export interface KeyDispute {
  topic: string
  oa_position: string
  employer_position: string
  urgency: number
  notes: string
}

export interface WorkerSupportEstimate {
  percent_supportive_estimated: number | ''
  basis_of_estimate: string
  notes: string
}

export interface Phase2WizardData {
  // BargainingTimingStep
  bargaining_commenced_at: string
  nerr_status: 'not_issued' | 'issued' | 'superseded' | 'unknown'
  nerr_issued_at: string

  // EmployerBehaviourStep (standalone only)
  employer_ballot_intent: string
  prior_employer_ballots: PriorBallot[]
  key_disputes: KeyDispute[]

  // WorkerSupportStep (standalone only)
  worker_support_estimate: WorkerSupportEstimate

  // CarryForwardStep
  carryforward_ambition_ids: number[]
  carryforward_situation_analysis_id: number | null

  // ClaimPackageStep
  claim_summary: string

  // SeedPackStep
  pia_seed_pack: 'offshore_standard' | 'shore_based_standard'
}

export const DEFAULT_WIZARD_DATA: Phase2WizardData = {
  bargaining_commenced_at: '',
  nerr_status: 'unknown',
  nerr_issued_at: '',
  employer_ballot_intent: '',
  prior_employer_ballots: [],
  key_disputes: [],
  worker_support_estimate: {
    percent_supportive_estimated: '',
    basis_of_estimate: '',
    notes: '',
  },
  carryforward_ambition_ids: [],
  carryforward_situation_analysis_id: null,
  claim_summary: '',
  pia_seed_pack: 'offshore_standard',
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  campaignId: number
  mode?: 'continuation' | 'standalone'
}

export function Phase2WizardLaunchCard({ campaignId, mode = 'standalone' }: Props) {
  const router = useRouter()

  function launch() {
    router.push(`/campaigns/${campaignId}/bargaining-wizard?mode=${mode}`)
  }

  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-900 inline-flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-slate-500" />
              Begin Phase 2: Bargaining to Win
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {mode === 'continuation'
                ? 'Continue from your Phase 1 work. Carry forward ambitions and situation analysis, then set up the bargaining context to unlock stages 7–11.'
                : 'Set up the Bargaining to Win phase from scratch. Capture bargaining timing, employer behaviour, worker support, claims, and PIA seed pack to unlock stages 7–11.'}
            </p>
          </div>
          <Button size="sm" onClick={launch} className="shrink-0">
            {mode === 'continuation' ? 'Continue to Phase 2' : 'Begin Bargaining'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
