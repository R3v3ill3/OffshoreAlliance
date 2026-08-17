'use client'

/**
 * The right pane: member card, pinned assessments and conversation
 * notes, all expanded by default (Phase 10, decision 1 and 5).
 *
 * Shared by the chat workspace (always visible) and the Inbox sidebar
 * (which keeps its own assignment / escalation / canned-reply controls
 * above it). Extracting it here is what keeps the two surfaces from
 * drifting — the plan deliberately does NOT try to share the left rail,
 * because the Inbox's is a filtered queue and the workspace's is a
 * board roster.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Ban,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Undo2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { WorkerChatCard } from '@/components/workers/WorkerChatCard'
import { SmsPinnedAssessment } from '@/components/sms/inbox/SmsPinnedAssessment'
import { conversationTitle } from '@/components/sms/inbox/sms-inbox-shared'
import {
  confirmSmsDoNotContact,
  useStaffSmsOptOut,
} from '@/lib/hooks/useSmsOptOut'
import {
  useAddSmsNote,
  type SmsConversationDetail,
} from '@/lib/hooks/useSmsInbox'

export interface SmsMemberPaneProps {
  detail: SmsConversationDetail
  campaignIsEpisode?: boolean
  pinnedActivityIds?: number[]
  assessmentCampaignId?: number | null
  onNominateCampaign?: (campaignId: number) => void
  onPinActivity?: (activityId: number) => void
  canPin?: boolean
  canWrite?: boolean
  /** This chat has been marked complete (conversation closed). */
  isCompleted?: boolean
  /** Toggle complete/reopen. Owned by the workspace so closing also
   *  refreshes the rail, not just the conversation. */
  onToggleCompleted?: () => void
  completingPending?: boolean
}

export function SmsMemberPane({
  detail,
  campaignIsEpisode = false,
  pinnedActivityIds = [],
  assessmentCampaignId = null,
  onNominateCampaign,
  onPinActivity,
  canPin = false,
  canWrite = true,
  isCompleted = false,
  onToggleCompleted,
  completingPending = false,
}: SmsMemberPaneProps) {
  const { conversation } = detail
  const worker = conversation.worker
  const queryClient = useQueryClient()
  const staffOptOut = useStaffSmsOptOut()

  const setOptOut = (optOut: boolean) => {
    if (!worker) return
    if (optOut && !confirmSmsDoNotContact(conversationTitle(conversation))) return
    staffOptOut.mutate(
      { workerId: worker.worker_id, optOut },
      {
        onSuccess: () => {
          toast.success(
            optOut ? 'Member marked Do not contact (SMS)' : 'SMS opt-out lifted',
          )
          queryClient.invalidateQueries({
            queryKey: ['sms-conversation', conversation.conversation_id],
          })
          queryClient.invalidateQueries({ queryKey: ['sms-p2p-board'] })
        },
        onError: (err: Error) =>
          toast.error(err.message || 'Failed to update opt-out'),
      },
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* Compliance first — an organiser must be able to stop contact
          without hunting for the control. */}
      {worker && (
        <div className="space-y-1.5">
          {worker.sms_opt_out ? (
            <>
              <Badge variant="secondary" className="bg-red-100 text-red-700">
                <ShieldAlert className="mr-1 h-3 w-3" />
                Opted out of SMS
              </Badge>
              {canWrite && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-full text-xs"
                  disabled={staffOptOut.isPending}
                  onClick={() => setOptOut(false)}
                >
                  {staffOptOut.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Undo2 className="mr-1 h-3 w-3" />
                  )}
                  Lift opt-out (member asked)
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                SMS OK
              </Badge>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-red-700 hover:text-red-800"
                  disabled={staffOptOut.isPending}
                  title="Opts this member out of ALL SMS — blasts, surveys, chats and 1:1 replies"
                  onClick={() => setOptOut(true)}
                >
                  <Ban className="mr-1 h-3 w-3" />
                  Do not contact
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Chat status — bookkeeping, not removal. A completed chat drops
          down the rail and loses its state tint, but the person stays
          on the board and the thread stays open in the Inbox. */}
      {onToggleCompleted && canWrite && (
        <div className="border-t pt-2">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Chat status
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={completingPending}
            onClick={onToggleCompleted}
          >
            {completingPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : isCompleted ? (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isCompleted ? 'Reopen this chat' : 'Mark chat complete'}
          </Button>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isCompleted
              ? 'Completed — sits at the bottom of the roster. Replies still arrive.'
              : 'Finished with this one? It stays on the board and in the Inbox.'}
          </p>
        </div>
      )}

      <SmsPinnedAssessment
        conversation={conversation}
        campaignIsEpisode={campaignIsEpisode}
        pinnedActivityIds={pinnedActivityIds}
        assessmentCampaignId={assessmentCampaignId}
        onNominateCampaign={onNominateCampaign}
        onPinActivity={onPinActivity}
        canPin={canPin}
      />

      <ConversationNotes detail={detail} canWrite={canWrite} />

      {worker ? (
        <div className="border-t pt-2">
          <WorkerChatCard
            key={worker.worker_id}
            workerId={worker.worker_id}
            campaignId={conversation.campaign_id}
            campaignIsEpisode={campaignIsEpisode}
            canWrite={canWrite}
            density="compact"
            conversationPhoneE164={conversation.phone_e164}
            conversationId={conversation.conversation_id}
          />
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
          Not matched to a member — triage this conversation to see and edit
          their details.
        </div>
      )}
    </div>
  )
}

/**
 * Thread notes (staff-only, rendered inline in the thread too). Distinct
 * from the member notes on the card: these are about the conversation,
 * those are about the person.
 */
function ConversationNotes({
  detail,
  canWrite,
}: {
  detail: SmsConversationDetail
  canWrite: boolean
}) {
  const { conversation, notes, user_names } = detail
  const addNote = useAddSmsNote(conversation.conversation_id)
  const [body, setBody] = useState('')

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px]">Thread notes</Label>
      {notes.length === 0 && (
        <p className="text-[11px] text-muted-foreground">None yet.</p>
      )}
      {notes.slice(-5).map((n) => (
        <p
          key={n.note_id}
          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] whitespace-pre-wrap text-amber-900"
        >
          <span className="font-medium">
            {user_names[n.author_user_id] ?? 'Staff'}:{' '}
          </span>
          {n.body}
        </p>
      ))}
      {canWrite && (
        <>
          <Textarea
            rows={2}
            className="resize-none text-xs"
            placeholder="Visible to staff only — shows inline in the thread."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs"
            disabled={!body.trim() || addNote.isPending}
            onClick={() =>
              addNote.mutate(body.trim(), {
                onSuccess: () => setBody(''),
                onError: (err: Error) => toast.error(err.message),
              })
            }
          >
            {addNote.isPending && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            Add note
          </Button>
        </>
      )}
    </div>
  )
}
