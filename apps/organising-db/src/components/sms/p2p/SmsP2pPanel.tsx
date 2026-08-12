'use client'

/**
 * Chats view of the Outreach → SMS sub-tab: the P2P chat boards
 * (mode='p2p' sms_lists — kept out of the Blasts overview and given
 * their own section here, per the p2p list state model: 'draft' while
 * a board is active, 'sent' once closed).
 *
 * "New chat board" creates the p2p list via the shared sms-lists route
 * (mode: 'p2p') from the shared AudiencePicker (the full working list
 * — saved lists / whole campaign / manual add / CSV import) plus the
 * initial-message composer (merge fields, segment counter, compliance
 * — initials are bulk-adjacent so org identification is required) and
 * a sender select. The board itself opens in a full-width sheet.
 *
 * Deep links (from the pathway picker): ?new_chat=1 opens the creation
 * sheet; ?chat_source_list=<worker_list_id> opens it with that cohort
 * pre-attached.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, MessagesSquare, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useCreateSmsBlast,
  useSmsLists,
} from '@/lib/hooks/useSmsBroadcast'
import {
  SmsComposer,
  type SmsComposerValue,
} from '@/components/sms/SmsComposer'
import { validateSmsBody } from '@/lib/sms/compliance'
import {
  AudiencePicker,
  type AudienceValue,
} from '@/components/audience/AudiencePicker'
import { toApiAudience } from '@/lib/sms/audience-helpers'
import { SmsP2pBoard } from './SmsP2pBoard'

const EMPTY_COMPOSER: SmsComposerValue = {
  body: '',
  sender_number_id: null,
  timezone: 'Australia/Perth',
  blackout_override: false,
  blackout_override_reason: '',
  scheduled_for: null,
}

interface SmsP2pPanelProps {
  campaignId: string | number
}

export function SmsP2pPanel({ campaignId }: SmsP2pPanelProps) {
  const id = String(campaignId)
  const searchParams = useSearchParams()
  const { data: lists, isLoading } = useSmsLists(id)
  const [newOpen, setNewOpen] = useState(false)
  const [sourceListId, setSourceListId] = useState<number | null>(null)
  const [boardListId, setBoardListId] = useState<number | null>(null)

  // Pathway-picker deep links (chain B: new_chat=1 / chat_source_list).
  useEffect(() => {
    if (searchParams?.get('new_chat') === '1') setNewOpen(true)
    const raw = searchParams?.get('chat_source_list')
    const wl = raw ? parseInt(raw, 10) : NaN
    if (Number.isFinite(wl)) {
      setSourceListId(wl)
      setNewOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const boards = useMemo(
    () => (lists ?? []).filter((l) => (l.mode ?? 'blast') === 'p2p'),
    [lists],
  )
  const active = boards.filter((b) => b.list_status === 'draft')
  const closed = boards.filter((b) => b.list_status !== 'draft')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">P2P chat boards</h3>
          <p className="text-sm text-muted-foreground">
            Load a working list, then message people a handful at a time.
            Replies land in the Inbox as 1:1 threads.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <MessagesSquare className="mr-2 h-4 w-4" />
          New chat board
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : boards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-4 text-center">
            <MessagesSquare className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="mb-3 text-sm text-muted-foreground">
              No chat boards yet. Start one here, or pick the Chat pathway from
              Create SMS.
            </p>
            <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New chat board
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...active, ...closed].map((board) => (
            <Card key={board.list_id} className="transition-colors hover:bg-muted/30">
              <CardContent className="p-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => setBoardListId(board.list_id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {board.list_name}
                      </p>
                      <Badge
                        variant="secondary"
                        className={
                          board.list_status === 'draft'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }
                      >
                        {board.list_status === 'draft' ? 'active' : 'closed'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {Number(board.sent_count) + Number(board.delivered_count)}/
                      {Number(board.item_count)} messaged
                      {Number(board.pending_count) > 0 &&
                        ` · ${Number(board.pending_count)} to go`}
                      {Number(board.opted_out_count) + Number(board.blocked_count) >
                        0 &&
                        ` · ${
                          Number(board.opted_out_count) + Number(board.blocked_count)
                        } opted out`}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">Open board</span>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewChatBoardSheet
        key={sourceListId ?? 'no-source'}
        campaignId={id}
        open={newOpen}
        sourceListId={sourceListId}
        onOpenChange={(open) => {
          setNewOpen(open)
          if (!open) setSourceListId(null)
        }}
        onCreated={(listId) => {
          setNewOpen(false)
          setSourceListId(null)
          setBoardListId(listId)
        }}
      />

      <Sheet
        open={boardListId != null}
        onOpenChange={(open) => {
          if (!open) setBoardListId(null)
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>Chat board</SheetTitle>
            <SheetDescription>
              Select people and send them the personalised opener — start
              small, add more as conversations progress.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 pb-8">
            {boardListId != null && (
              <SmsP2pBoard campaignId={id} listId={boardListId} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function NewChatBoardSheet({
  campaignId,
  open,
  sourceListId,
  onOpenChange,
  onCreated,
}: {
  campaignId: string
  open: boolean
  /** Pre-attached cohort from the Build List → Chat pathway. */
  sourceListId: number | null
  onOpenChange: (open: boolean) => void
  onCreated: (listId: number) => void
}) {
  const [name, setName] = useState('')
  // Build-list entry: seed the audience with the attached cohort (the
  // parent keys this sheet on sourceListId, so a change remounts).
  const [audienceValue, setAudienceValue] = useState<AudienceValue>(() =>
    sourceListId != null
      ? { mode: 'worker_list', worker_list_id: sourceListId }
      : { mode: 'campaign' },
  )
  const [composer, setComposer] = useState<SmsComposerValue>(EMPTY_COMPOSER)
  const [submitting, setSubmitting] = useState(false)
  const create = useCreateSmsBlast(campaignId)

  const complianceErrors = composer.body.trim()
    ? validateSmsBody(composer.body).errors
    : ['Write the initial message.']
  const blockers = [
    ...(!name.trim() ? ['Give the chat board a name.'] : []),
    ...complianceErrors,
    ...(composer.sender_number_id == null ? ['Choose a sender number.'] : []),
  ]

  const submit = async () => {
    if (blockers.length > 0) return
    try {
      setSubmitting(true)
      const audience = await toApiAudience(campaignId, audienceValue)
      create.mutate(
        {
          name: name.trim(),
          body: composer.body,
          sender_number_id: composer.sender_number_id ?? undefined,
          mode: 'p2p',
          audience,
        },
        {
          onSuccess: (res) => {
            const notes: string[] = []
            if (res.opted_out > 0) notes.push(`${res.opted_out} opted out`)
            if (res.skipped_no_phone > 0) {
              notes.push(`${res.skipped_no_phone} without a mobile`)
            }
            toast.success(
              `Chat board created — ${res.total_items} sendable${
                notes.length ? ` (${notes.join(', ')} excluded)` : ''
              }`,
            )
            setName('')
            setAudienceValue({ mode: 'campaign' })
            setComposer(EMPTY_COMPOSER)
            onCreated(res.sms_list_id)
          },
          onError: (err: Error) => toast.error(err.message),
          onSettled: () => setSubmitting(false),
        },
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to prepare audience',
      )
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New chat board</SheetTitle>
          <SheetDescription>
            Load the full working list now — you will pick who to message,
            and when, from the board. Nothing sends on create.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-8">
          <div className="space-y-1.5">
            <Label htmlFor="p2p-board-name">Name</Label>
            <Input
              id="p2p-board-name"
              placeholder="e.g. Delegates check-in — August"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <AudiencePicker
            channel="sms"
            campaignId={campaignId}
            value={audienceValue}
            onChange={setAudienceValue}
            disabled={create.isPending || submitting}
          />

          <div className="space-y-1.5">
            <Label>Initial message</Label>
            <p className="text-xs text-muted-foreground">
              Sent per person when you fire from the board. As first-contact
              outreach it must identify Offshore Alliance.
            </p>
            <SmsComposer
              campaignId={campaignId}
              value={composer}
              onChange={setComposer}
              variant="p2p"
            />
          </div>

          {blockers.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}

          <Button
            className="w-full"
            disabled={create.isPending || submitting || blockers.length > 0}
            onClick={submit}
          >
            {create.isPending || submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create chat board
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
