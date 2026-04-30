'use client'

import { use } from 'react'
import Link from 'next/link'
import { useCampaign } from '@/lib/hooks/usePlannerCampaigns'
import { StrengthAssessmentDashboard } from '@/components/campaigns/bargaining/StrengthAssessmentDashboard'
import { DecisionPointTimeline } from '@/components/campaigns/bargaining/DecisionPointTimeline'
import { useStrengthAssessment } from '@/hooks/useStrengthAssessment'
import { useDecisionPoints } from '@/hooks/useDecisionPoints'
import { Button } from '@/components/ui/button'
import { ChevronRight, BarChart3 } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function BargainingDecisionsPage({ params }: PageProps) {
  const { id } = use(params)
  const campaignId = parseInt(id)

  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId)
  const { assessments: strengthData, isLoading: strengthLoading } = useStrengthAssessment(campaignId)
  const { decisionPoints, isLoading: decisionsLoading } = useDecisionPoints(campaignId)

  const isLoading = campaignLoading || strengthLoading || decisionsLoading
  const hasData =
    (Array.isArray(strengthData) && strengthData.length > 0) ||
    (Array.isArray(decisionPoints) && decisionPoints.length > 0)

  if (campaignLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-64 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/campaigns" className="hover:text-foreground">Campaigns</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">
          {campaign?.name ?? 'Campaign'}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}/bargaining`} className="hover:text-foreground">
          Bargaining
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>Decisions</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-slate-500" />
          <h1 className="text-2xl font-bold text-slate-900">Strength &amp; Decisions</h1>
        </div>
      </div>

      {!isLoading && !hasData ? (
        /* Empty state */
        <div className="border rounded-lg p-10 text-center bg-slate-50">
          <BarChart3 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No assessments yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Capture your first strength snapshot to unlock Stage 10. Assessments track your
            bargaining power over time and guide key decisions.
          </p>
        </div>
      ) : (
        /* Content */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-800">Strength Assessments</h2>
            <StrengthAssessmentDashboard campaignId={campaignId} />
          </div>
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-800">Decision Points</h2>
            <DecisionPointTimeline campaignId={campaignId} />
          </div>
        </div>
      )}
    </div>
  )
}
