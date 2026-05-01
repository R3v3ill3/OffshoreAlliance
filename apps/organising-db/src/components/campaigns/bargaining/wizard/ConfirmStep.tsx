'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { Phase2WizardData } from './Phase2WizardLaunchCard'
import type { KeyDispute as WizardKeyDispute } from './Phase2WizardLaunchCard'

interface Props {
  campaignId: number
  wizardData: Phase2WizardData
  onChange: (updates: Partial<Phase2WizardData>) => void
  mode: 'continuation' | 'standalone'
}

export function ConfirmStep({ campaignId, wizardData, mode }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (!wizardData.bargaining_commenced_at) {
      toast.error('Bargaining commenced date is required.')
      return
    }

    setSubmitting(true)
    setError(null)

    // Build situation_overrides from wizard-collected fields
    const situationOverrides: Record<string, unknown> = {}
    if (mode === 'standalone') {
      if (wizardData.prior_employer_ballots.length > 0) {
        situationOverrides.prior_employer_ballots = wizardData.prior_employer_ballots
      }
      if (wizardData.key_disputes.length > 0) {
        situationOverrides.key_disputes = wizardData.key_disputes
      }
      if (wizardData.worker_support_estimate.percent_supportive_estimated !== '') {
        situationOverrides.worker_support_estimate = wizardData.worker_support_estimate
      }
      if (wizardData.nerr_status !== 'unknown') {
        situationOverrides.nerr_status = wizardData.nerr_status
      }
      if (wizardData.nerr_issued_at) {
        situationOverrides.nerr_issued_at = wizardData.nerr_issued_at
      }
      if (wizardData.employer_ballot_intent) {
        situationOverrides.employer_ballot_intent = wizardData.employer_ballot_intent
      }
    } else if (mode === 'continuation' && wizardData.carryforward_situation_analysis_id !== null) {
      // In continuation mode, derive key_disputes from the extended top_issues of the
      // selected SA row (entries where oa_position or employer_position is set).
      // wizardData.key_disputes from EmployerBehaviourStep (Phase 4) may also be used;
      // fall back to SA fetch to ensure key disputes are populated.
      const disputesFromWizard: WizardKeyDispute[] = wizardData.key_disputes
      if (disputesFromWizard.length > 0) {
        situationOverrides.key_disputes = disputesFromWizard
      } else {
        // Fetch the carry-forward SA row and derive key_disputes from extended top_issues
        try {
          const { data: saRow } = await supabase
            .from('campaign_situation_analyses')
            .select('top_issues')
            .eq('situation_id', wizardData.carryforward_situation_analysis_id)
            .maybeSingle()

          if (saRow) {
            const topIssues: Array<{
              label?: string
              oa_position?: string
              employer_position?: string
            }> = Array.isArray(saRow.top_issues) ? saRow.top_issues : []

            const derived: WizardKeyDispute[] = topIssues
              .filter((issue) => issue.oa_position || issue.employer_position)
              .map((issue) => ({
                topic: issue.label ?? '',
                oa_position: issue.oa_position ?? '',
                employer_position: issue.employer_position ?? '',
                urgency: 3,
                notes: '',
              }))

            if (derived.length > 0) {
              situationOverrides.key_disputes = derived
            }
          }
        } catch {
          // Non-fatal: proceed without key_disputes override
        }
      }
    }

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'begin_bargaining_phase',
        {
          p_campaign_id: campaignId,
          p_bargaining_commenced_at: wizardData.bargaining_commenced_at,
          p_carryforward_ambition_ids:
            wizardData.carryforward_ambition_ids.length > 0
              ? wizardData.carryforward_ambition_ids
              : null,
          p_carryforward_situation_analysis_id:
            wizardData.carryforward_situation_analysis_id,
          p_claim_summary: wizardData.claim_summary || null,
          p_pia_seed_pack: wizardData.pia_seed_pack,
          p_situation_overrides:
            Object.keys(situationOverrides).length > 0
              ? situationOverrides
              : null,
          p_setup_mode: mode,
        }
      )

      if (rpcError) throw new Error(rpcError.message)

      const result = data as {
        success: boolean
        campaign_id: number
        stage_7_plan_id: number
        setup_mode: string
      }

      if (!result.success) {
        throw new Error('begin_bargaining_phase returned success=false')
      }

      toast.success('Phase 2 begun — welcome to Bargaining to Win!')
      router.push(`/campaigns/${campaignId}/bargaining`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
      toast.error(`Failed to begin Phase 2: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  const NERR_LABELS: Record<string, string> = {
    not_issued: 'Not yet issued',
    issued: 'Issued',
    superseded: 'Superseded',
    unknown: 'Unknown',
  }

  const PACK_LABELS: Record<string, string> = {
    offshore_standard: 'Offshore Standard',
    shore_based_standard: 'Shore-Based Standard',
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold mb-1">Confirm &amp; begin Phase 2</h2>
          <p className="text-xs text-slate-600">
            Review the summary below. Confirming will create stage plans 7–11,
            seed the chosen PIA pack, and transition this campaign to the
            Bargaining to Win phase. This action cannot be undone.
          </p>
        </div>

        {/* Summary grid */}
        <div className="rounded-md border divide-y">
          <SummaryRow label="Mode">
            <Badge variant="secondary">
              {mode === 'continuation' ? 'Continuation' : 'Standalone'}
            </Badge>
          </SummaryRow>
          <SummaryRow label="Bargaining commenced">
            <span className="font-medium">
              {wizardData.bargaining_commenced_at || '—'}
            </span>
          </SummaryRow>
          <SummaryRow label="NERR status">
            {NERR_LABELS[wizardData.nerr_status] ?? wizardData.nerr_status}
            {wizardData.nerr_issued_at && (
              <span className="ml-2 text-slate-500">
                ({wizardData.nerr_issued_at})
              </span>
            )}
          </SummaryRow>
          {mode === 'standalone' && (
            <>
              <SummaryRow label="Employer ballot intent">
                {wizardData.employer_ballot_intent || 'Not set'}
              </SummaryRow>
              <SummaryRow label="Prior employer ballots">
                {wizardData.prior_employer_ballots.length === 0
                  ? 'None'
                  : `${wizardData.prior_employer_ballots.length} recorded`}
              </SummaryRow>
              <SummaryRow label="Key disputes">
                {wizardData.key_disputes.length === 0
                  ? 'None'
                  : `${wizardData.key_disputes.length} recorded`}
              </SummaryRow>
              <SummaryRow label="Worker support estimate">
                {wizardData.worker_support_estimate.percent_supportive_estimated === ''
                  ? 'Not set'
                  : `${wizardData.worker_support_estimate.percent_supportive_estimated}%`}
              </SummaryRow>
            </>
          )}
          <SummaryRow label="Ambitions to carry forward">
            {wizardData.carryforward_ambition_ids.length === 0
              ? 'None'
              : `${wizardData.carryforward_ambition_ids.length} selected`}
          </SummaryRow>
          <SummaryRow label="Situation analysis">
            {wizardData.carryforward_situation_analysis_id === null
              ? 'None'
              : `ID ${wizardData.carryforward_situation_analysis_id} (will be cloned)`}
          </SummaryRow>
          <SummaryRow label="Claim summary">
            {wizardData.claim_summary ? (
              <span className="line-clamp-2 text-xs">
                {wizardData.claim_summary}
              </span>
            ) : (
              'Not set'
            )}
          </SummaryRow>
          <SummaryRow label="PIA seed pack">
            <Badge variant="outline">
              {PACK_LABELS[wizardData.pia_seed_pack] ?? wizardData.pia_seed_pack}
            </Badge>
          </SummaryRow>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-red-800">
                Could not begin Phase 2
              </div>
              <div className="text-xs text-red-700 mt-0.5">{error}</div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleConfirm}
            disabled={submitting || !wizardData.bargaining_commenced_at}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Beginning Phase 2…
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Confirm &amp; begin Phase 2
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-4 px-4 py-2.5 text-sm">
      <span className="text-slate-500 shrink-0 w-44">{label}</span>
      <span className="text-slate-800">{children}</span>
    </div>
  )
}
