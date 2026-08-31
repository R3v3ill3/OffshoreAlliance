'use client'

/**
 * Whole-of-universe SMS activity for the tools hub.
 *
 * The hub's Blasts / Surveys / Chats tabs were campaign-scoped panels
 * handed a null campaign: with nothing selected they showed nothing,
 * and there was no way to reach past work or start new work from them.
 * This lists everything that has run or is running, across campaigns,
 * with a filter for the selected one and a route into each item.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNowStrict } from 'date-fns'
import { ExternalLink, Loader2, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchApi } from '@/lib/api/fetch-api'
import type { SmsActivityRow } from '@/app/api/sms/activity/route'

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  queued: 'bg-sky-100 text-sky-800',
  sending: 'bg-sky-100 text-sky-800',
  open: 'bg-emerald-100 text-emerald-800',
  sent: 'bg-blue-100 text-blue-800',
  paused: 'bg-amber-100 text-amber-800',
  closed: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-rose-100 text-rose-800',
}

type Kind = 'blasts' | 'surveys' | 'chats'

export function SmsActivityOverview({
  campaignId,
  onCreate,
}: {
  /** Selected campaign, or null for "no campaign chosen". */
  campaignId: number | null
  /** Start a new blast/survey/chat — enabled once a scope is chosen. */
  onCreate?: (kind: Kind) => void
}) {
  const [thisCampaignOnly, setThisCampaignOnly] = useState(false)
  const [search, setSearch] = useState('')

  // The toggle only means anything with a campaign selected; without
  // one there is nothing to narrow to.
  const scoped = thisCampaignOnly && campaignId != null

  const { data, isLoading } = useQuery({
    queryKey: ['sms-activity', scoped ? campaignId : 'all'],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/sms/activity${scoped ? `?campaign_id=${campaignId}` : ''}`,
      )
      if (!res.ok) throw new Error('Failed to load SMS activity')
      return res.json() as Promise<{
        blasts: SmsActivityRow[]
        chats: SmsActivityRow[]
        surveys: SmsActivityRow[]
      }>
    },
  })

  const filter = (rows: SmsActivityRow[]) => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.campaign_name ?? '').toLowerCase().includes(term),
    )
  }

  const blasts = filter(data?.blasts ?? [])
  const chats = filter(data?.chats ?? [])
  const surveys = filter(data?.surveys ?? [])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 w-full text-xs sm:w-64"
          placeholder="Search by name or campaign…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {campaignId != null && (
          <Button
            size="sm"
            variant={thisCampaignOnly ? 'default' : 'outline'}
            className="h-8 text-xs"
            aria-pressed={thisCampaignOnly}
            onClick={() => setThisCampaignOnly((v) => !v)}
          >
            This campaign only
          </Button>
        )}
        {isLoading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      <Tabs defaultValue="blasts">
        <TabsList>
          <TabsTrigger value="blasts">Blasts ({blasts.length})</TabsTrigger>
          <TabsTrigger value="surveys">Surveys ({surveys.length})</TabsTrigger>
          <TabsTrigger value="chats">Chats ({chats.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="blasts" className="mt-3">
          <ActivityList
            rows={blasts}
            kind="blasts"
            campaignId={campaignId}
            onCreate={onCreate}
            emptyLabel="No blasts yet."
          />
        </TabsContent>
        <TabsContent value="surveys" className="mt-3">
          <ActivityList
            rows={surveys}
            kind="surveys"
            campaignId={campaignId}
            onCreate={onCreate}
            emptyLabel="No surveys yet."
          />
        </TabsContent>
        <TabsContent value="chats" className="mt-3">
          <ActivityList
            rows={chats}
            kind="chats"
            campaignId={campaignId}
            onCreate={onCreate}
            emptyLabel="No chat boards yet."
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ActivityList({
  rows,
  kind,
  campaignId,
  onCreate,
  emptyLabel,
}: {
  rows: SmsActivityRow[]
  kind: Kind
  campaignId: number | null
  onCreate?: (kind: Kind) => void
  emptyLabel: string
}) {
  const label =
    kind === 'blasts' ? 'blast' : kind === 'surveys' ? 'survey' : 'chat board'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? label : `${label}s`}
        </p>
        {onCreate && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            // Creating needs a scope: a campaign, or standalone. The
            // selector above sets it, so say so rather than failing.
            disabled={campaignId == null}
            title={
              campaignId == null
                ? 'Pick a campaign or Standalone above to start a new one'
                : `Start a new ${label}`
            }
            onClick={() => onCreate(kind)}
          >
            <Plus className="mr-1 h-3 w-3" />
            New {label}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {rows.map((r) => (
            <div
              key={`${r.kind}:${r.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {r.name}
              </span>
              {r.is_test && (
                <Badge
                  variant="secondary"
                  className="bg-violet-100 text-[10px] text-violet-800"
                >
                  Test
                </Badge>
              )}
              <Badge
                variant="secondary"
                className={`text-[10px] ${STATUS_TONE[r.status] ?? ''}`}
              >
                {r.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {r.is_standalone
                  ? 'Standalone'
                  : (r.campaign_name ?? 'No campaign')}
              </span>
              <span className="text-xs text-muted-foreground">
                {r.kind === 'survey'
                  ? `${r.question_count ?? 0}q · ${r.progress_count}/${r.audience_count} completed`
                  : `${r.progress_count}/${r.audience_count} messaged`}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatDistanceToNowStrict(new Date(r.created_at), {
                  addSuffix: true,
                })}
              </span>
              {r.campaign_id != null && !r.is_standalone && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  asChild
                  title="Open in its campaign"
                >
                  <Link
                    href={`/campaigns/${r.campaign_id}?tab=outreach&sub=sms`}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
