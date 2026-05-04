'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { fetchApi } from '@/lib/api/fetch-api'
import { exportToCSV } from '@/lib/utils/export'
import { useCallLists } from '@/lib/hooks/useCallList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Download,
  Phone,
  Users,
  TrendingUp,
  MessageSquareWarning,
  Flame,
  BarChart3,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupBy = 'campaign_unit' | 'membership_status' | 'worksite' | 'list'

type SupportLevelKey =
  | 'strong_supporter'
  | 'supporter'
  | 'neutral'
  | 'unsupportive'
  | 'hostile'

interface ReportSummary {
  total_attempts: number
  unique_workers: number
  connected: number
  no_answer: number
  voicemail: number
  bad_number: number
  dnc: number
  connect_rate_pct: number
  cta_accepted: number
  cta_considering: number
  cta_declined: number
  cta_not_reached: number
  positive_calls: number
  negative_calls: number
  neutral_calls: number
  objections_total: number
  issues_total: number
}

interface ReportGroup {
  group_key: string
  group_label: string
  total_attempts: number
  connected: number
  connect_rate_pct: number
  cta_accepted: number
  cta_considering: number
  cta_declined: number
  cta_not_reached: number
  objections_total: number
  issues_total: number
  support_levels: Record<SupportLevelKey, number>
}

interface ObjectionBreakdown {
  label: string
  count: number
  fully_resolved: number
  partially_resolved: number
  not_resolved: number
}

interface IssueBreakdown {
  label: string
  count: number
  avg_heat: number
  max_heat: number
}

interface ReportData {
  summary: ReportSummary
  groups: ReportGroup[]
  objection_breakdown: ObjectionBreakdown[]
  issue_breakdown: IssueBreakdown[]
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CallActionReportProps {
  campaignId: number
  defaultListId?: number
  defaultGroupBy?: GroupBy
  campaignName?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORT_LEVEL_COLORS: Record<SupportLevelKey, string> = {
  strong_supporter: 'bg-green-100 text-green-800',
  supporter: 'bg-green-50 text-green-700',
  neutral: 'bg-slate-100 text-slate-600',
  unsupportive: 'bg-red-50 text-red-600',
  hostile: 'bg-red-100 text-red-800',
}

const SUPPORT_LEVEL_LABELS: Record<SupportLevelKey, string> = {
  strong_supporter: 'Strong Supp.',
  supporter: 'Supporter',
  neutral: 'Neutral',
  unsupportive: 'Unsupportive',
  hostile: 'Hostile',
}

const SUPPORT_LEVEL_ORDER: SupportLevelKey[] = [
  'strong_supporter',
  'supporter',
  'neutral',
  'unsupportive',
  'hostile',
]

const HEAT_COLORS = ['', 'text-blue-500', 'text-green-500', 'text-amber-500', 'text-orange-500', 'text-red-500']

// ─── Helper components ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string | number
  sub?: string
  icon?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-0.5">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

function SupportLevelChips({ levels }: { levels: Record<SupportLevelKey, number> }) {
  const total = Object.values(levels).reduce((a, b) => a + b, 0)
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {SUPPORT_LEVEL_ORDER.filter((k) => levels[k] > 0).map((k) => (
        <span
          key={k}
          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SUPPORT_LEVEL_COLORS[k]}`}
        >
          {SUPPORT_LEVEL_LABELS[k]} {levels[k]}
        </span>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CallActionReport({
  campaignId,
  defaultListId,
  defaultGroupBy,
  campaignName,
}: CallActionReportProps) {
  const [groupBy, setGroupBy] = useState<GroupBy | 'none'>((defaultGroupBy as GroupBy) ?? 'none')
  const [listId, setListId] = useState<string>(defaultListId ? String(defaultListId) : 'all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const { data: lists } = useCallLists(campaignId)

  const queryParams = new URLSearchParams()
  if (groupBy && groupBy !== 'none') queryParams.set('groupBy', groupBy)
  if (listId && listId !== 'all') queryParams.set('list_id', listId)
  if (startDate) queryParams.set('start_date', startDate)
  if (endDate) queryParams.set('end_date', endDate)

  const { data, isLoading, isError } = useQuery<ReportData>({
    queryKey: ['phone-report', campaignId, groupBy, listId, startDate, endDate],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/phone/report?${queryParams.toString()}`,
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to load report')
      }
      return res.json() as Promise<ReportData>
    },
    enabled: !!campaignId,
  })

  const today = format(new Date(), 'yyyy-MM-dd')
  const nameSlug = campaignName
    ? campaignName.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    : `campaign-${campaignId}`
  const filenameBase = `phone-report-${nameSlug}-${groupBy !== 'none' ? groupBy : 'all'}-${today}`

  function handleExport() {
    if (!data) return

    // 1. Summary (1 row)
    exportToCSV(
      [data.summary as unknown as Record<string, unknown>],
      [
        { key: 'total_attempts', header: 'Total Attempts' },
        { key: 'unique_workers', header: 'Unique Workers' },
        { key: 'connected', header: 'Connected' },
        { key: 'connect_rate_pct', header: 'Connect Rate %' },
        { key: 'no_answer', header: 'No Answer' },
        { key: 'voicemail', header: 'Voicemail' },
        { key: 'bad_number', header: 'Bad Number' },
        { key: 'dnc', header: 'DNC' },
        { key: 'cta_accepted', header: 'CTA Accepted' },
        { key: 'cta_considering', header: 'CTA Considering' },
        { key: 'cta_declined', header: 'CTA Declined' },
        { key: 'cta_not_reached', header: 'CTA Not Reached' },
        { key: 'positive_calls', header: 'Positive Calls' },
        { key: 'neutral_calls', header: 'Neutral Calls' },
        { key: 'negative_calls', header: 'Negative Calls' },
        { key: 'objections_total', header: 'Objections Total' },
        { key: 'issues_total', header: 'Issues Total' },
      ],
      `${filenameBase}-summary`,
    )

    // 2. Groups
    if (data.groups.length > 0) {
      exportToCSV(
        data.groups.map((g) => ({
          ...g,
          ...Object.fromEntries(
            SUPPORT_LEVEL_ORDER.map((k) => [`support_${k}`, g.support_levels[k]]),
          ),
        })),
        [
          { key: 'group_label', header: 'Group' },
          { key: 'total_attempts', header: 'Total Attempts' },
          { key: 'connected', header: 'Connected' },
          { key: 'connect_rate_pct', header: 'Connect Rate %' },
          { key: 'cta_accepted', header: 'CTA Accepted' },
          { key: 'cta_considering', header: 'CTA Considering' },
          { key: 'cta_declined', header: 'CTA Declined' },
          { key: 'cta_not_reached', header: 'CTA Not Reached' },
          { key: 'objections_total', header: 'Objections' },
          { key: 'issues_total', header: 'Issues' },
          { key: 'support_strong_supporter', header: 'Strong Supporter' },
          { key: 'support_supporter', header: 'Supporter' },
          { key: 'support_neutral', header: 'Neutral' },
          { key: 'support_unsupportive', header: 'Unsupportive' },
          { key: 'support_hostile', header: 'Hostile' },
        ],
        `${filenameBase}-groups`,
      )
    }

    // 3. Objections
    if (data.objection_breakdown.length > 0) {
      exportToCSV(
        data.objection_breakdown as unknown as Record<string, unknown>[],
        [
          { key: 'label', header: 'Objection' },
          { key: 'count', header: 'Count' },
          { key: 'fully_resolved', header: 'Fully Resolved' },
          { key: 'partially_resolved', header: 'Partially Resolved' },
          { key: 'not_resolved', header: 'Not Resolved' },
        ],
        `${filenameBase}-objections`,
      )
    }

    // 4. Issues
    if (data.issue_breakdown.length > 0) {
      exportToCSV(
        data.issue_breakdown as unknown as Record<string, unknown>[],
        [
          { key: 'label', header: 'Issue' },
          { key: 'count', header: 'Count' },
          { key: 'avg_heat', header: 'Avg Heat (1-5)' },
          { key: 'max_heat', header: 'Max Heat' },
        ],
        `${filenameBase}-issues`,
      )
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Group By</Label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy | 'none')}>
            <SelectTrigger className="h-8 text-xs w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Grouping</SelectItem>
              <SelectItem value="campaign_unit">Campaign Unit</SelectItem>
              <SelectItem value="membership_status">Membership Status</SelectItem>
              <SelectItem value="worksite">Worksite</SelectItem>
              <SelectItem value="list">Call List</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">List</Label>
          <Select value={listId} onValueChange={setListId}>
            <SelectTrigger className="h-8 text-xs w-[180px]">
              <SelectValue placeholder="All lists" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Lists</SelectItem>
              {lists?.map((l) => (
                <SelectItem key={l.list_id} value={String(l.list_id)}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-8 text-xs w-[140px]"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-8 text-xs w-[140px]"
          />
        </div>

        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={!data || data.summary.total_attempts === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-lg" />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <Card className="border-destructive/30">
          <CardContent className="p-4 text-center text-sm text-destructive">
            Failed to load report. Please try again.
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {data && data.summary.total_attempts === 0 && !isLoading && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">No call data yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start making calls to see campaign report data here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Data */}
      {data && data.summary.total_attempts > 0 && (
        <>
          {/* Summary cards */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Summary
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total Attempts"
                value={data.summary.total_attempts}
                sub={`${data.summary.unique_workers} unique workers`}
                icon={<Phone className="h-4 w-4" />}
              />
              <StatCard
                label="Connect Rate"
                value={`${data.summary.connect_rate_pct}%`}
                sub={`${data.summary.connected} connected`}
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <StatCard
                label="CTA Accepted"
                value={data.summary.cta_accepted}
                sub={`${data.summary.cta_considering} considering`}
                icon={<Users className="h-4 w-4" />}
              />
              <StatCard
                label="Objections / Issues"
                value={`${data.summary.objections_total} / ${data.summary.issues_total}`}
                icon={<MessageSquareWarning className="h-4 w-4" />}
              />
            </div>

            {/* Dial disposition breakdown */}
            <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Connected', value: data.summary.connected, color: 'text-green-700' },
                { label: 'No Answer', value: data.summary.no_answer, color: 'text-slate-500' },
                { label: 'Voicemail', value: data.summary.voicemail, color: 'text-blue-600' },
                { label: 'Bad Number', value: data.summary.bad_number, color: 'text-red-600' },
                { label: 'DNC', value: data.summary.dnc, color: 'text-red-800' },
                {
                  label: 'Unaccounted',
                  value:
                    data.summary.total_attempts -
                    data.summary.connected -
                    data.summary.no_answer -
                    data.summary.voicemail -
                    data.summary.bad_number -
                    data.summary.dnc,
                  color: 'text-muted-foreground',
                },
              ].map((item) => (
                <div key={item.label} className="rounded border p-2 text-center">
                  <p className={`text-lg font-semibold ${item.color}`}>{item.value}</p>
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>

            {/* CTA breakdown */}
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {[
                { label: 'CTA Accepted', value: data.summary.cta_accepted, color: 'bg-green-100 text-green-800' },
                { label: 'CTA Considering', value: data.summary.cta_considering, color: 'bg-amber-100 text-amber-800' },
                { label: 'CTA Declined', value: data.summary.cta_declined, color: 'bg-red-100 text-red-700' },
                { label: 'Not Reached', value: data.summary.cta_not_reached, color: 'bg-slate-100 text-slate-500' },
              ].map((item) => (
                <div key={item.label} className={`rounded-lg px-3 py-2 text-center ${item.color}`}>
                  <p className="text-xl font-bold">{item.value}</p>
                  <p className="text-[10px] font-medium">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Groups table */}
          {data.groups.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Breakdown by{' '}
                {groupBy === 'campaign_unit'
                  ? 'Campaign Unit'
                  : groupBy === 'membership_status'
                    ? 'Membership Status'
                    : groupBy === 'worksite'
                      ? 'Worksite'
                      : 'Call List'}
              </h4>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2 font-medium">Group</th>
                      <th className="text-right p-2 font-medium">Attempts</th>
                      <th className="text-right p-2 font-medium">Connect %</th>
                      <th className="text-right p-2 font-medium">Accepted</th>
                      <th className="text-right p-2 font-medium">Considering</th>
                      <th className="text-right p-2 font-medium">Declined</th>
                      <th className="text-right p-2 font-medium">Objections</th>
                      <th className="text-right p-2 font-medium">Issues</th>
                      <th className="p-2 font-medium">Support Levels</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups.map((g) => (
                      <tr key={g.group_key} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-2 font-medium max-w-[140px] truncate">{g.group_label}</td>
                        <td className="p-2 text-right">{g.total_attempts}</td>
                        <td className="p-2 text-right">
                          <span
                            className={
                              g.connect_rate_pct >= 50
                                ? 'text-green-700 font-medium'
                                : g.connect_rate_pct >= 25
                                  ? 'text-amber-700'
                                  : 'text-muted-foreground'
                            }
                          >
                            {g.connect_rate_pct}%
                          </span>
                        </td>
                        <td className="p-2 text-right text-green-700">{g.cta_accepted}</td>
                        <td className="p-2 text-right text-amber-700">{g.cta_considering}</td>
                        <td className="p-2 text-right text-red-600">{g.cta_declined}</td>
                        <td className="p-2 text-right">{g.objections_total}</td>
                        <td className="p-2 text-right">{g.issues_total}</td>
                        <td className="p-2">
                          <SupportLevelChips levels={g.support_levels} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Objection breakdown */}
          {data.objection_breakdown.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4" />
                Top Objections
              </h4>
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-2 font-medium">Objection</th>
                        <th className="text-right p-2 font-medium">Count</th>
                        <th className="text-right p-2 font-medium">Resolved</th>
                        <th className="text-right p-2 font-medium">Partial</th>
                        <th className="text-right p-2 font-medium">Not Resolved</th>
                        <th className="p-2 font-medium">Resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.objection_breakdown.map((obj) => {
                        const resolvedPct = obj.count > 0 ? (obj.fully_resolved / obj.count) * 100 : 0
                        const partialPct = obj.count > 0 ? (obj.partially_resolved / obj.count) * 100 : 0
                        const notPct = obj.count > 0 ? (obj.not_resolved / obj.count) * 100 : 0
                        return (
                          <tr key={obj.label} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-2 font-medium max-w-[200px] truncate">{obj.label}</td>
                            <td className="p-2 text-right">{obj.count}</td>
                            <td className="p-2 text-right text-green-700">{obj.fully_resolved}</td>
                            <td className="p-2 text-right text-amber-600">{obj.partially_resolved}</td>
                            <td className="p-2 text-right text-red-600">{obj.not_resolved}</td>
                            <td className="p-2">
                              <div className="flex h-2 rounded-full overflow-hidden bg-muted w-24">
                                <div
                                  className="bg-green-500"
                                  style={{ width: `${resolvedPct}%` }}
                                />
                                <div
                                  className="bg-amber-400"
                                  style={{ width: `${partialPct}%` }}
                                />
                                <div
                                  className="bg-red-400"
                                  style={{ width: `${notPct}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Issue breakdown */}
          {data.issue_breakdown.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Flame className="h-4 w-4" />
                Top Issues
              </h4>
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-2 font-medium">Issue</th>
                        <th className="text-right p-2 font-medium">Count</th>
                        <th className="text-right p-2 font-medium">Avg Heat</th>
                        <th className="text-right p-2 font-medium">Max Heat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.issue_breakdown.map((iss) => (
                        <tr key={iss.label} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-2 font-medium max-w-[240px] truncate">{iss.label}</td>
                          <td className="p-2 text-right">{iss.count}</td>
                          <td className="p-2 text-right">
                            <span className={HEAT_COLORS[Math.round(iss.avg_heat)] ?? 'text-muted-foreground'}>
                              {iss.avg_heat}
                            </span>
                          </td>
                          <td className="p-2 text-right">
                            <Badge
                              className={`text-[10px] ${HEAT_COLORS[iss.max_heat] ?? ''}`}
                              variant="secondary"
                            >
                              {iss.max_heat}/5
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
