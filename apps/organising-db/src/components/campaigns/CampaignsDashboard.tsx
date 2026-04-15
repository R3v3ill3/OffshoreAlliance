'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Users, UserCheck, Network, Award, BarChart3 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCampaignsAllStats } from '@/lib/hooks/useCampaignsAllStats'
import { CampaignDashboardStatCard } from '@/components/campaigns/campaign-dashboard-stat-card'
import { CampaignsMetricsTable } from '@/components/campaigns/CampaignsMetricsTable'

interface StagePlanSummary {
  plan_id: number
  stage_number: number
  stage_name: string
  status: string
}

interface CampaignRowMin {
  campaign_id: number
  name: string
  campaign_type: string
  status: string
  total_worker_estimate: number | null
  organiser_id: number | null
  organiser: { organiser_name: string } | null
  campaign_stage_plans: StagePlanSummary[]
}

interface CampaignsDashboardProps {
  campaigns: CampaignRowMin[]
  /** Controlled externally so the DataTable below can share the same filter */
  selectedOrganiserId: string
  onOrganiserChange: (value: string) => void
  onRowClick?: (campaignId: number) => void
}

export function CampaignsDashboard({
  campaigns,
  selectedOrganiserId,
  onOrganiserChange,
  onRowClick,
}: CampaignsDashboardProps) {
  const router = useRouter()

  // Collect unique organisers from the campaign list
  const organisers = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of campaigns) {
      if (c.organiser_id != null && c.organiser?.organiser_name) {
        seen.set(String(c.organiser_id), c.organiser.organiser_name)
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [campaigns])

  // Filter campaigns by selected organiser
  const filteredCampaigns = useMemo(() => {
    if (selectedOrganiserId === 'all') return campaigns
    return campaigns.filter((c) => String(c.organiser_id) === selectedOrganiserId)
  }, [campaigns, selectedOrganiserId])

  // Collect all plan_ids across all campaigns (not just filtered) for batch P2W queries
  const allPlanIds = useMemo(() => {
    const ids: number[] = []
    for (const c of campaigns) {
      for (const sp of c.campaign_stage_plans) {
        ids.push(sp.plan_id)
      }
    }
    return ids
  }, [campaigns])

  const { statsMap, isLoading } = useCampaignsAllStats(allPlanIds)

  // Aggregate summary numbers across filtered campaigns
  const summary = useMemo(() => {
    let totalEstimate = 0
    let totalNamed = 0
    let totalMembers = 0
    let totalLeaders = 0
    let totalRated = 0
    let campaignsWithEstimate = 0

    for (const c of filteredCampaigns) {
      const s = statsMap.get(c.campaign_id)
      const est = c.total_worker_estimate ?? 0
      if (est > 0) campaignsWithEstimate++
      totalEstimate += est
      totalNamed += s?.namedWorkers ?? 0
      totalMembers += s?.memberLikeCount ?? 0
      totalLeaders += s?.leadershipTotal ?? 0
      totalRated += s?.participationCount ?? 0
    }

    const mappingPct = totalEstimate > 0 ? Math.round((totalNamed / totalEstimate) * 1000) / 10 : null
    const membershipPct = totalEstimate > 0 ? Math.round((totalMembers / totalEstimate) * 1000) / 10 : null
    const participationPct = totalEstimate > 0 ? Math.round((totalRated / totalEstimate) * 1000) / 10 : null
    const leaderRatio =
      totalLeaders > 0 && totalEstimate > 0
        ? `1 : ${Math.round(totalEstimate / totalLeaders)}`
        : totalLeaders > 0
          ? `${totalLeaders}`
          : '—'

    return {
      totalEstimate,
      totalNamed,
      mappingPct,
      membershipPct,
      participationPct,
      leaderRatio,
      totalLeaders,
      campaignCount: filteredCampaigns.length,
    }
  }, [filteredCampaigns, statsMap])

  const handleRowClick = (campaignId: number) => {
    if (onRowClick) {
      onRowClick(campaignId)
    } else {
      router.push(`/campaigns/${campaignId}`)
    }
  }

  return (
    <div className="space-y-4">
      {/* Organiser filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          Filter by organiser:
        </span>
        <Select value={selectedOrganiserId} onValueChange={onOrganiserChange}>
          <SelectTrigger className="w-56 h-8 text-sm">
            <SelectValue placeholder="All organisers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organisers</SelectItem>
            {organisers.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {summary.campaignCount} campaign{summary.campaignCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Aggregate summary cards */}
      <div className="flex flex-wrap gap-3">
        <CampaignDashboardStatCard
          icon={Users}
          label="Total estimate"
          value={summary.totalEstimate.toLocaleString()}
          sub={`across ${summary.campaignCount} campaign${summary.campaignCount !== 1 ? 's' : ''}`}
        />
        <CampaignDashboardStatCard
          icon={UserCheck}
          label="Mapping"
          value={summary.mappingPct != null ? `${summary.mappingPct}%` : '—'}
          sub={`${summary.totalNamed.toLocaleString()} named workers`}
        />
        <CampaignDashboardStatCard
          icon={Award}
          label="Membership"
          value={summary.membershipPct != null ? `${summary.membershipPct}%` : '—'}
          sub="members of estimated workers"
        />
        <CampaignDashboardStatCard
          icon={Network}
          label="Leadership"
          value={summary.leaderRatio}
          sub={`${summary.totalLeaders} leaders`}
        />
        <CampaignDashboardStatCard
          icon={BarChart3}
          label="Participation"
          value={summary.participationPct != null ? `${summary.participationPct}%` : '—'}
          sub="workers with at least one rating"
        />
      </div>

      {/* Per-campaign metrics table */}
      <CampaignsMetricsTable
        campaigns={filteredCampaigns}
        statsMap={statsMap}
        isLoading={isLoading}
        onRowClick={handleRowClick}
      />
    </div>
  )
}
