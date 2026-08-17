'use client'

/**
 * The 3-pane chat workspace (Phase 10, decision 8c — supersedes brief
 * §E0's member-board-band layout).
 *
 *   rail (roster)  │  conversation  │  member card + assessments + notes
 *
 * Selecting a name in the rail populates BOTH the middle and right
 * panes. The middle shows the thread once one exists, and the opener
 * composer before that — the middle pane is always "the conversation
 * with this person".
 *
 * Two behaviours worth knowing about:
 *
 * 1. Drafts are keyed per conversation (and per unsent item). The Inbox
 *    holds a single draft string and clears it on switch, which in a
 *    thirty-chat session silently destroys half-typed messages.
 * 2. Selecting a thread with unread inbound fires `mark_read`, which
 *    zeroes unread_count and STOPS the rail's pulse but leaves `state`
 *    alone — so a seen-but-unanswered row stays static amber.
 *
 * The board polls at 5s here rather than the board sheet's 10s: a pulse
 * that starts ten seconds after the reply undercuts the whole signal.
 * The §E5 realtime work would replace the poll with no UI change.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Info, Loader2, Pencil, RefreshCw, UserPlus, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useSmsP2pAddPeople,
  useSmsP2pBoard,
  useSmsP2pClose,
  useSmsP2pNominateAssessmentCampaign,
  useSmsP2pSend,
  useSmsP2pSetAssessments,
  useSmsP2pSetBoardBody,
  useSmsP2pSetItemBody,
} from '@/lib/hooks/useSmsP2p'
import {
  useSmsConversationAction,
  useSmsConversationDetail,
} from '@/lib/hooks/useSmsInbox'
import { SmsThreadView } from '@/components/sms/inbox/SmsThreadView'
import type { SmsP2pBoardItem } from '@/types/sms'
import { SmsChatRail } from './SmsChatRail'
import { SmsOpenerComposer } from './SmsOpenerComposer'
import { SmsMemberPane } from './SmsMemberPane'
import { SmsAddPeopleDialog } from './SmsAddPeopleDialog'
import { BoardMessageDialog } from './SmsBoardMessageDialog'

/** Faster than the board sheet's 10s — see the header comment. */
const WORKSPACE_POLL_MS = 5_000

export interface SmsChatWorkspaceProps {
  campaignId: string
  listId: number
  canWrite?: boolean
  /** Standalone (episode-backed) boards use the org-wide audience picker. */
  standaloneMode?: boolean
}

export function SmsChatWorkspace({
  campaignId,
  listId,
  canWrite = true,
  standaloneMode = false,
}: SmsChatWorkspaceProps) {
  const queryClient = useQueryClient()
  const { data: board, isLoading, isFetching, refetch } = useSmsP2pBoard(
    campaignId,
    listId,
    { pollMs: WORKSPACE_POLL_MS },
  )
  const send = useSmsP2pSend(campaignId, listId)
  const setItemBody = useSmsP2pSetItemBody(campaignId, listId)
  const setAssessments = useSmsP2pSetAssessments(campaignId, listId)
  const nominate = useSmsP2pNominateAssessmentCampaign(campaignId, listId)
  const closeBoard = useSmsP2pClose(campaignId, listId)
  const addPeople = useSmsP2pAddPeople(campaignId, listId)
  const setBoardBody = useSmsP2pSetBoardBody(campaignId, listId)

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [memberPaneOpen, setMemberPaneOpen] = useState(false)
  const [mobileView, setMobileView] = useState<'rail' | 'chat'>('rail')
  const [addOpen, setAddOpen] = useState(false)
  const [boardMessageOpen, setBoardMessageOpen] = useState(false)

  // Per-conversation and per-item drafts. A Map, not a string: switching
  // members must never discard typed text.
  const [threadDrafts, setThreadDrafts] = useState<Map<number, string>>(
    new Map(),
  )

  const items = useMemo(() => board?.items ?? [], [board])
  const selectedItem = useMemo(
    () => items.find((i) => i.item_id === selectedItemId) ?? null,
    [items, selectedItemId],
  )
  const conversationId = selectedItem?.conversation_id ?? null
  const { data: detail } = useSmsConversationDetail(conversationId)
  const conversationAction = useSmsConversationAction(conversationId)

  // Mark read on open — stops the pulse, leaves `state` alone. Guarded
  // by a ref so a poll that re-renders with stale unread does not fire
  // it again for the same conversation.
  const markedRef = useRef<number | null>(null)
  useEffect(() => {
    if (conversationId == null) return
    if (markedRef.current === conversationId) return
    if ((selectedItem?.unread_count ?? 0) <= 0) return
    markedRef.current = conversationId
    conversationAction.mutate(
      { action: 'mark_read' },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            queryKey: ['sms-p2p-board', String(campaignId), listId],
          }),
        // A failed mark-read is cosmetic: the row keeps pulsing and the
        // next selection retries. Never surface it as an error toast.
        onError: () => {
          markedRef.current = null
        },
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, selectedItem?.unread_count])

  const selectItem = useCallback((item: SmsP2pBoardItem) => {
    setSelectedItemId(item.item_id)
    setMobileView('chat')
  }, [])

  const setDraft = useCallback(
    (value: string) => {
      if (conversationId == null) return
      setThreadDrafts((prev) => new Map(prev).set(conversationId, value))
    },
    [conversationId],
  )

  const runSend = (itemIds: number[]) => {
    if (itemIds.length === 0) return
    send.mutate(itemIds, {
      onSuccess: (res) => {
        const notes: string[] = []
        if (res.failed > 0) notes.push(`${res.failed} failed`)
        if (res.blocked > 0) notes.push(`${res.blocked} blocked`)
        if (res.opted_out > 0) notes.push(`${res.opted_out} opted out`)
        if (res.skipped > 0) notes.push(`${res.skipped} skipped`)
        toast.success(
          `Sent ${res.sent} opener${res.sent === 1 ? '' : 's'}${
            notes.length ? ` (${notes.join(', ')})` : ''
          }`,
        )
      },
      onError: (err: Error) => toast.error(err.message),
    })
  }

  const pinActivity = (activityId: number) => {
    const current = board?.list.selected_assessment_ids ?? []
    if (current.includes(activityId)) return
    setAssessments.mutate([...current, activityId], {
      onSuccess: () => toast.success('Assessment pinned to this chat'),
      onError: (err: Error) => toast.error(err.message),
    })
  }

  if (isLoading || !board) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const boardClosed = board.list.status !== 'draft'
  const memberPane = detail ? (
    <SmsMemberPane
      detail={detail}
      campaignIsEpisode={board.list.campaign_is_sms_episode}
      pinnedActivityIds={board.list.selected_assessment_ids}
      assessmentCampaignId={board.list.assessment_campaign_id}
      canPin={canWrite && !boardClosed}
      canWrite={canWrite}
      onPinActivity={pinActivity}
      onNominateCampaign={(id) =>
        nominate.mutate(id, {
          onSuccess: () =>
            toast.success('Campaign set — pin the assessments to use'),
          onError: (err: Error) => toast.error(err.message),
        })
      }
    />
  ) : (
    <div className="p-3 text-xs text-muted-foreground">
      {selectedItem
        ? 'Member details appear once the opener has been sent.'
        : 'Select someone from the list.'}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Workspace header */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{board.list.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            via{' '}
            {board.list.sender_label ||
              board.list.sender_phone_e164 ||
              'no sender'}{' '}
            · updates every {WORKSPACE_POLL_MS / 1000}s
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw
            className={`mr-1 h-3 w-3 ${isFetching ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
        {/* Member pane toggle — the pane is inline at xl+, an overlay below. */}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs xl:hidden"
          onClick={() => setMemberPaneOpen(true)}
        >
          <Info className="mr-1 h-3 w-3" />
          Member
        </Button>
        {canWrite && !boardClosed && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            title="Rewrite the shared opener for everyone not yet messaged"
            onClick={() => setBoardMessageOpen(true)}
          >
            <Pencil className="mr-1 h-3 w-3" />
            Edit message
          </Button>
        )}
        {canWrite && !boardClosed && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={addPeople.isPending}
            onClick={() => setAddOpen(true)}
          >
            <UserPlus className="mr-1 h-3 w-3" />
            Add people
          </Button>
        )}
        {canWrite && !boardClosed && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground hover:text-destructive"
            disabled={closeBoard.isPending}
            title="Close the board — unsent rows are skipped; threads stay open in the Inbox"
            onClick={() => {
              if (
                window.confirm(
                  'Close this chat board? People not yet messaged will be skipped. Existing threads stay open in the Inbox.',
                )
              ) {
                closeBoard.mutate(undefined, {
                  onSuccess: () => toast.success('Chat board closed'),
                  onError: (err: Error) => toast.error(err.message),
                })
              }
            }}
          >
            <XCircle className="mr-1 h-3 w-3" />
            Close board
          </Button>
        )}
      </div>

      {boardClosed && (
        <p className="border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          This board is closed — threads remain workable from the Inbox.
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Rail — full width below lg, fixed rail above. */}
        <div
          className={`w-full shrink-0 border-r lg:flex lg:w-56 2xl:w-60 ${
            mobileView === 'rail' ? 'flex' : 'hidden'
          }`}
        >
          <div className="min-w-0 flex-1">
            <SmsChatRail
              boardName={board.list.name}
              items={items}
              selectedItemId={selectedItemId}
              onSelectItem={selectItem}
              onSend={canWrite && !boardClosed ? runSend : undefined}
              sending={send.isPending}
              boardClosed={boardClosed}
            />
          </div>
        </div>

        {/* Conversation */}
        <div
          className={`min-w-0 flex-1 lg:flex ${
            mobileView === 'chat' ? 'flex' : 'hidden'
          }`}
        >
          {!selectedItem ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select someone from the list.
            </div>
          ) : selectedItem.conversation_id == null ? (
            <div className="min-w-0 flex-1">
              <SmsOpenerComposer
                item={selectedItem}
                boardTemplate={board.draft?.body ?? ''}
                mergeContext={board.merge_context}
                timezone={board.list.timezone}
                senderLabel={
                  board.list.sender_label || board.list.sender_phone_e164
                }
                boardClosed={boardClosed || !canWrite}
                sending={send.isPending}
                onSend={(itemId) => runSend([itemId])}
                onSaveOverride={(itemId, body) =>
                  setItemBody.mutate(
                    { itemId, body },
                    { onError: (err: Error) => toast.error(err.message) },
                  )
                }
              />
            </div>
          ) : detail ? (
            <SmsThreadView
              detail={detail}
              draft={threadDrafts.get(selectedItem.conversation_id) ?? ''}
              onDraftChange={setDraft}
              onBack={() => setMobileView('rail')}
              onOpenSidebar={() => setMemberPaneOpen(true)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Member pane — inline at xl+, overlay below. */}
        <div className="hidden w-80 shrink-0 border-l xl:flex xl:flex-col 2xl:w-90">
          {memberPane}
        </div>
      </div>

      <Sheet open={memberPaneOpen} onOpenChange={setMemberPaneOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="border-b p-3">
            <SheetTitle className="text-sm">Member</SheetTitle>
          </SheetHeader>
          {memberPane}
        </SheetContent>
      </Sheet>

      <BoardMessageDialog
        open={boardMessageOpen}
        boardTemplate={board.draft?.body ?? ''}
        mergeContext={board.merge_context}
        sampleItem={items.find((i) => i.status === 'pending') ?? items[0] ?? null}
        remaining={
          items.filter((i) => i.status === 'pending' && !i.body_override).length
        }
        alreadySent={
          items.filter((i) => ['sent', 'delivered'].includes(i.status)).length
        }
        customised={
          items.filter((i) => i.status === 'pending' && !!i.body_override).length
        }
        pending={setBoardBody.isPending}
        onOpenChange={setBoardMessageOpen}
        onSave={(body) =>
          setBoardBody.mutate(body, {
            onSuccess: () => {
              toast.success('Board message updated')
              setBoardMessageOpen(false)
            },
            onError: (err: Error) => toast.error(err.message),
          })
        }
      />

      <SmsAddPeopleDialog
        campaignId={campaignId}
        standaloneMode={standaloneMode}
        open={addOpen}
        onOpenChange={setAddOpen}
        pending={addPeople.isPending}
        onSubmit={(input) =>
          addPeople.mutate(input, {
            onSuccess: (res) => {
              toast.success(
                `Added ${res.added} ${res.added === 1 ? 'person' : 'people'}${
                  res.already_on_board > 0
                    ? ` (${res.already_on_board} already on the board)`
                    : ''
                }`,
              )
              setAddOpen(false)
            },
            onError: (err: Error) => toast.error(err.message),
          })
        }
      />
    </div>
  )
}
