'use client'

/**
 * SMS thread pane: message bubbles by direction, internal notes inline
 * in a distinct colour (Textline "Whisper"), day separators, presence
 * pill + typing-collision warning (warn, don't block), soft-claim
 * banner, and the reply composer with a live segment counter.
 *
 * Replies are never blackout-blocked and carry no compliance footer
 * (brief decision 6) — the typed body is sent as-is.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { format, formatDistanceToNow, isSameDay } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  Info,
  Loader2,
  Lock,
  Send,
  StickyNote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { countSegments } from '@/lib/sms/segments'
import { toDisplay } from '@/lib/phone/normalise-phone'
import {
  useSendSmsReply,
  useSmsConversationClaim,
  useSmsConversationRealtime,
  type SmsConversationDetail,
} from '@/lib/hooks/useSmsInbox'
import type { SmsConversationNoteRow, SmsMessageRow } from '@/types/sms'
import { CONVERSATION_STATE_COLORS, conversationTitle } from './sms-inbox-shared'

type TimelineEntry =
  | { kind: 'message'; at: string; message: SmsMessageRow }
  | { kind: 'note'; at: string; note: SmsConversationNoteRow }

interface SmsThreadViewProps {
  detail: SmsConversationDetail
  draft: string
  onDraftChange: (draft: string) => void
  onBack: () => void
  onOpenSidebar: () => void
}

export function SmsThreadView({
  detail,
  draft,
  onDraftChange,
  onBack,
  onOpenSidebar,
}: SmsThreadViewProps) {
  const { conversation, messages, notes, user_names } = detail
  const conversationId = conversation.conversation_id
  const sendReply = useSendSmsReply(conversationId)
  const claim = useSmsConversationClaim(conversationId)
  const realtime = useSmsConversationRealtime(conversationId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sending, setSending] = useState(false)

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...messages.map((m) => ({
        kind: 'message' as const,
        at: m.created_at,
        message: m,
      })),
      ...notes.map((n) => ({
        kind: 'note' as const,
        at: n.created_at,
        note: n,
      })),
    ]
    return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  }, [messages, notes])

  useEffect(() => {
    // Keep the newest message in view on load/update.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [timeline.length, conversationId])

  const seg = countSegments(draft || '')

  const handleDraftChange = (value: string) => {
    onDraftChange(value)
    realtime.setTyping(true)
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => realtime.setTyping(false), 2000)
  }

  const submit = () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    sendReply.mutate(body, {
      onSuccess: () => {
        onDraftChange('')
        realtime.setTyping(false)
      },
      onError: (err: Error) => toast.error(err.message),
      onSettled: () => setSending(false),
    })
  }

  const optedOut = !!conversation.worker?.sms_opt_out

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden -ml-2"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {conversationTitle(conversation)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {toDisplay(conversation.phone_e164)}
            {conversation.campaign ? ` · ${conversation.campaign.name}` : ''}
            {conversation.our_number
              ? ` · via ${conversation.our_number.label || toDisplay(conversation.our_number.phone_e164)}`
              : ''}
          </p>
        </div>
        <Badge
          variant="secondary"
          className={CONVERSATION_STATE_COLORS[conversation.state] || ''}
        >
          {conversation.state.replace('_', ' ')}
        </Badge>
        {realtime.viewers.length > 0 && (
          <Badge
            variant="secondary"
            className="hidden items-center gap-1 bg-sky-100 text-sky-800 sm:flex"
            title={realtime.viewers.map((v) => v.name).join(', ')}
          >
            <Eye className="h-3 w-3" />
            {realtime.viewers.length === 1
              ? `${realtime.viewers[0].name} is viewing`
              : `${realtime.viewers.length} others viewing`}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="xl:hidden"
          title="Member details"
          onClick={onOpenSidebar}
        >
          <Info className="h-4 w-4" />
        </Button>
      </div>

      {/* Advisory claim warning — never blocks. */}
      {!claim.claimed && claim.holderName && (
        <div className="flex items-center gap-2 border-b bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          <Lock className="h-3 w-3 shrink-0" />
          {claim.holderName} is working this conversation — coordinate before
          replying.
        </div>
      )}

      {/* Timeline */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {timeline.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet.
          </p>
        )}
        {timeline.map((entry, i) => {
          const prev = timeline[i - 1]
          const showDay =
            !prev || !isSameDay(new Date(prev.at), new Date(entry.at))
          return (
            <div key={`${entry.kind}-${entry.kind === 'message' ? entry.message.message_id : entry.note.note_id}`}>
              {showDay && (
                <div className="my-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(entry.at), 'EEE d MMM yyyy')}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              {entry.kind === 'message' ? (
                <MessageBubble message={entry.message} userNames={user_names} />
              ) : (
                <NoteBubble note={entry.note} userNames={user_names} />
              )}
            </div>
          )
        })}
      </div>

      {/* Composer */}
      <div className="border-t p-3">
        {realtime.someoneElseTyping && (
          <p className="mb-1 flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            Someone else is typing a reply to this thread.
          </p>
        )}
        {optedOut ? (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            This member has opted out of SMS — replies are disabled. They can
            text START to resubscribe.
          </p>
        ) : (
          <>
            <Textarea
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              placeholder="Type a reply… (sent exactly as written — no footer added)"
              rows={2}
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
              }}
            />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {draft.length > 0
                  ? `${seg.length ?? draft.length} chars · ${seg.segments} segment${seg.segments === 1 ? '' : 's'}`
                  : 'One-to-one replies are never window-blocked.'}
              </span>
              <Button size="sm" disabled={!draft.trim() || sending} onClick={submit}>
                {sending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Send className="mr-1 h-3 w-3" />
                )}
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  userNames,
}: {
  message: SmsMessageRow
  userNames: Record<string, string>
}) {
  const inbound = message.direction === 'inbound'
  const senderName = message.sender_user_id
    ? userNames[message.sender_user_id]
    : null
  return (
    <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          inbound
            ? 'bg-muted text-foreground'
            : 'bg-primary text-primary-foreground'
        }`}
      >
        {message.body || <span className="italic opacity-70">(empty)</span>}
        <div
          className={`mt-1 flex items-center gap-1.5 text-[10px] ${
            inbound ? 'text-muted-foreground' : 'text-primary-foreground/70'
          }`}
        >
          {!inbound && senderName && <span>{senderName}</span>}
          <span>
            {formatDistanceToNow(new Date(message.created_at), {
              addSuffix: true,
            })}
          </span>
          {!inbound && message.status === 'delivered' && <span>· delivered</span>}
          {message.status === 'failed' && (
            <span className={inbound ? 'text-red-600' : 'text-red-200'}>
              · failed{message.error ? ` — ${message.error}` : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function NoteBubble({
  note,
  userNames,
}: {
  note: SmsConversationNoteRow
  userNames: Record<string, string>
}) {
  return (
    <div className="flex justify-center">
      <div className="max-w-[90%] rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
        <span className="mr-1 inline-flex items-center gap-1 font-medium">
          <StickyNote className="h-3 w-3" />
          {userNames[note.author_user_id] ?? 'Staff note'}
        </span>
        <span className="whitespace-pre-wrap">{note.body}</span>
        <span className="ml-1.5 text-[10px] text-amber-700">
          {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  )
}
