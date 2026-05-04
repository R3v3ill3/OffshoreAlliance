'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDistanceToNow } from 'date-fns'
import { ISSUE_HEAT_LEVELS } from '@/lib/situation-analysis/constants'

interface WorkerIssueObservationsPanelProps {
  workerId: number
  limit?: number
  showHeader?: boolean
}

interface IssueObservationRow {
  id: number
  issue_label: string
  heat: number
  notes: string | null
  created_at: string
  attempt: {
    attempt_id: number
    started_at: string
    list_item: {
      list: {
        list_id: number
        name: string
        campaign_id: number
        campaign: { name: string } | null
      } | null
    } | null
  } | null
}

const HEAT_LABEL: Record<number, string> = Object.fromEntries(
  ISSUE_HEAT_LEVELS.map(({ value, label }) => [value, label])
)

function heatColor(heat: number): string {
  switch (heat) {
    case 1:
      return 'text-blue-600 bg-blue-50 border-blue-200'
    case 2:
      return 'text-cyan-600 bg-cyan-50 border-cyan-200'
    case 3:
      return 'text-amber-600 bg-amber-50 border-amber-200'
    case 4:
      return 'text-orange-600 bg-orange-50 border-orange-200'
    case 5:
      return 'text-red-600 bg-red-50 border-red-200'
    default:
      return 'text-slate-600 bg-slate-50 border-slate-200'
  }
}

export function WorkerIssueObservationsPanel({
  workerId,
  limit = 50,
  showHeader = true,
}: WorkerIssueObservationsPanelProps) {
  const supabase = createClient()

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ['worker-issue-observations', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_issue_observations')
        .select(`
          id,
          issue_label,
          heat,
          notes,
          created_at,
          attempt:call_attempts(
            attempt_id, started_at,
            list_item:call_list_items(
              list:call_lists(list_id, name, campaign_id, campaign:campaigns(name))
            )
          )
        `)
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return (data ?? []) as unknown as IssueObservationRow[]
    },
    enabled: workerId > 0,
  })

  if (isLoading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Issue observations</CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (issues.length === 0) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Issue observations</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No issues recorded for this worker yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Issue observations
            <Badge variant="secondary">{issues.length}</Badge>
          </CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <div className="space-y-1.5">
          {issues.map((issue) => {
            const campaignName =
              issue.attempt?.list_item?.list?.campaign?.name || 'Unknown campaign'
            const callDate = issue.attempt?.started_at
              ? formatDistanceToNow(new Date(issue.attempt.started_at), { addSuffix: true })
              : 'Unknown date'

            return (
              <div
                key={issue.id}
                className="rounded-md border border-border px-2.5 py-2 space-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{issue.issue_label}</p>
                    <p className="text-xs text-muted-foreground">
                      {campaignName} · {callDate}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs border shrink-0 ${heatColor(issue.heat)}`}
                  >
                    {HEAT_LABEL[issue.heat] ?? issue.heat}
                  </Badge>
                </div>
                {issue.notes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {issue.notes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
