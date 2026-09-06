'use client'

/**
 * EmailHistorySection — worker profile card showing all emails sent to this
 * worker across every campaign, with engagement status badges and thread links.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ExternalLink,
  Mail,
  Loader2,
  AlertTriangle,
  MessageSquareText,
} from 'lucide-react'
import { format } from 'date-fns'
import { ConversationThreadDialog } from './ConversationThreadDialog'

interface EmailSendRow {
  send_id: number
  draft_id: number
  campaign_id: number
  recipient_email: string
  send_method: string
  conversation_id: string | null
  created_at: string
  replied_at: string | null
  reply_count: number
  latest_reply_message_id: string | null
  bounced_at: string | null
  bounce_reason: string | null
  first_click_at: string | null
  click_count: number
  draft: {
    subject: string | null
    campaign: { name: string } | null
  } | null
}

interface InboxConversationRow {
  conversation_id: number
  campaign_id: number | null
  subject: string | null
  state: string
  unread_count: number
  last_message_at: string | null
  campaign: { name: string } | null
}

function MethodBadge({ method }: { method: string }) {
  const labels: Record<string, string> = {
    outlook_personalised: 'Outlook (personalised)',
    outlook_bcc: 'Outlook (BCC)',
    action_network: 'Action Network',
    mailto: 'Mail client',
    eml: '.eml download',
    sendgrid: 'Platform email',
    outlook_direct: 'Outlook (direct)',
    outlook_send_personalised: 'Outlook (personalised)',
    outlook_send_bcc: 'Outlook (BCC)',
  }
  return (
    <span className="text-[10px] text-muted-foreground">
      {labels[method] ?? method}
    </span>
  )
}

interface Props {
  workerId: number
}

export function EmailHistorySection({ workerId }: Props) {
  const supabase = createClient()
  const [threadSendId, setThreadSendId] = useState<number | null>(null)
  const [threadConversationId, setThreadConversationId] = useState<string | null>(null)

  const { data: sends = [], isLoading } = useQuery({
    queryKey: ['worker-email-history', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_send_log')
        .select(
          `send_id, draft_id, campaign_id, recipient_email, send_method,
           conversation_id, created_at, replied_at, reply_count,
           latest_reply_message_id, bounced_at, bounce_reason,
           first_click_at, click_count,
           draft:campaign_comms_drafts(
             subject,
             campaign:campaigns(name)
           )`,
        )
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as EmailSendRow[]
    },
    enabled: !!workerId,
  })

  const { data: inboxConversations = [], isLoading: inboxLoading } = useQuery({
    queryKey: ['worker-email-inbox-history', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_conversations')
        .select(
          `conversation_id, campaign_id, subject, state, unread_count,
           last_message_at, campaign:campaigns(name)`,
        )
        .eq('worker_id', workerId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as InboxConversationRow[]
    },
    enabled: !!workerId,
  })

  const openThread = (send: EmailSendRow) => {
    if (!send.conversation_id) return
    setThreadSendId(send.send_id)
    setThreadConversationId(send.conversation_id)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || inboxLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sends.length === 0 && inboxConversations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No emails recorded for this worker yet.
            </p>
          ) : (
            <div className="space-y-4">
              {inboxConversations.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <MessageSquareText className="h-3.5 w-3.5" />
                    Inbox conversations
                  </div>
                  {inboxConversations.map((conversation) => {
                    const href =
                      conversation.campaign_id != null
                        ? `/campaigns/${conversation.campaign_id}?tab=outreach&sub=comms&email_view=inbox&conversation=${conversation.conversation_id}`
                        : `/email/inbox?conversation=${conversation.conversation_id}`
                    return (
                      <Link
                        key={conversation.conversation_id}
                        href={href}
                        className="block rounded-md border p-3 text-sm hover:bg-muted/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {conversation.subject || '(no subject)'}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {conversation.campaign?.name || 'Organisation-wide'}
                              {conversation.last_message_at
                                ? ` · ${format(
                                    new Date(conversation.last_message_at),
                                    'dd MMM yyyy',
                                  )}`
                                : ''}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {conversation.unread_count > 0 && (
                              <Badge>{conversation.unread_count}</Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              {conversation.state.replaceAll('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </section>
              )}
              {sends.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Campaign send log
                </div>
              )}
              {sends.map((send) => {
                const campaignName =
                  (send.draft?.campaign as { name?: string } | null)?.name ??
                  `Campaign ${send.campaign_id}`
                const subject = send.draft?.subject ?? '(no subject)'
                const isBounced = !!send.bounced_at
                const isReplied = !!send.replied_at
                const isClicked = !!send.first_click_at
                const hasThread = !!send.conversation_id

                return (
                  <div
                    key={send.send_id}
                    className={`rounded-md border p-3 text-sm space-y-1 ${
                      isBounced ? 'border-destructive/40 bg-destructive/5' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{subject}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {campaignName} ·{' '}
                          {format(new Date(send.created_at), 'dd MMM yyyy')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                        {isBounced && (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Bounced
                          </Badge>
                        )}
                        {isReplied && (
                          <Badge
                            className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200"
                            variant="outline"
                          >
                            {send.reply_count > 1
                              ? `${send.reply_count} replies`
                              : 'Replied'}
                          </Badge>
                        )}
                        {isClicked && (
                          <Badge
                            className="text-[10px] bg-sky-100 text-sky-800 border-sky-200"
                            variant="outline"
                          >
                            Clicked
                            {send.click_count > 1 ? ` ×${send.click_count}` : ''}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <MethodBadge method={send.send_method} />

                      {hasThread && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[10px] text-primary"
                          onClick={() => openThread(send)}
                        >
                          View thread
                        </Button>
                      )}

                      {isReplied && send.reply_count > 1 && send.latest_reply_message_id && (
                        <a
                          href={`https://outlook.office.com/mail/inbox/id/${encodeURIComponent(
                            send.latest_reply_message_id,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                        >
                          Open latest in Outlook
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>

                    {isBounced && send.bounce_reason && (
                      <p className="text-[10px] text-destructive">
                        Reason: {send.bounce_reason}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {threadConversationId && (
        <ConversationThreadDialog
          open={threadSendId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setThreadSendId(null)
              setThreadConversationId(null)
            }
          }}
          conversationId={threadConversationId}
        />
      )}
    </>
  )
}
