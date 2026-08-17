'use client'

/**
 * The middle pane for a member who has not been messaged yet
 * (Phase 10, decision 7).
 *
 * The middle pane is always "the conversation with this person"; before
 * the first message, that conversation IS the opener. So instead of an
 * empty thread the organiser gets the board template resolved for this
 * member, editable, with a Send button — the progressive one-at-a-time
 * send the board was built around, without leaving the workspace.
 *
 * Everything here reuses the board's existing machinery: the same
 * template resolution as the old preview, the same per-item override
 * save, the same p2p-send route. No new send path, so opt-out
 * suppression, the 50-cap and conversation create/attach are unchanged.
 *
 * Wrong-recipient safety (brief §E0b): the member's name appears in the
 * placeholder AND on the Send button, and sending does not auto-advance.
 */
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Loader2,
  RotateCcw,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toDisplay } from '@/lib/phone/normalise-phone'
import { countSegments } from '@/lib/sms/segments'
import { validateSmsBody } from '@/lib/sms/compliance'
import { isWithinSendWindow } from '@/lib/sms/blackout'
import { p2pItemTemplate, renderP2pBody } from '@/lib/sms/p2p'
import type { SmsP2pBoardItem } from '@/types/sms'

export interface SmsOpenerComposerProps {
  item: SmsP2pBoardItem
  /** The board's shared draft body. */
  boardTemplate: string
  mergeContext: Record<string, string | undefined>
  timezone: string
  senderLabel: string | null
  boardClosed?: boolean
  sending?: boolean
  onSend: (itemId: number) => void
  /** Persist (or clear, with null) this member's custom opener. */
  onSaveOverride: (itemId: number, body: string | null) => void
}

export function SmsOpenerComposer({
  item,
  boardTemplate,
  mergeContext,
  timezone,
  senderLabel,
  boardClosed = false,
  sending = false,
  onSend,
  onSaveOverride,
}: SmsOpenerComposerProps) {
  const resolved = useMemo(
    () =>
      renderP2pBody(p2pItemTemplate(boardTemplate, item.body_override), {
        ...mergeContext,
        first_name: item.first_name,
        last_name: item.last_name,
        occupation: item.occupation ?? undefined,
        employer_name: item.employer_name ?? mergeContext.employer_name,
      }),
    [boardTemplate, item, mergeContext],
  )

  const [body, setBody] = useState(resolved)
  const [dirty, setDirty] = useState(false)
  // Switching member reloads their opener. Keyed on item_id, not on the
  // resolved text, so an in-progress edit on the SAME member survives a
  // board poll. Adjusted during render rather than in an effect — see
  // the same pattern in WorkerChatCard.
  const [seededItemId, setSeededItemId] = useState(item.item_id)
  if (seededItemId !== item.item_id) {
    setSeededItemId(item.item_id)
    setBody(resolved)
    setDirty(false)
  }

  const seg = countSegments(body || '')
  const compliance = validateSmsBody(body)
  const outsideWindow = !isWithinSendWindow(new Date(), timezone)
  const firstName = item.first_name || item.worker_name

  if (item.sms_opt_out || item.status === 'opted_out') {
    return (
      <Blocked icon={<ShieldAlert className="h-4 w-4" />}>
        {item.worker_name} has opted out of SMS. They can text START to
        resubscribe.
      </Blocked>
    )
  }

  if (!item.phone_e164) {
    return (
      <Blocked icon={<Ban className="h-4 w-4" />}>
        No mobile on file for {item.worker_name} — add one from the member
        card to message them.
      </Blocked>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-3 py-2">
        <p className="truncate text-sm font-medium">{item.worker_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {toDisplay(item.phone_e164)}
          {item.employer_name ? ` · ${item.employer_name}` : ''}
          {senderLabel ? ` · via ${senderLabel}` : ''}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
            Not messaged yet
          </Badge>
          {item.body_override && (
            <Badge variant="secondary" className="bg-indigo-50 text-indigo-700">
              Customised opener
            </Badge>
          )}
          {item.status === 'failed' && item.failure_reason && (
            <Badge variant="secondary" className="bg-red-100 text-red-700">
              Last attempt failed — {item.failure_reason}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          This is the first message {firstName} will get. Edit it if you want
          something more specific — their reply lands in this same thread.
        </p>
      </div>

      <div className="border-t p-3">
        {outsideWindow && !boardClosed && (
          <p className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            It is outside the 9am–8pm window ({timezone}). Chat sends are not
            blocked — use your judgement.
          </p>
        )}
        {compliance.warnings.map((w) => (
          <p
            key={w}
            className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800"
          >
            {w}
          </p>
        ))}
        <Textarea
          value={body}
          rows={4}
          className="resize-none"
          disabled={boardClosed}
          placeholder={`Opening message to ${firstName}…`}
          onChange={(e) => {
            setBody(e.target.value)
            setDirty(true)
          }}
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {seg.length ?? body.length} chars · {seg.segments} segment
            {seg.segments === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-1.5">
            {item.body_override && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                disabled={boardClosed}
                title="Go back to the board's shared opener"
                onClick={() => {
                  onSaveOverride(item.item_id, null)
                  setDirty(false)
                }}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Reset
              </Button>
            )}
            {dirty && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={boardClosed}
                onClick={() => {
                  onSaveOverride(item.item_id, body)
                  setDirty(false)
                }}
              >
                Save opener
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 text-[11px]"
              disabled={boardClosed || sending || !body.trim()}
              onClick={() => {
                // Persist an unsaved edit first — otherwise the server
                // would send the stale stored template.
                if (dirty) {
                  onSaveOverride(item.item_id, body)
                  setDirty(false)
                }
                onSend(item.item_id)
              }}
            >
              {sending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Send className="mr-1 h-3 w-3" />
              )}
              Send to {firstName}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Blocked({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p className="flex max-w-sm items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <span className="mt-px shrink-0">{icon}</span>
        {children}
      </p>
    </div>
  )
}
