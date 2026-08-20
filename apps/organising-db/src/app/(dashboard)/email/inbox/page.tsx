'use client'

/**
 * Hybrid email inbox — replies to platform sends, forwarded from the
 * real reveille.net.au mailbox via SendGrid Inbound Parse. Structural
 * clone of the SMS inbox: conversation list with state filters on the
 * left, thread + reply pane on the right, staff opt-out toggle.
 *
 * The real mailbox stays the authoritative copy; replies sent from here
 * go out through the platform identity with proper threading headers.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Inbox as InboxIcon,
  Loader2,
  Mail,
  Send,
  User as UserIcon,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS } from '@/lib/api/fetch-api'

interface ConversationRow {
  conversation_id: number
  worker_id: number | null
  email_address: string
  campaign_id: number | null
  subject: string | null
  state: string
  unread_count: number
  last_message_at: string | null
  workers: {
    worker_id: number
    first_name: string | null
    last_name: string | null
    email_opt_out: boolean
  } | null
  campaigns: { campaign_id: number; name: string } | null
}

interface MessageRow {
  message_id: number
  direction: 'inbound' | 'outbound'
  subject: string | null
  body_text: string | null
  body_html: string | null
  from_email: string | null
  status: string
  created_at: string
}

interface ThreadResponse {
  conversation: ConversationRow & {
    workers:
      | (ConversationRow['workers'] & {
          email: string | null
          email_opt_out_source: string | null
        })
      | null
  }
  messages: MessageRow[]
}

const STATE_TABS = [
  { value: 'open', label: 'Open' },
  { value: 'needs_response', label: 'Needs response' },
  { value: 'triage', label: 'Triage' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

function formatWhen(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function workerName(c: ConversationRow): string {
  const w = c.workers
  const name = [w?.first_name, w?.last_name].filter(Boolean).join(' ')
  return name || c.email_address
}

export default function EmailInboxPage() {
  const queryClient = useQueryClient()
  const [stateFilter, setStateFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [reply, setReply] = useState('')

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['email-conversations', stateFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ state: stateFilter })
      if (search.trim()) params.set('q', search.trim())
      const res = await fetchApi(`/api/email/conversations?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load inbox')
      return json.conversations as ConversationRow[]
    },
    refetchInterval: 30_000,
  })

  const { data: thread } = useQuery({
    queryKey: ['email-conversation', selectedId],
    queryFn: async () => {
      const res = await fetchApi(`/api/email/conversations/${selectedId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load thread')
      return json as ThreadResponse
    },
    enabled: selectedId != null,
    refetchInterval: 20_000,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['email-conversations'] })
    if (selectedId != null) {
      void queryClient.invalidateQueries({ queryKey: ['email-conversation', selectedId] })
    }
  }

  const replyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchApi(`/api/email/conversations/${selectedId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body_text: reply.trim() }),
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Reply failed')
    },
    onSuccess: () => {
      setReply('')
      toast.success('Reply sent.')
      invalidate()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Reply failed'),
  })

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await fetchApi(`/api/email/conversations/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Update failed')
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Update failed'),
  })

  const conv = thread?.conversation

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <InboxIcon className="h-6 w-6" />
          Email inbox
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Replies to platform sends, forwarded from the reveille.net.au
          mailbox. The mailbox keeps the authoritative copy — replies sent
          here go out via the platform.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Conversation list */}
        <div className="lg:w-96 shrink-0 space-y-3">
          <Tabs value={stateFilter} onValueChange={setStateFilter}>
            <TabsList className="w-full">
              {STATE_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="text-xs flex-1">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input
            placeholder="Search address or subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm"
          />
          <div className="border rounded-md divide-y max-h-[65vh] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (conversations ?? []).length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No conversations.
              </div>
            ) : (
              (conversations ?? []).map((c) => (
                <button
                  key={c.conversation_id}
                  type="button"
                  onClick={() => setSelectedId(c.conversation_id)}
                  className={`w-full text-left p-3 hover:bg-muted/60 ${
                    selectedId === c.conversation_id ? 'bg-muted' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {workerName(c)}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatWhen(c.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">
                      {c.subject ?? '(no subject)'}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {c.unread_count > 0 && (
                        <Badge className="text-[10px] px-1.5">{c.unread_count}</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        {c.state.replace('_', ' ')}
                      </Badge>
                    </span>
                  </div>
                  {c.campaigns?.name && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {c.campaigns.name}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread pane */}
        <div className="flex-1 border rounded-md flex flex-col min-h-[65vh]">
          {!conv ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              <Mail className="h-4 w-4 mr-2" />
              Select a conversation
            </div>
          ) : (
            <>
              <div className="border-b p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {workerName(conv)}{' '}
                    <span className="text-muted-foreground font-normal">
                      &lt;{conv.email_address}&gt;
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {conv.subject ?? '(no subject)'}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {conv.worker_id && (
                    <>
                      <label className="flex items-center gap-1.5 text-xs">
                        <Switch
                          checked={conv.workers?.email_opt_out ?? false}
                          onCheckedChange={(v) =>
                            patchMutation.mutate({ worker_email_opt_out: v })
                          }
                        />
                        Email opt-out
                      </label>
                      <Link
                        href={`/workers/${conv.worker_id}`}
                        className="text-xs underline flex items-center gap-1"
                      >
                        <UserIcon className="h-3 w-3" /> Profile
                      </Link>
                    </>
                  )}
                  {conv.state !== 'closed' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => patchMutation.mutate({ state: 'closed' })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Close
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => patchMutation.mutate({ state: 'needs_response' })}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reopen
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {(thread?.messages ?? []).map((m) => (
                  <div
                    key={m.message_id}
                    className={`max-w-[85%] rounded-lg border p-3 text-sm ${
                      m.direction === 'outbound'
                        ? 'ml-auto bg-primary/5 border-primary/20'
                        : 'bg-muted/40'
                    }`}
                  >
                    <div className="text-[10px] text-muted-foreground mb-1 flex items-center justify-between gap-3">
                      <span>
                        {m.direction === 'outbound' ? 'Us' : (m.from_email ?? 'Member')}
                      </span>
                      <span>{formatWhen(m.created_at)}</span>
                    </div>
                    {m.body_html ? (
                      <iframe
                        title={`message-${m.message_id}`}
                        sandbox=""
                        srcDoc={m.body_html}
                        className="w-full h-48 bg-white rounded border"
                      />
                    ) : (
                      <div className="whitespace-pre-wrap">{m.body_text ?? ''}</div>
                    )}
                  </div>
                ))}
                {(thread?.messages ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No messages.</p>
                )}
              </div>

              <div className="border-t p-3 space-y-2">
                {conv.workers?.email_opt_out && (
                  <p className="text-xs text-amber-700">
                    This worker has unsubscribed from email — replies are
                    blocked until the opt-out is cleared.
                  </p>
                )}
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={`Reply to ${conv.email_address}…`}
                  rows={3}
                  className="text-sm"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => replyMutation.mutate()}
                    disabled={
                      !reply.trim() ||
                      replyMutation.isPending ||
                      (conv.workers?.email_opt_out ?? false)
                    }
                  >
                    {replyMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Send reply
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
