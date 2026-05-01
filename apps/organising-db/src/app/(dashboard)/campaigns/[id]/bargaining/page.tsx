'use client'

import { use } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useCampaign } from '@/lib/hooks/usePlannerCampaigns'
import { IntractableBannerCard } from '@/components/campaigns/bargaining/IntractableBannerCard'
import { FoundationalReadinessPanel } from '@/components/campaigns/bargaining/FoundationalReadinessPanel'
import { BaselineAssessmentQuickStart } from '@/components/campaigns/bargaining/BaselineAssessmentQuickStart'
import { AmbitionReviewBanner } from '@/components/campaigns/bargaining/AmbitionReviewBanner'
import { useFoundationalReadinessGaps } from '@/hooks/useFoundationalReadiness'
import { useIntractableState } from '@/hooks/useIntractableState'
import { useStrengthAssessment } from '@/hooks/useStrengthAssessment'
import { useDecisionPoints } from '@/hooks/useDecisionPoints'
import { usePaboApplications } from '@/hooks/usePaboApplications'
import { usePiaActions } from '@/hooks/usePiaActions'
import { useEndorsementVotes } from '@/hooks/useEndorsementVotes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import {
  ChevronRight,
  BarChart3,
  FileText,
  Zap,
  Vote,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'

const BARGAINING_STAGE_NAMES: Record<number, string> = {
  7: 'Commence Bargaining',
  8: 'Active Bargaining',
  9: 'Intractable / Strength Assessment',
  10: 'Protected Industrial Action',
  11: 'Endorsement & Settlement',
}

interface PageProps {
  params: Promise<{ id: string }>
}

type SubtabValue = 'decisions' | 'pabo' | 'actions' | 'votes'

const SUBTABS: { id: SubtabValue; label: string; icon: React.ElementType; href: string }[] = [
  { id: 'decisions', label: 'Decisions', icon: BarChart3, href: 'bargaining/decisions' },
  { id: 'pabo', label: 'PABO', icon: FileText, href: 'bargaining/pabo' },
  { id: 'actions', label: 'PIA Actions', icon: Zap, href: 'bargaining/actions' },
  { id: 'votes', label: 'Endorsement Votes', icon: Vote, href: 'bargaining/votes' },
]

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-slate-200 rounded w-32" />
          <div className="h-6 bg-slate-200 rounded w-20" />
          <div className="h-3 bg-slate-200 rounded w-48" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function BargainingHubPage({ params }: PageProps) {
  const { id } = use(params)
  const campaignId = parseInt(id)
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeSubtab = searchParams.get('subtab') as SubtabValue | null

  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId)
  const { data: intractableState, isLoading: intractableLoading } = useIntractableState(campaignId)
  const { assessments: strengthData, isLoading: strengthLoading } = useStrengthAssessment(campaignId)
  const { decisionPoints, isLoading: decisionsLoading } = useDecisionPoints(campaignId)
  const { data: paboApplications, isLoading: paboLoading } = usePaboApplications(campaignId)
  const { data: piaActions, isLoading: actionsLoading } = usePiaActions(campaignId)
  const { data: endorsementVotes, isLoading: votesLoading } = useEndorsementVotes(campaignId)
  const { ratingsGapPct } = useFoundationalReadinessGaps(campaignId)

  function setSubtab(tab: SubtabValue) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('subtab', tab)
    router.replace(`/campaigns/${campaignId}/bargaining?${params.toString()}`)
  }

  // Derive current stage info from campaign
  const currentPhase = (campaign as any)?.current_phase
  const stageNumber: number = (campaign as any)?.current_bargaining_stage ?? 7
  const stageName = BARGAINING_STAGE_NAMES[stageNumber] ?? `Stage ${stageNumber}`

  // Summaries
  const openDecisions = Array.isArray(decisionPoints)
    ? decisionPoints.filter((d: any) => d.status === 'open').length
    : 0
  const latestStrength = Array.isArray(strengthData) ? strengthData[0] : null
  const activePabo = Array.isArray(paboApplications)
    ? paboApplications.find((p: any) => p.status === 'active' || p.status === 'granted')
    : null
  const activeActionsCount = Array.isArray(piaActions)
    ? piaActions.filter((a: any) => a.status === 'active' || a.status === 'scheduled').length
    : 0
  const pendingVotes = Array.isArray(endorsementVotes)
    ? endorsementVotes.filter((v: any) => v.status === 'pending' || v.status === 'open')
    : []

  if (campaignLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-4 bg-slate-200 rounded w-96" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  if (!campaign) {
    return <div className="p-6 text-center text-slate-500">Campaign not found</div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/campaigns" className="hover:text-foreground">Campaigns</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">
          {campaign.name}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>Bargaining</span>
      </div>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bargaining</h1>
        <p className="text-muted-foreground mt-1">
          Phase 2 bargaining hub for {campaign.name}
        </p>
      </div>

      {/* Intractable banner */}
      {!intractableLoading && (
        <IntractableBannerCard campaignId={campaignId} />
      )}

      {/* Foundational readiness panel */}
      <FoundationalReadinessPanel campaignId={campaignId} />

      {/* Baseline assessment quick-start — shown when <20% of workers are rated */}
      {ratingsGapPct > 0.80 && (
        <BaselineAssessmentQuickStart campaignId={campaignId} />
      )}

      {/* Ambition review banner — shown when industrial_outcomes ambitions need review */}
      <AmbitionReviewBanner campaignId={campaignId} />

      {/* Sub-section tabs */}
      <div className="flex flex-wrap gap-2">
        {SUBTABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setSubtab(tabId)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
              activeSubtab === tabId
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Active stage card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
              {stageNumber}
            </div>
            Active Stage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">{stageName}</p>
              {currentPhase && (
                <p className="text-xs text-muted-foreground mt-0.5">Phase: {currentPhase}</p>
              )}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/campaigns/${campaignId}/bargaining/stage/${stageNumber}`}>
                Open Stage Planner
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Decision points */}
        <Card className={cn(activeSubtab === 'decisions' && 'ring-2 ring-blue-400')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <BarChart3 className="h-4 w-4" />
              Decision Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            {decisionsLoading ? (
              <div className="animate-pulse h-8 bg-slate-200 rounded w-24" />
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">{openDecisions}</span>
                  <span className="text-sm text-muted-foreground">open</span>
                </div>
                {latestStrength && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Latest strength:</span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[10px] h-5',
                        latestStrength.outcome === 'strong'
                          ? 'bg-green-100 text-green-700'
                          : latestStrength.outcome === 'weak'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      )}
                    >
                      {latestStrength.outcome ?? 'assessed'}
                    </Badge>
                  </div>
                )}
                <Button asChild variant="link" size="sm" className="p-0 h-auto text-blue-600 text-xs">
                  <Link href={`/campaigns/${campaignId}/bargaining/decisions`}>
                    View decisions <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PABO */}
        <Card className={cn(activeSubtab === 'pabo' && 'ring-2 ring-blue-400')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <FileText className="h-4 w-4" />
              PABO Application
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paboLoading ? (
              <div className="animate-pulse h-8 bg-slate-200 rounded w-24" />
            ) : activePabo ? (
              <div className="space-y-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-xs',
                    activePabo.status === 'granted'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-blue-100 text-blue-700'
                  )}
                >
                  {activePabo.status}
                </Badge>
                {activePabo.fwc_application_number && (
                  <p className="text-xs text-muted-foreground">FWC: {activePabo.fwc_application_number}</p>
                )}
                <Button asChild variant="link" size="sm" className="p-0 h-auto text-blue-600 text-xs">
                  <Link href={`/campaigns/${campaignId}/bargaining/pabo`}>
                    View PABOs <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">No active PABO</p>
                <Button asChild variant="link" size="sm" className="p-0 h-auto text-blue-600 text-xs">
                  <Link href={`/campaigns/${campaignId}/bargaining/pabo`}>
                    View PABOs <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PIA Actions */}
        <Card className={cn(activeSubtab === 'actions' && 'ring-2 ring-blue-400')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Zap className="h-4 w-4" />
              PIA Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {actionsLoading ? (
              <div className="animate-pulse h-8 bg-slate-200 rounded w-24" />
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">{activeActionsCount}</span>
                  <span className="text-sm text-muted-foreground">active</span>
                </div>
                <Button asChild variant="link" size="sm" className="p-0 h-auto text-blue-600 text-xs">
                  <Link href={`/campaigns/${campaignId}/bargaining/actions`}>
                    View actions <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Endorsement votes */}
        <Card className={cn(activeSubtab === 'votes' && 'ring-2 ring-blue-400')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Vote className="h-4 w-4" />
              Endorsement Votes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {votesLoading ? (
              <div className="animate-pulse h-8 bg-slate-200 rounded w-24" />
            ) : pendingVotes.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">{pendingVotes.length}</span>
                  <span className="text-sm text-muted-foreground">pending</span>
                </div>
                <ul className="space-y-1">
                  {pendingVotes.slice(0, 2).map((vote: any) => (
                    <li key={vote.id} className="text-xs text-muted-foreground truncate">
                      {vote.title ?? vote.vote_type ?? 'Vote'}
                    </li>
                  ))}
                  {pendingVotes.length > 2 && (
                    <li className="text-xs text-muted-foreground">+{pendingVotes.length - 2} more</li>
                  )}
                </ul>
                <Button asChild variant="link" size="sm" className="p-0 h-auto text-blue-600 text-xs">
                  <Link href={`/campaigns/${campaignId}/bargaining/votes`}>
                    View votes <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">No pending votes</p>
                <Button asChild variant="link" size="sm" className="p-0 h-auto text-blue-600 text-xs">
                  <Link href={`/campaigns/${campaignId}/bargaining/votes`}>
                    View votes <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stage navigation */}
      <div>
        <h2 className="text-base font-semibold mb-3">Bargaining Stages</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(BARGAINING_STAGE_NAMES).map(([num, name]) => {
            const n = parseInt(num)
            const isCurrent = n === stageNumber
            return (
              <Link key={n} href={`/campaigns/${campaignId}/bargaining/stage/${n}`}>
                <Card className={cn(
                  'hover:border-blue-300 transition-colors cursor-pointer',
                  isCurrent && 'border-blue-200 bg-blue-50/50'
                )}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                        isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                      )}>
                        {n}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        {isCurrent && (
                          <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 mt-0.5">
                            Current
                          </Badge>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-auto" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
