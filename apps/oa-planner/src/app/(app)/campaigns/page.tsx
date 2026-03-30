'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useCampaigns } from '@/lib/hooks/useCampaigns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { differenceInDays, format } from 'date-fns'
import { Plus, Search, ChevronRight, Clock, Calendar } from 'lucide-react'
import { STAGE_NAMES } from '@/types'

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useCampaigns()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  const filtered = (campaigns || []).filter((c) => {
    const matchesSearch = !search ||
      (c.name as string)?.toLowerCase().includes(search.toLowerCase()) ||
      ((c as Record<string, unknown>).organisers as Record<string, unknown>)?.organiser_name?.toString().toLowerCase().includes(search.toLowerCase())

    const matchesStatus = !statusFilter || c.status === statusFilter

    return matchesSearch && matchesStatus
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Campaigns</h1>
        <Button asChild>
          <Link href="/campaigns/new">
            <Plus className="h-4 w-4 mr-1" />
            New Campaign
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {['active', 'completed', 'draft'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-full border transition-colors capitalize',
                statusFilter === status
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Campaign list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500">No campaigns found</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/campaigns/new">Create Campaign</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((campaign) => {
            const stagePlans = ((campaign as Record<string, unknown>).campaign_stage_plans as Record<string, unknown>[] || [])
              .sort((a, b) => (a.stage_number as number) - (b.stage_number as number))
            const timeline = (campaign as Record<string, unknown>).campaign_timelines as Record<string, unknown> | null
            const expiryDate = timeline?.agreement_expiry_date as string | null
            const activeStage = stagePlans.find((s) => s.status === 'active')
            const completedCount = stagePlans.filter((s) => s.status === 'completed').length
            const daysToExpiry = expiryDate ? differenceInDays(new Date(expiryDate), new Date()) : null

            return (
              <Link key={campaign.campaign_id as number} href={`/campaigns/${campaign.campaign_id}`}>
                <Card className="hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                        campaign.status === 'active' ? 'bg-blue-100 text-blue-700' :
                        campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
                        'bg-slate-100 text-slate-500'
                      )}>
                        {activeStage?.stage_number as number || 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900 truncate">{campaign.name as string}</p>
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-xs flex-shrink-0',
                              campaign.status === 'active' ? 'bg-blue-100 text-blue-700' :
                              campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
                              'bg-slate-100 text-slate-600'
                            )}
                          >
                            {campaign.status as string}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          {activeStage && (
                            <span>{STAGE_NAMES[activeStage.stage_number as keyof typeof STAGE_NAMES]}</span>
                          )}
                          <span>{completedCount}/6 stages</span>
                          {(((campaign as Record<string, unknown>).organisers as Record<string, unknown>)?.organiser_name as string) && (
                            <span>{((campaign as Record<string, unknown>).organisers as Record<string, unknown>).organiser_name as string}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {expiryDate && (
                          <div className={cn(
                            'flex items-center gap-1 text-xs px-2 py-1 rounded-full',
                            (daysToExpiry || 0) < 180 ? 'bg-red-100 text-red-700' :
                            (daysToExpiry || 0) < 365 ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          )}>
                            <Clock className="h-3 w-3" />
                            {(daysToExpiry || 0) < 0 ? 'Expired' : `${Math.round((daysToExpiry || 0) / 30)}mo`}
                          </div>
                        )}
                        {campaign.start_date && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(campaign.start_date as string), 'dd MMM yyyy')}
                          </div>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
