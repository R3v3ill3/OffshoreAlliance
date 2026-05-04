'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDistanceToNow } from 'date-fns'

interface WorkerCallHistoryPanelProps {
  workerId: number
  limit?: number
  showHeader?: boolean
}

interface CallAttemptRow {
  attempt_id: number
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  dial_disposition: string | null
  call_disposition: string | null
  cta_response: string | null
  support_level_assessed: string | null
  overall_notes: string | null
  script: { script_id: number; title: string } | null
  list_item: {
    worker_id: number
    list: {
      list_id: number
      name: string
      campaign_id: number
      campaign: { name: string } | null
    } | null
  } | null
}

function dialDispositionColor(disposition: string | null): string {
  if (!disposition) return 'bg-slate-100 text-slate-600'
  switch (disposition) {
    case 'connected':
      return 'bg-green-100 text-green-700'
    case 'no_answer':
    case 'voicemail_no_message':
      return 'bg-slate-100 text-slate-600'
    case 'voicemail_left':
      return 'bg-blue-100 text-blue-700'
    case 'busy':
      return 'bg-amber-100 text-amber-700'
    case 'disconnected':
    case 'wrong_number':
    case 'do_not_call':
      return 'bg-red-100 text-red-700'
    case 'callback_requested':
      return 'bg-purple-100 text-purple-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function callDispositionColor(disposition: string | null): string {
  if (!disposition) return 'bg-slate-100 text-slate-600'
  switch (disposition) {
    case 'completed_positive':
      return 'bg-green-100 text-green-700'
    case 'completed_neutral':
      return 'bg-slate-100 text-slate-600'
    case 'completed_negative':
      return 'bg-red-100 text-red-700'
    case 'partial_hung_up':
      return 'bg-amber-100 text-amber-700'
    case 'partial_asked_callback':
      return 'bg-purple-100 text-purple-700'
    case 'referred_to_other':
      return 'bg-blue-100 text-blue-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function ctaResponseColor(response: string | null): string {
  if (!response) return 'bg-slate-100 text-slate-600'
  switch (response) {
    case 'accepted':
      return 'bg-green-100 text-green-700'
    case 'considering':
      return 'bg-amber-100 text-amber-700'
    case 'declined':
      return 'bg-red-100 text-red-700'
    case 'not_reached':
      return 'bg-slate-100 text-slate-500'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function supportLevelColor(level: string | null): string {
  if (!level) return 'bg-slate-100 text-slate-600'
  switch (level) {
    case 'strong_supporter':
      return 'bg-green-100 text-green-800'
    case 'supporter':
      return 'bg-green-50 text-green-700'
    case 'neutral':
      return 'bg-slate-100 text-slate-600'
    case 'unsupportive':
      return 'bg-red-50 text-red-600'
    case 'hostile':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function formatLabel(str: string | null): string {
  if (!str) return '—'
  return str
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

export function WorkerCallHistoryPanel({
  workerId,
  limit = 25,
  showHeader = true,
}: WorkerCallHistoryPanelProps) {
  const supabase = createClient()

  const { data: callHistory = [], isLoading } = useQuery({
    queryKey: ['worker-call-history', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_attempts')
        .select(`
          attempt_id, started_at, ended_at, duration_seconds,
          dial_disposition, call_disposition, cta_response,
          support_level_assessed, overall_notes,
          script:call_scripts(script_id, title),
          list_item:call_list_items!inner(
            worker_id,
            list:call_lists(list_id, name, campaign_id, campaign:campaigns(name))
          )
        `)
        .eq('list_item.worker_id', workerId)
        .order('started_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return (data ?? []) as unknown as CallAttemptRow[]
    },
    enabled: workerId > 0,
  })

  if (isLoading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Call history</CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (callHistory.length === 0) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>Call history</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm text-muted-foreground">No calls recorded for this worker yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Call history
            <Badge variant="secondary">{callHistory.length}</Badge>
          </CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <div className="space-y-3">
          {callHistory.map((call) => {
            const campaignName = call.list_item?.list?.campaign?.name || 'Unknown campaign'
            const listName = call.list_item?.list?.name || 'Unknown list'
            const scriptTitle = call.script?.title || '—'
            const callDate = formatDistanceToNow(new Date(call.started_at), { addSuffix: true })

            return (
              <div
                key={call.attempt_id}
                className="rounded-md border border-border p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{campaignName}</p>
                    <p className="text-xs text-muted-foreground">
                      {listName} · {scriptTitle} · {callDate}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDuration(call.duration_seconds)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {call.dial_disposition && (
                    <Badge className={`text-xs ${dialDispositionColor(call.dial_disposition)}`}>
                      {formatLabel(call.dial_disposition)}
                    </Badge>
                  )}
                  {call.call_disposition && (
                    <Badge className={`text-xs ${callDispositionColor(call.call_disposition)}`}>
                      {formatLabel(call.call_disposition)}
                    </Badge>
                  )}
                  {call.cta_response && (
                    <Badge className={`text-xs ${ctaResponseColor(call.cta_response)}`}>
                      CTA: {formatLabel(call.cta_response)}
                    </Badge>
                  )}
                  {call.support_level_assessed && (
                    <Badge
                      className={`text-xs ${supportLevelColor(call.support_level_assessed)}`}
                    >
                      {formatLabel(call.support_level_assessed)}
                    </Badge>
                  )}
                </div>

                {call.overall_notes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2">
                    {call.overall_notes}
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
