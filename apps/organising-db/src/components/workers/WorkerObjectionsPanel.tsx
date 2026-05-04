'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDistanceToNow } from 'date-fns'

interface WorkerObjectionsPanelProps {
  workerId: number
  limit?: number
  showHeader?: boolean
}

interface ObjectionRow {
  id: number
  outcome: 'fully_resolved' | 'partially_resolved' | 'not_resolved'
  custom_label: string | null
  notes: string | null
  created_at: string
  objection: { label: string } | null
  attempt: {
    attempt_id: number
    started_at: string
    dial_disposition: string | null
    call_disposition: string | null
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

function outcomeColor(outcome: string): string {
  switch (outcome) {
    case 'fully_resolved':
      return 'bg-green-100 text-green-700'
    case 'partially_resolved':
      return 'bg-amber-100 text-amber-700'
    case 'not_resolved':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'fully_resolved':
      return 'Resolved'
    case 'partially_resolved':
      return 'Partially Resolved'
    case 'not_resolved':
      return 'Not Resolved'
    default:
      return outcome
  }
}

export function WorkerObjectionsPanel({
  workerId,
  limit = 50,
  showHeader = true,
}: WorkerObjectionsPanelProps) {
  const supabase = createClient()

  const { data: objections = [], isLoading } = useQuery({
    queryKey: ['worker-objections', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_attempt_objections')
        .select(`
          id,
          outcome,
          custom_label,
          notes,
          created_at,
          objection:call_objections(label),
          attempt:call_attempts(
            attempt_id, started_at, dial_disposition, call_disposition,
            list_item:call_list_items(
              list:call_lists(list_id, name, campaign_id, campaign:campaigns(name))
            )
          )
        `)
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return (data ?? []) as unknown as ObjectionRow[]
    },
    enabled: workerId > 0,
  })

  // Aggregate by objection label for the summary
  const objectionSummary = objections.reduce(
    (acc, obj) => {
      const label = obj.objection?.label || obj.custom_label || 'Unknown'
      if (!acc[label]) {
        acc[label] = { count: 0, outcomes: {} as Record<string, number> }
      }
      acc[label].count++
      acc[label].outcomes[obj.outcome] = (acc[label].outcomes[obj.outcome] || 0) + 1
      return acc
    },
    {} as Record<string, { count: number; outcomes: Record<string, number> }>
  )

  const topObjections = Object.entries(objectionSummary)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5)

  // Determine dominant outcome for each objection
  function getDominantOutcome(outcomes: Record<string, number>): string {
    return Object.entries(outcomes).sort(([, a], [, b]) => b - a)[0]?.[0] || 'not_resolved'
  }

  if (isLoading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Objections raised</CardTitle>
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

  if (objections.length === 0) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Objections raised</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No objections recorded for this worker yet.
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
            Objections raised
            <Badge variant="secondary">{objections.length}</Badge>
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {/* Recurring objections summary */}
        {topObjections.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Most frequent
            </p>
            <div className="space-y-1.5">
              {topObjections.map(([label, { count, outcomes }]) => {
                const dominant = getDominantOutcome(outcomes)
                return (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    <span className="flex-1 truncate">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-xs">
                        {count}×
                      </Badge>
                      <Badge className={`text-xs ${outcomeColor(dominant)}`}>
                        {outcomeLabel(dominant)}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Detailed list */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            All objections
          </p>
          <div className="space-y-1.5">
            {objections.map((obj) => {
              const label = obj.objection?.label || obj.custom_label || 'Unknown objection'
              const campaignName =
                obj.attempt?.list_item?.list?.campaign?.name || 'Unknown campaign'
              const callDate = obj.attempt?.started_at
                ? formatDistanceToNow(new Date(obj.attempt.started_at), { addSuffix: true })
                : 'Unknown date'

              return (
                <div
                  key={obj.id}
                  className="rounded-md border border-border px-2.5 py-2 space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {campaignName} · {callDate}
                      </p>
                    </div>
                    <Badge className={`text-xs shrink-0 ${outcomeColor(obj.outcome)}`}>
                      {outcomeLabel(obj.outcome)}
                    </Badge>
                  </div>
                  {obj.notes && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {obj.notes}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
