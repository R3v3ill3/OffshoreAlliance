'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCampaigns } from '@/lib/hooks/useCampaigns'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { differenceInDays, format } from 'date-fns'
import {
  Plus,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Briefcase,
} from 'lucide-react'
import { STAGE_NAMES } from '@/types'

function ExpiryBadge({ expiryDate }: { expiryDate: string | null }) {
  if (!expiryDate) return null
  const days = differenceInDays(new Date(expiryDate), new Date())

  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
      days < 180 ? 'bg-red-100 text-red-700' :
      days < 365 ? 'bg-amber-100 text-amber-700' :
      'bg-green-100 text-green-700'
    )}>
      <Clock className="h-3 w-3" />
      {days < 0 ? 'Expired' : `${Math.round(days / 30)}mo to expiry`}
    </div>
  )
}

function CampaignCard({ campaign }: { campaign: Record<string, unknown> }) {
  const stagePlans = ((campaign.campaign_stage_plans || []) as Record<string, unknown>[])
    .sort((a, b) => (a.stage_number as number) - (b.stage_number as number))
  const timeline = campaign.campaign_timelines as Record<string, unknown> | null
  const expiryDate = timeline?.agreement_expiry_date as string | null
  const paboDate = timeline?.pabo_available_date as string | null

  const activeStage = stagePlans.find((s) => s.status === 'active')
  const completedCount = stagePlans.filter((s) => s.status === 'completed').length
  const progressPct = Math.round((completedCount / 6) * 100)

  const daysToPabo = paboDate ? differenceInDays(new Date(paboDate), new Date()) : null

  return (
    <Link href={`/campaigns/${campaign.campaign_id}`}>
      <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer h-full">
        <CardContent className="pt-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-900 truncate">{campaign.name as string}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {((campaign.organisers as Record<string, unknown>)?.organiser_name as string) || 'Unassigned'}
              </p>
            </div>
            <ExpiryBadge expiryDate={expiryDate} />
          </div>

          {/* Stage progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Stage {activeStage?.stage_number as number || 1}: {STAGE_NAMES[(activeStage?.stage_number as number || 1) as keyof typeof STAGE_NAMES]}
              </span>
              <span>{completedCount}/6 stages</span>
            </div>
            <Progress value={progressPct} className="h-1.5" />
          </div>

          {/* Stage indicator dots */}
          <div className="flex items-center gap-1">
            {[1,2,3,4,5,6].map((n) => {
              const stage = stagePlans.find((s) => s.stage_number === n)
              return (
                <div
                  key={n}
                  className={cn(
                    'h-2 flex-1 rounded-full',
                    !stage ? 'bg-slate-100' :
                    stage.status === 'completed' ? 'bg-green-400' :
                    stage.status === 'active' ? 'bg-blue-500' :
                    stage.status === 'blocked' ? 'bg-red-400' :
                    'bg-slate-200'
                  )}
                />
              )
            })}
          </div>

          {/* PABO countdown */}
          {daysToPabo !== null && (
            <div className={cn(
              'flex items-center gap-1.5 text-xs px-2 py-1 rounded',
              daysToPabo < 30 ? 'bg-red-50 text-red-700' :
              daysToPabo < 90 ? 'bg-amber-50 text-amber-700' :
              'bg-slate-50 text-slate-600'
            )}>
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              {daysToPabo <= 0 ? 'PABO available NOW' : `PABO in ${daysToPabo} days`}
              {paboDate && ` · ${format(new Date(paboDate), 'dd MMM yyyy')}`}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

export default function DashboardPage() {
  const { data: campaigns, isLoading } = useCampaigns()

  const activeCampaigns = campaigns?.filter((c) => c.status === 'active') || []
  const totalCampaigns = campaigns?.length || 0

  return (
    <div className="p-6 space-y-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900 min-h-[140px]">
        <Image
          src="/heritage_Eurka_static.png"
          alt=""
          fill
          className="object-cover object-center opacity-25"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-transparent" />
        <div className="relative z-10 flex items-end justify-between p-6 min-h-[140px]">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-300 mt-1 text-sm">
              Overview of all enterprise bargaining campaigns
            </p>
          </div>
          <Button asChild variant="secondary" className="flex-shrink-0">
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4 mr-1" />
              New Campaign
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{totalCampaigns}</p>
                <p className="text-xs text-muted-foreground">Total Campaigns</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{activeCampaigns.length}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">
                  {campaigns?.filter((c) => {
                    const tl = (c as Record<string, unknown>).campaign_timelines as Record<string, unknown> | null
                    if (!tl?.agreement_expiry_date) return false
                    const days = differenceInDays(new Date(tl.agreement_expiry_date as string), new Date())
                    return days < 180
                  }).length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Expiring &lt;6mo</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {campaigns?.filter((c) => c.status === 'completed').length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Active Campaigns</h2>
          <Link href="/campaigns" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
            View all
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map((i) => (
              <div key={i} className="h-40 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : activeCampaigns.length === 0 ? (
          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-center py-16">
            <div className="absolute inset-0">
              <Image
                src="/heritage_Eurka_static.png"
                alt=""
                fill
                className="object-cover object-center opacity-[0.07]"
              />
            </div>
            <div className="relative z-10">
              <Briefcase className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <p className="font-semibold text-slate-600">No active campaigns</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first campaign to get started</p>
              <Button asChild className="mt-4">
                <Link href="/campaigns/new">
                  <Plus className="h-4 w-4 mr-1" />
                  Create Campaign
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeCampaigns.map((campaign) => (
              <CampaignCard key={campaign.campaign_id as number} campaign={campaign as Record<string, unknown>} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
