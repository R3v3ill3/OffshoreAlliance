'use client'

/**
 * Whole-of-worker SMS history (brief §7.3 context scoping — the "all
 * history" leg), rendered beside WorkerCallHistoryPanel on the worker
 * page: every conversation the worker appears in plus the blast send
 * log.
 *
 * Conversations come via /api/sms/conversations (the Phase 2 tables are
 * not in the generated types yet); the blast log reads sms_send_log
 * directly through the typed browser client (Phase 1 schema is
 * generated).
 */
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { fetchApi } from '@/lib/api/fetch-api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toDisplay } from '@/lib/phone/normalise-phone'
import type { SmsConversationListItem } from '@/lib/hooks/useSmsInbox'

interface WorkerSmsHistoryPanelProps {
  workerId: number
  limit?: number
  showHeader?: boolean
}

const CONVERSATION_STATE_COLORS: Record<string, string> = {
  needs_message: 'bg-slate-100 text-slate-700',
  messaged: 'bg-blue-100 text-blue-700',
  needs_response: 'bg-amber-100 text-amber-800',
  convo: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-500',
  triage: 'bg-purple-100 text-purple-700',
}

const SEND_STATUS_COLORS: Record<string, string> = {
  queued: 'bg-indigo-100 text-indigo-700',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  blocked: 'bg-amber-100 text-amber-800',
}

interface SendLogEntry {
  send_id: number
  status: string
  created_at: string
  segments: number | null
  reply_count: number
  draft: {
    title: string | null
    campaign: { name: string } | null
  } | null
}

export function WorkerSmsHistoryPanel({
  workerId,
  limit = 25,
  showHeader = true,
}: WorkerSmsHistoryPanelProps) {
  const { data: conversations, isLoading: convsLoading } = useQuery({
    queryKey: ['worker-sms-conversations', workerId],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/sms/conversations?inbox=all&worker_id=${workerId}&limit=${limit}`,
      )
      if (!res.ok) throw new Error('Failed to fetch SMS conversations')
      return res.json() as Promise<SmsConversationListItem[]>
    },
    enabled: workerId > 0,
  })

  const { data: sends, isLoading: sendsLoading } = useQuery({
    queryKey: ['worker-sms-sends', workerId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('sms_send_log')
        .select(
          'send_id, status, created_at, segments, reply_count, draft:campaign_comms_drafts(title, campaign:campaigns(name))',
        )
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as SendLogEntry[]
    },
    enabled: workerId > 0,
  })

  const isLoading = convsLoading || sendsLoading

  if (isLoading) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>SMS history</CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  const hasAny =
    (conversations?.length ?? 0) > 0 || (sends?.length ?? 0) > 0

  if (!hasAny) {
    return (
      <Card>
        {showHeader && (
          <CardHeader>
            <CardTitle>SMS history</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No SMS activity recorded for this worker yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            SMS history
            <Badge variant="secondary">
              {(conversations?.length ?? 0) + (sends?.length ?? 0)}
            </Badge>
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {(conversations?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Conversations
            </p>
            {(conversations ?? []).map((conv) => (
              <div
                key={conv.conversation_id}
                className="rounded-md border border-border p-3 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {conv.campaign?.name ?? 'Org-wide'}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      via{' '}
                      {conv.our_number?.label ||
                        (conv.our_number
                          ? toDisplay(conv.our_number.phone_e164)
                          : 'unknown number')}
                    </span>
                  </p>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${CONVERSATION_STATE_COLORS[conv.state] || ''}`}
                  >
                    {conv.state.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {toDisplay(conv.phone_e164)}
                  {conv.last_message_at &&
                    ` · last message ${formatDistanceToNow(
                      new Date(conv.last_message_at),
                      { addSuffix: true },
                    )}`}
                  {conv.unread_count > 0 && ` · ${conv.unread_count} unread`}
                </p>
              </div>
            ))}
          </div>
        )}

        {(sends?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Blast sends
            </p>
            {(sends ?? []).map((send) => (
              <div
                key={send.send_id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {send.draft?.title || 'SMS blast'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {send.draft?.campaign?.name ?? '—'} ·{' '}
                    {formatDistanceToNow(new Date(send.created_at), {
                      addSuffix: true,
                    })}
                    {send.reply_count > 0 &&
                      ` · ${send.reply_count} repl${send.reply_count === 1 ? 'y' : 'ies'}`}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-xs ${SEND_STATUS_COLORS[send.status] || ''}`}
                >
                  {send.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
