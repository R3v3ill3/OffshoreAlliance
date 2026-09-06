'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { format, formatDistanceToNow, isSameDay } from 'date-fns'
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  FileUp,
  Info,
  Loader2,
  Lock,
  Mail,
  Paperclip,
  Send,
  StickyNote,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  useEmailConversationAction,
  useEmailConversationClaim,
  useEmailConversationRealtime,
  useSendEmailReply,
} from '@/lib/hooks/useEmailInbox'
import type {
  EmailConversationDetail,
  EmailConversationNote,
  EmailMessage,
} from '@/types/email-inbox'
import { EmailMessageContent } from './EmailMessageContent'

export interface EmailDraftState {
  body: string
  subject: string
  attachments: File[]
}

type TimelineEntry =
  | { kind: 'message'; at: string; message: EmailMessage }
  | { kind: 'note'; at: string; note: EmailConversationNote }

function conversationName(detail: EmailConversationDetail): string {
  const worker = detail.conversation.worker
  const name = [worker?.preferred_name || worker?.first_name, worker?.last_name]
    .filter(Boolean)
    .join(' ')
  return name || detail.conversation.email_address
}

function defaultReplySubject(subject: string | null): string {
  const value = subject?.trim() || '(no subject)'
  return /^re:/i.test(value) ? value : `Re: ${value}`
}

export function EmailThreadView({
  detail,
  draft,
  onDraftChange,
  onBack,
  onOpenSidebar,
  onLoadOlder,
  loadingOlder,
}: {
  detail: EmailConversationDetail
  draft: EmailDraftState
  onDraftChange: (draft: EmailDraftState) => void
  onBack: () => void
  onOpenSidebar: () => void
  onLoadOlder: () => void
  loadingOlder: boolean
}) {
  const { conversation, messages, notes, user_names, originating_send: origin } = detail
  const sendReply = useSendEmailReply(conversation.conversation_id)
  const action = useEmailConversationAction(conversation.conversation_id)
  const claim = useEmailConversationClaim(conversation.conversation_id)
  const realtime = useEmailConversationRealtime(conversation.conversation_id)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [originExpanded, setOriginExpanded] = useState(false)

  const subject = draft.subject || defaultReplySubject(conversation.subject)
  const timeline = useMemo<TimelineEntry[]>(
    () =>
      [
        ...messages.map((message) => ({
          kind: 'message' as const,
          at: message.created_at,
          message,
        })),
        ...notes.map((note) => ({
          kind: 'note' as const,
          at: note.created_at,
          note,
        })),
      ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    [messages, notes],
  )
  const newestMessageId = messages[messages.length - 1]?.message_id
  const newestNoteId = notes[notes.length - 1]?.note_id

  useEffect(() => {
    if (conversation.unread_count > 0) {
      action.mutate({ action: 'mark_read' })
    }
    // Mark once when this conversation is opened. Realtime invalidation may
    // refresh the object; action state prevents duplicate meaningful writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.conversation_id])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [conversation.conversation_id, newestMessageId, newestNoteId])

  useEffect(() => {
    return () => {
      if (typingTimeout.current) clearTimeout(typingTimeout.current)
    }
  }, [conversation.conversation_id])

  const updateBody = (body: string) => {
    onDraftChange({ ...draft, body, subject })
    realtime.setTyping(true)
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => realtime.setTyping(false), 2000)
  }

  const submit = () => {
    if (!draft.body.trim() || sendReply.isPending) return
    sendReply.mutate(
      {
        body: draft.body.trim(),
        subject: subject.trim(),
        attachments: draft.attachments,
      },
      {
        onSuccess: (result) => {
          onDraftChange({
            body: '',
            subject: defaultReplySubject(subject),
            attachments: [],
          })
          realtime.setTyping(false)
          if (result.persistence_warnings?.length) {
            toast.warning(
              'Email sent, but it was not fully saved to the inbox. Do not resend it.',
            )
          } else if (result.attachment_warnings?.length) {
            toast.warning(
              'Email sent, but one or more attachment copies could not be archived.',
            )
          } else {
            toast.success('Email reply sent')
          }
        },
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  const previousSubjects = new Set<string>()
  const optedOut = conversation.worker?.email_opt_out ?? false

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 md:hidden"
          aria-label="Back to conversations"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{conversationName(detail)}</p>
          <p className="truncate text-xs text-foreground">
            {conversation.subject || '(no subject)'}
          </p>
          {conversation.original_subject &&
            conversation.original_subject !== conversation.subject && (
              <p className="truncate text-[11px] text-muted-foreground">
                Started as: {conversation.original_subject}
              </p>
            )}
          <p className="truncate text-xs text-muted-foreground">
            {conversation.email_address}
            {conversation.campaign ? (
              <>
                {' · '}
                <Link
                  href={`/campaigns/${conversation.campaign.campaign_id}?tab=outreach&sub=comms&email_view=inbox&conversation=${conversation.conversation_id}`}
                  className="hover:underline"
                >
                  {conversation.campaign.name}
                </Link>
              </>
            ) : (
              ' · Organisation-wide'
            )}
          </p>
        </div>
        <Badge variant="secondary">
          {conversation.state.replaceAll('_', ' ')}
        </Badge>
        {realtime.viewers.length > 0 && (
          <Badge
            variant="outline"
            className="hidden items-center gap-1 sm:flex"
            title={realtime.viewers.map((viewer) => viewer.name).join(', ')}
          >
            <Eye className="h-3 w-3" />
            {realtime.viewers.length === 1
              ? `${realtime.viewers[0].name} viewing`
              : `${realtime.viewers.length} viewing`}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="xl:hidden"
          aria-label="Open worker and campaign details"
          onClick={onOpenSidebar}
        >
          <Info className="h-4 w-4" />
        </Button>
      </header>

      {!claim.claimed && claim.holderName && (
        <div className="flex items-center gap-2 border-b bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          {claim.holderName} is already working on this conversation. You can
          still read and reply, but coordinate first.
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {detail.has_more_messages && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingOlder}
              onClick={onLoadOlder}
            >
              {loadingOlder && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Load older messages
            </Button>
          </div>
        )}

        {origin && (
          <div className="rounded-md border border-dashed bg-muted/20 p-3">
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">Originating campaign email</p>
                <p className="truncate text-sm">{origin.subject || '(no subject)'}</p>
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(origin.created_at), 'd MMM yyyy, h:mm a')}
                  {' · '}
                  {origin.send_method}
                  {origin.delivered_at ? ' · delivered' : ''}
                  {origin.first_open_at ? ` · opened ${origin.open_count || 1}×` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => setOriginExpanded((value) => !value)}
              >
                {originExpanded ? 'Hide' : 'Preview'}
              </Button>
            </div>
            {originExpanded && (
              <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-background p-2 text-xs">
                {origin.body ||
                  (origin.body_html
                    ? origin.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
                    : 'No body preview available.')}
              </div>
            )}
          </div>
        )}

        {timeline.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No messages in this conversation yet.
          </div>
        )}

        {timeline.map((entry, index) => {
          const previous = timeline[index - 1]
          const showDay =
            !previous || !isSameDay(new Date(previous.at), new Date(entry.at))
          if (entry.kind === 'note') {
            return (
              <div key={`note-${entry.note.note_id}`}>
                {showDay && <DaySeparator date={entry.at} />}
                <div className="flex justify-center">
                  <div className="max-w-[90%] rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    <span className="mr-1 inline-flex items-center gap-1 font-semibold">
                      <StickyNote className="h-3 w-3" />
                      {(entry.note.author_user_id
                        ? user_names[entry.note.author_user_id]
                        : null) || 'Staff note'}
                    </span>
                    <span className="whitespace-pre-wrap">{entry.note.body}</span>
                    <span className="ml-2 text-[11px] text-amber-800">
                      {formatDistanceToNow(new Date(entry.note.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            )
          }

          const normalisedSubject = entry.message.subject
            ?.replace(/^(\s*((re|fw|fwd)\s*:\s*))+/i, '')
            .trim()
            .toLowerCase()
          const showSubject =
            !!normalisedSubject &&
            previousSubjects.size > 0 &&
            !previousSubjects.has(normalisedSubject)
          if (normalisedSubject) previousSubjects.add(normalisedSubject)
          const inbound = entry.message.direction === 'inbound'
          return (
            <div key={`message-${entry.message.message_id}`}>
              {showDay && <DaySeparator date={entry.at} />}
              <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
                <article
                  className={`w-full max-w-[92%] rounded-lg border p-3 sm:max-w-[85%] ${
                    inbound ? 'bg-muted/30' : 'border-primary/20 bg-primary/5'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {inbound
                        ? entry.message.from_email || conversation.email_address
                        : user_names[entry.message.sender_user_id || ''] || 'Offshore Alliance'}
                    </span>
                    <time dateTime={entry.message.created_at} className="shrink-0">
                      {format(new Date(entry.message.created_at), 'd MMM, h:mm a')}
                    </time>
                  </div>
                  <EmailMessageContent
                    message={entry.message}
                    showSubject={showSubject}
                  />
                </article>
              </div>
            </div>
          )
        })}
      </div>

      <footer className="border-t p-3">
        {realtime.someoneElseTyping && (
          <p className="mb-1 flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            Someone else is composing a reply.
          </p>
        )}
        {optedOut ? (
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            This worker has opted out of email. Replies are disabled until they
            ask to receive email again.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
              <span className="text-xs text-muted-foreground">To</span>
              <span className="truncate text-xs">{conversation.email_address}</span>
              <label htmlFor="email-reply-subject" className="text-xs text-muted-foreground">
                Subject
              </label>
              <Input
                id="email-reply-subject"
                value={subject}
                maxLength={500}
                className="h-8 text-xs"
                onChange={(event) =>
                  onDraftChange({ ...draft, subject: event.target.value })
                }
              />
            </div>
            <Textarea
              value={draft.body}
              rows={3}
              className="resize-none text-sm"
              aria-label={`Reply to ${conversation.email_address}`}
              placeholder="Write a reply…"
              onChange={(event) => updateBody(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  (event.metaKey || event.ctrlKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  submit()
                }
              }}
            />
            {draft.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {draft.attachments.map((file, index) => (
                  <Badge key={`${file.name}-${file.lastModified}`} variant="outline">
                    <Paperclip className="mr-1 h-3 w-3" />
                    <span className="max-w-40 truncate">{file.name}</span>
                    <button
                      type="button"
                      className="ml-1 rounded-sm"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        onDraftChange({
                          ...draft,
                          subject,
                          attachments: draft.attachments.filter(
                            (_, candidate) => candidate !== index,
                          ),
                        })
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = [...(event.target.files ?? [])]
                    onDraftChange({
                      ...draft,
                      subject,
                      attachments: [...draft.attachments, ...files].slice(0, 8),
                    })
                    event.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={sendReply.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="mr-1 h-3.5 w-3.5" />
                  Attach
                </Button>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                  Cmd/Ctrl+Enter to send
                </span>
              </div>
              <Button
                size="sm"
                disabled={!draft.body.trim() || !subject.trim() || sendReply.isPending}
                onClick={submit}
              >
                {sendReply.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1 h-3.5 w-3.5" />
                )}
                Send reply
              </Button>
            </div>
          </div>
        )}
      </footer>
    </div>
  )
}

function DaySeparator({ date }: { date: string }) {
  return (
    <div className="my-3 flex items-center gap-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">
        {format(new Date(date), 'EEE d MMM yyyy')}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}
