'use client'

/**
 * Edit the board's shared opener mid-session — the sample-then-refine
 * loop: message a handful, read what comes back, fix the wording, then
 * send to the rest.
 *
 * Lifted verbatim from SmsP2pBoard when that board was retired for the
 * 3-pane workspace (Phase 10), so the capability and its carefully
 * worded guarantees survive the move:
 *
 *   - rows already messaged are untouched and cannot be re-sent to;
 *   - rows with a genuinely customised opener keep it;
 *   - rows whose override merely echoed the old default were stored as
 *     NULL and so pick up the new wording.
 */
import { useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ALL_TEMPLATE_VARIABLES } from '@/lib/comms/template-variables'
import { countSegments } from '@/lib/sms/segments'
import { validateSmsBody } from '@/lib/sms/compliance'
import { renderP2pBody } from '@/lib/sms/p2p'
import { SmsEmojiPicker } from '@/components/sms/SmsEmojiPicker'
import type { SmsP2pBoardItem } from '@/types/sms'

export function BoardMessageDialog({
  open,
  boardTemplate,
  mergeContext,
  sampleItem,
  remaining,
  alreadySent,
  customised,
  pending,
  onOpenChange,
  onSave,
}: {
  open: boolean
  boardTemplate: string
  mergeContext: Record<string, string | undefined>
  sampleItem: SmsP2pBoardItem | null
  remaining: number
  alreadySent: number
  customised: number
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSave: (body: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [body, setBody] = useState(boardTemplate)

  // Re-seed each time it opens so a cancelled edit does not linger, and
  // a template changed elsewhere is picked up. Adjusted during render
  // rather than in an effect (react-hooks/set-state-in-effect) — same
  // pattern as SmsOpenerComposer and WorkerChatCard.
  const [seededFor, setSeededFor] = useState<string | null>(
    open ? boardTemplate : null,
  )
  const seedKey = open ? boardTemplate : null
  if (seedKey !== seededFor) {
    setSeededFor(seedKey)
    if (open) setBody(boardTemplate)
  }

  const preview = renderP2pBody(body, {
    ...mergeContext,
    first_name: sampleItem?.first_name ?? 'Alex',
    last_name: sampleItem?.last_name ?? 'Taylor',
    occupation: sampleItem?.occupation ?? undefined,
    employer_name: sampleItem?.employer_name ?? mergeContext.employer_name,
  })
  const segments = countSegments(preview)
  const compliance = validateSmsBody(body)
  const changed = body.trim() !== boardTemplate.trim()

  const insertAtCursor = (insert: string) => {
    const el = textareaRef.current
    if (!el) {
      setBody((prev) => prev + insert)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? start
    setBody(body.slice(0, start) + insert + body.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + insert.length, start + insert.length)
    })
  }
  const insertToken = (token: string) => insertAtCursor(`{{${token}}}`)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit the board message</DialogTitle>
          <DialogDescription>
            Applies to everyone not yet messaged. Sent messages are not
            changed and nobody is re-sent to.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="p2p-board-body">Initiating message</Label>
            <Textarea
              id="p2p-board-body"
              ref={textareaRef}
              rows={6}
              disabled={pending}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-1">
              {ALL_TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  disabled={pending}
                  title={v.description}
                  className="rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/70 disabled:opacity-50"
                  onClick={() => insertToken(v.key)}
                >
                  {v.label}
                </button>
              ))}
              <SmsEmojiPicker
                disabled={pending}
                onSelect={insertAtCursor}
                className="h-6 px-2"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {segments.length} chars · {segments.segments}{' '}
            {segments.segments === 1 ? 'part' : 'parts'} ({segments.encoding})
            after merge fields
          </p>
          {segments.encoding === 'UCS-2' && (
            <p className="flex items-start gap-1 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Emoji and smart quotes switch this message to UCS-2 — 70
              characters per part instead of 160, so it costs{' '}
              {segments.segments}{' '}
              {segments.segments === 1 ? 'credit' : 'credits'} per recipient.
            </p>
          )}

          <div className="rounded-md border bg-muted/30 p-2 text-xs">
            <p>
              <span className="font-medium">{remaining}</span> still to
              message will use this wording.
            </p>
            {alreadySent > 0 && (
              <p className="text-muted-foreground">
                {alreadySent} already messaged — unchanged.
              </p>
            )}
            {customised > 0 && (
              <p className="text-muted-foreground">
                {customised} unsent{' '}
                {customised === 1 ? 'person has' : 'people have'} a custom
                opener and will keep it.
              </p>
            )}
          </div>

          {!compliance.hasOrgName && (
            <p className="flex items-start gap-1 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Organisation name optional for known contacts — include
              &quot;Offshore Alliance&quot; for first-contact or cold outreach.
            </p>
          )}

          {preview && (
            <div className="rounded-md border bg-muted/30 p-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Sends as{sampleItem ? ` — ${sampleItem.worker_name}` : ''}
              </p>
              <p className="whitespace-pre-wrap text-sm">{preview}</p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={pending || !changed}
            onClick={() => setBody(boardTemplate)}
          >
            Revert changes
          </Button>
          <Button
            disabled={pending || !changed || !body.trim()}
            onClick={() => onSave(body)}
          >
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
