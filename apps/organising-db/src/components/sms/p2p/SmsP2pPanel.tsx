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
 * — org name is recommended for first-contact, optional otherwise) and
 * a sender select. The board itself opens in a full-width sheet.
 *
 * Deep links (from the pathway picker): ?new_chat=1 opens the creation
 * sheet; ?chat_source_list=<worker_list_id> opens it with that cohort
 * pre-attached.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, MessagesSquare, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
  useSmsSenders,
} from '@/lib/hooks/useSmsBroadcast'
import {
  SmsComposer,
  smsComposerBlockers,
  type SmsComposerValue,
} from '@/components/sms/SmsComposer'
import { validateSmsBody } from '@/lib/sms/compliance'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { fetchApi } from '@/lib/api/fetch-api'
import { CreateAssessmentDialog } from '@/components/campaigns/assessments/create-assessment-dialog'
import { SmsOrgNameWarningDialog } from '@/components/sms/SmsOrgNameWarningDialog'
import {
  AudiencePicker,
  type AudienceValue,
} from '@/components/audience/AudiencePicker'
import {
  toApiAudience,
  EMPTY_COMPOSED_AUDIENCE,
  STANDALONE_AUDIENCE_PICKER,
} from '@/lib/sms/audience-helpers'
import {
  useCreateSmsEpisode,
  useDeleteSmsEpisode,
  useRenameSmsEpisode,
  useSmsEpisodes,
} from '@/lib/hooks/useSmsEpisodes'

const EMPTY_COMPOSER: SmsComposerValue = {
  body: '',
  sender_number_id: null,
  timezone: 'Australia/Perth',
  blackout_override: false,
  blackout_override_reason: '',
  scheduled_for: null,
}

interface SmsP2pPanelProps {
  campaignId?: string | number | null
  standaloneMode?: boolean
}

export function SmsP2pPanel({
  campaignId,
  standaloneMode = false,
}: SmsP2pPanelProps) {
  const id =
    campaignId != null && String(campaignId) !== '' ? String(campaignId) : ''
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: lists, isLoading: listsLoading } = useSmsLists(
    standaloneMode ? null : id,
  )
  const { data: episodes, isLoading: episodesLoading } = useSmsEpisodes(
    standaloneMode,
  )
  const createEpisode = useCreateSmsEpisode()
  const deleteEpisode = useDeleteSmsEpisode()
  const renameEpisode = useRenameSmsEpisode()
  const [newOpen, setNewOpen] = useState(false)
  const [sheetCampaignId, setSheetCampaignId] = useState<string | null>(null)
  const [sheetSaved, setSheetSaved] = useState(false)
  const [sourceListId, setSourceListId] = useState<number | null>(null)
  /**
   * Opening a board navigates to the full-height 3-pane workspace
   * (Phase 10) rather than mounting it in a sheet — three panes do not
   * fit in sm:max-w-4xl, and a workspace wants a URL.
   */
  const openBoard = (boardCampaignId: string, listId: number) =>
    router.push(`/campaigns/${boardCampaignId}/sms/chat/${listId}`)

  // Pathway-picker deep links (chain B: new_chat=1 / chat_source_list).
  useEffect(() => {
    if (searchParams?.get('new_chat') === '1' && !standaloneMode) {
      setSheetCampaignId(id)
      setNewOpen(true)
    }
    const raw = searchParams?.get('chat_source_list')
    const wl = raw ? parseInt(raw, 10) : NaN
    if (Number.isFinite(wl) && !standaloneMode) {
      setSourceListId(wl)
      setSheetCampaignId(id)
      setNewOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const boards = useMemo(() => {
    if (standaloneMode) {
      return (episodes ?? []).flatMap((e) =>
        (e.lists ?? []).filter((l) => (l.mode ?? 'blast') === 'p2p'),
      )
    }
    return (lists ?? []).filter((l) => (l.mode ?? 'blast') === 'p2p')
  }, [standaloneMode, episodes, lists])
  const isLoading = standaloneMode ? episodesLoading : listsLoading
  const active = boards.filter((b) => b.list_status === 'draft')
  const closed = boards.filter((b) => b.list_status !== 'draft')

  const startNewChat = async () => {
    if (!standaloneMode) {
      setSheetCampaignId(id)
      setSheetSaved(false)
      setNewOpen(true)
      return
    }
    try {
      const ep = await createEpisode.mutateAsync({ kind: 'chat' })
      setSheetCampaignId(String(ep.campaign_id))
      setSheetSaved(false)
      setNewOpen(true)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not start standalone chat',
      )
    }
  }

  const closeNewChat = (open: boolean) => {
    setNewOpen(open)
    if (open) return
    const cid = sheetCampaignId
    if (standaloneMode && cid && !sheetSaved) {
      deleteEpisode.mutate(cid)
    }
    setSheetCampaignId(null)
    setSheetSaved(false)
    setSourceListId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">P2P chat boards</h3>
          <p className="text-sm text-muted-foreground">
            {standaloneMode
              ? 'Each standalone chat is its own hidden campaign. Replies land in Inbox, scoped to that board.'
              : 'Load a working list, then message people a handful at a time. Replies land in the Inbox as 1:1 threads.'}
          </p>
        </div>
        <Button onClick={() => void startNewChat()}>
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
              {standaloneMode
                ? 'No standalone chat boards yet. Start one here — it will not appear on the campaigns list.'
                : 'No chat boards yet. Start one here, or pick the Chat pathway from Create SMS.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void startNewChat()}>
              <Plus className="mr-1 h-4 w-4" />
              New chat board
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...active, ...closed].map((row) => (
            <Card key={row.list_id} className="transition-colors hover:bg-muted/30">
              <CardContent className="p-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() =>
                    openBoard(String(row.campaign_id), row.list_id)
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {row.list_name}
                      </p>
                      <Badge
                        variant="secondary"
                        className={
                          row.list_status === 'draft'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }
                      >
                        {row.list_status === 'draft' ? 'active' : 'closed'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {Number(row.sent_count) + Number(row.delivered_count)}/
                      {Number(row.item_count)} messaged
                      {Number(row.pending_count) > 0 &&
                        ` · ${Number(row.pending_count)} to go`}
                      {Number(row.opted_out_count) + Number(row.blocked_count) >
                        0 &&
                        ` · ${
                          Number(row.opted_out_count) + Number(row.blocked_count)
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

      {sheetCampaignId && (
      <NewChatBoardSheet
        key={sourceListId ?? 'no-source'}
        campaignId={sheetCampaignId}
        standaloneMode={standaloneMode}
        open={newOpen}
        sourceListId={sourceListId}
        onOpenChange={closeNewChat}
        onCreated={(listId, name) => {
          setSheetSaved(true)
          setNewOpen(false)
          if (standaloneMode && name.trim()) {
            renameEpisode.mutate({
              campaignId: sheetCampaignId,
              name: name.trim(),
            })
          }
          openBoard(sheetCampaignId, listId)
          setSheetCampaignId(null)
          setSourceListId(null)
        }}
      />
      )}

    </div>
  )
}

/** Seed for a new board — the hub's Duplicate hands in the source's opener. */
export interface NewChatBoardInitial {
  name?: string
  composer?: Partial<SmsComposerValue>
}

export function NewChatBoardSheet({
  campaignId,
  standaloneMode = false,
  open,
  sourceListId,
  onOpenChange,
  onCreated,
  initial,
}: {
  campaignId: string
  standaloneMode?: boolean
  open: boolean
  /** Pre-attached cohort from the Build List → Chat pathway. */
  sourceListId: number | null
  onOpenChange: (open: boolean) => void
  onCreated: (listId: number, name: string) => void
  /** Prefill (duplicate). People are never copied — load them fresh. */
  initial?: NewChatBoardInitial
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [deferAudience, setDeferAudience] = useState(false)
  // Build-list entry: seed the audience with the attached cohort (the
  // parent keys this sheet on sourceListId, so a change remounts).
  const [audienceValue, setAudienceValue] = useState<AudienceValue>(() =>
    sourceListId != null
      ? { mode: 'worker_list', worker_list_id: sourceListId }
      : standaloneMode
        ? EMPTY_COMPOSED_AUDIENCE
        : { mode: 'campaign' },
  )
  const [composer, setComposer] = useState<SmsComposerValue>({
    ...EMPTY_COMPOSER,
    ...(initial?.composer ?? {}),
  })
  const [submitting, setSubmitting] = useState(false)
  const [orgWarnOpen, setOrgWarnOpen] = useState(false)
  const [pinnedAssessments, setPinnedAssessments] = useState<number[]>([])
  const [createAssessmentOpen, setCreateAssessmentOpen] = useState(false)
  const create = useCreateSmsBlast(campaignId)
  const { data: senders } = useSmsSenders()
  const queryClient = useQueryClient()

  // Assessments the organiser can pin up front (Phase 10 WI-11), the
  // SMS analogue of the phone pathway's assessment-setup step. Skipped
  // for standalone boards: their campaign is a hidden episode with no
  // assessments — those nominate a real campaign from the workspace.
  const { data: campaignAssessments = [] } = useQuery({
    queryKey: ['sms-chat-setup-assessments', campaignId],
    queryFn: async () => {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase
        .from('campaign_activities')
        .select('activity_id, title')
        .eq('campaign_id', Number(campaignId))
        .eq('activity_kind', 'assessment')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as { activity_id: number; title: string }[]
    },
    enabled: open && !standaloneMode,
    staleTime: 30_000,
  })

  const blockers = [
    ...(!name.trim() ? ['Give the chat board a name.'] : []),
    ...smsComposerBlockers(composer, senders, { requireInbound: true }).filter(
      (b) => b !== 'Message body is empty.',
    ),
    ...(!composer.body.trim() ? ['Write the initial message.'] : []),
  ]

  const submit = async () => {
    if (blockers.length > 0) return
    if (!validateSmsBody(composer.body).hasOrgName) {
      setOrgWarnOpen(true)
      return
    }
    await createBoard()
  }

  const createBoard = async () => {
    try {
      setSubmitting(true)
      const skipAudience =
        (deferAudience && sourceListId == null) ||
        (standaloneMode &&
          audienceValue.mode === 'composed' &&
          audienceValue.worker_ids.length === 0)
      const audience = skipAudience
        ? undefined
        : await toApiAudience(campaignId, audienceValue)
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
              res.total_items > 0
                ? `Chat board created — ${res.total_items} sendable${
                    notes.length ? ` (${notes.join(', ')} excluded)` : ''
                  }`
                : 'Chat board created — add people from the board',
            )
            setName('')
            setDeferAudience(false)
            setAudienceValue(
              standaloneMode ? EMPTY_COMPOSED_AUDIENCE : { mode: 'campaign' },
            )
            setComposer(EMPTY_COMPOSER)
            // Pin up front so the workspace opens ready to assess. A
            // failure here must not lose the board — the organiser can
            // pin from the member pane instead.
            if (pinnedAssessments.length > 0) {
              void fetchApi(
                `/api/campaigns/${campaignId}/sms-lists/${res.sms_list_id}/p2p`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'set_assessments',
                    activity_ids: pinnedAssessments,
                  }),
                },
              ).catch(() =>
                toast.warning(
                  'Board created, but the assessment could not be pinned — pin it from the member panel.',
                ),
              )
            }
            setPinnedAssessments([])
            onCreated(res.sms_list_id, name.trim())
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
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New chat board</SheetTitle>
          <SheetDescription>
            Write the opener now, load a working list now, or both — you can
            add people from the board later. Nothing sends on create.
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

          {sourceListId == null && (
            <div className="flex items-start gap-2 rounded-md border p-3">
              <Checkbox
                id="p2p-defer-audience"
                checked={deferAudience}
                onCheckedChange={(v) => setDeferAudience(v === true)}
                disabled={create.isPending || submitting}
              />
              <Label
                htmlFor="p2p-defer-audience"
                className="font-normal leading-snug"
              >
                Add people later from the board
              </Label>
            </div>
          )}

          {!deferAudience && (
            <AudiencePicker
              channel="sms"
              campaignId={campaignId}
              value={audienceValue}
              onChange={setAudienceValue}
              disabled={create.isPending || submitting}
              {...(standaloneMode ? STANDALONE_AUDIENCE_PICKER : {})}
            />
          )}

          <div className="space-y-1.5">
            <Label>Initial message</Label>
            <p className="text-xs text-muted-foreground">
              Sent per person when you fire from the board. Naming Offshore
              Alliance is recommended for first-contact; skip it when you
              already know the member.
            </p>
            <SmsComposer
              campaignId={campaignId}
              value={composer}
              onChange={setComposer}
              variant="p2p"
            />
          </div>

          {!standaloneMode && (
            <div className="space-y-1.5">
              <Label>Assessment for this chat (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Pinned assessments show as one-tap chips beside every
                conversation, so you can rate as you go. You can also pin one
                later.
              </p>
              {campaignAssessments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  This campaign has no assessments yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {campaignAssessments.map((a) => (
                    <label
                      key={a.activity_id}
                      className="flex items-start gap-2 rounded-md border p-2 text-sm"
                    >
                      <Checkbox
                        checked={pinnedAssessments.includes(a.activity_id)}
                        disabled={create.isPending || submitting}
                        onCheckedChange={(v) =>
                          setPinnedAssessments((prev) =>
                            v === true
                              ? [...prev, a.activity_id]
                              : prev.filter((id) => id !== a.activity_id),
                          )
                        }
                      />
                      <span className="font-normal leading-snug">{a.title}</span>
                    </label>
                  ))}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={create.isPending || submitting}
                onClick={() => setCreateAssessmentOpen(true)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Create an assessment
              </Button>
              <CreateAssessmentDialog
                campaignId={campaignId}
                open={createAssessmentOpen}
                onOpenChange={setCreateAssessmentOpen}
                lockKind="assessment"
                onCreated={(activityId) => {
                  queryClient.invalidateQueries({
                    queryKey: ['sms-chat-setup-assessments', campaignId],
                  })
                  setPinnedAssessments((prev) => [...prev, activityId])
                }}
              />
            </div>
          )}

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
      <SmsOrgNameWarningDialog
        open={orgWarnOpen}
        onOpenChange={setOrgWarnOpen}
        onConfirm={() => {
          setOrgWarnOpen(false)
          void createBoard()
        }}
        confirmLabel="Create without it"
      />
    </>
  )
}
