'use client'

/**
 * Pinned assessment capture for the chat workspace member pane
 * (Phase 10, decision 5; brief §E3).
 *
 * SmsAssessmentPanel renders EVERY campaign assessment as its own row
 * with its own dirty-save button. That is the wrong grain for the job
 * this is built for: assessing thirty members against one question. So
 * a chat board pins a small set of target assessments
 * (sms_lists.selected_assessment_ids, mirroring the phone pathway's
 * phone_call_actions.selected_assessment_ids) and this renders them as
 * ONE TAP per member — no save button, optimistic, with rollback.
 *
 * Same write path as the sidebar panel: POST
 * /api/sms/conversations/[id]/assessments → record_assessment_event
 * (source 'sms'). Both surfaces read and invalidate the same query key
 * so they can never disagree.
 *
 * Palette: RATING_LEVELS colours here mean *rating*. The chat rail's
 * row tints mean *conversation state* and come from a deliberately
 * different, desaturated palette.
 */
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Pin, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { excludeSmsEpisodes } from '@/lib/campaign/visible-campaigns'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RATING_LEVELS } from '@/types/planner-types'
import { VOTE_SUPPORTER_OPTIONS } from '@/lib/campaign/constants'
import { CreateAssessmentDialog } from '@/components/campaigns/assessments/create-assessment-dialog'
import {
  pruneSelectedAssessmentIds,
  resolveAssessmentTarget,
} from '@/lib/sms/chat-assessment-target'
import {
  useSaveSmsAssessment,
  type SmsConversationListItem,
} from '@/lib/hooks/useSmsInbox'

interface AssessmentActivity {
  activity_id: number
  title: string
  is_binary: boolean | null
  rating_labels: Record<string, string> | null
}

interface SavedRating {
  activity_id: number
  rating: number | null
  binary_value: string | null
}

function labelForRating(
  level: number,
  overrides: Record<string, string> | null,
): string {
  if (overrides && overrides[String(level)]) return overrides[String(level)]
  return RATING_LEVELS.find((r) => r.value === level)?.shortLabel ?? String(level)
}

function bgForRating(level: number): string {
  return RATING_LEVELS.find((r) => r.value === level)?.tailwindBg ?? 'bg-muted'
}

export interface SmsPinnedAssessmentProps {
  conversation: SmsConversationListItem
  /** True when conversation.campaign_id is a hidden episode campaign. */
  campaignIsEpisode?: boolean
  /** sms_lists.selected_assessment_ids for the board this thread is on. */
  pinnedActivityIds?: number[]
  /** sms_lists.assessment_campaign_id — the nominated real campaign. */
  assessmentCampaignId?: number | null
  /** Persist a nomination / a newly pinned assessment to the board. */
  onNominateCampaign?: (campaignId: number) => void
  onPinActivity?: (activityId: number) => void
  /** Board context is absent in the Inbox — hide the pin affordances. */
  canPin?: boolean
}

export function SmsPinnedAssessment({
  conversation,
  campaignIsEpisode = false,
  pinnedActivityIds = [],
  assessmentCampaignId = null,
  onNominateCampaign,
  onPinActivity,
  canPin = false,
}: SmsPinnedAssessmentProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const workerId = conversation.worker?.worker_id ?? null

  const target = resolveAssessmentTarget({
    conversationCampaignId: conversation.campaign_id,
    conversationCampaignIsEpisode: campaignIsEpisode,
    boardAssessmentCampaignId: assessmentCampaignId,
    workerId,
  })
  const campaignId = target.state === 'ready' ? target.campaignId : null

  const save = useSaveSmsAssessment(
    conversation.conversation_id,
    campaignId,
    workerId,
  )

  const [saving, setSaving] = useState<string | null>(null)
  // Optimistic chip state, keyed activityId → value. Cleared per row on
  // settle so the row re-syncs from the ratings query.
  const [optimistic, setOptimistic] = useState<Map<number, SavedRating>>(
    new Map(),
  )

  const { data: assessments = [] } = useQuery({
    queryKey: ['sms-pinned-assessments', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_activities')
        .select('activity_id, title, is_binary, rating_labels')
        .eq('campaign_id', campaignId as number)
        .eq('activity_kind', 'assessment')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((a) => ({
        ...a,
        rating_labels: (a.rating_labels ?? null) as Record<string, string> | null,
      })) as AssessmentActivity[]
    },
    enabled: campaignId != null,
    staleTime: 30_000,
  })

  // Stale pins (assessment deleted on the wall chart mid-session) are
  // filtered, never errored — a dead pin must not break the workspace.
  const livePinned = useMemo(
    () =>
      pruneSelectedAssessmentIds(
        pinnedActivityIds,
        assessments.map((a) => a.activity_id),
      ),
    [pinnedActivityIds, assessments],
  )

  const pinnedActivities = useMemo(() => {
    const byId = new Map(assessments.map((a) => [a.activity_id, a]))
    return livePinned
      .map((id) => byId.get(id))
      .filter((a): a is AssessmentActivity => a != null)
  }, [livePinned, assessments])

  const { data: savedRows = [] } = useQuery({
    queryKey: ['sms-worker-assessment-ratings', campaignId, workerId, livePinned],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_activity_ratings')
        .select('activity_id, rating, binary_value')
        .eq('worker_id', workerId as number)
        .eq('rating_phase', 'actual')
        .is('event_id', null)
        .in('activity_id', livePinned)
      if (error) throw error
      return (data ?? []) as SavedRating[]
    },
    enabled: workerId != null && livePinned.length > 0,
  })

  const savedByActivity = useMemo(() => {
    const map = new Map<number, SavedRating>()
    for (const r of savedRows) map.set(r.activity_id, r)
    return map
  }, [savedRows])

  // Campaign picker for the two "needs a campaign" remedies.
  const { data: campaigns = [] } = useQuery({
    queryKey: ['sms-pinned-campaign-options'],
    queryFn: async () => {
      const { data, error } = await excludeSmsEpisodes(
        supabase
          .from('campaigns')
          .select('campaign_id, name')
          .order('name', { ascending: true }),
      )
      if (error) throw error
      return (data ?? []) as { campaign_id: number; name: string }[]
    },
    enabled: target.state === 'needs_real_campaign',
    staleTime: 60_000,
  })

  const tap = (
    activity: AssessmentActivity,
    next: { rating: number | null; binary_value: string | null },
  ) => {
    const key = `${activity.activity_id}:${next.rating ?? next.binary_value ?? 'none'}`
    const previous = optimistic.get(activity.activity_id)
    setSaving(key)
    setOptimistic((prev) =>
      new Map(prev).set(activity.activity_id, {
        activity_id: activity.activity_id,
        ...next,
      }),
    )
    save.mutate(
      { activity_id: activity.activity_id, ...next },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({
            queryKey: ['sms-worker-assessment-ratings'],
          })
          toast.success(res.cleared ? 'Marked unassessed' : 'Rating saved')
        },
        onError: (err: Error) => {
          // Roll the chip back to whatever it showed before the tap.
          setOptimistic((prev) => {
            const map = new Map(prev)
            if (previous) map.set(activity.activity_id, previous)
            else map.delete(activity.activity_id)
            return map
          })
          toast.error(err.message)
        },
        onSettled: () => setSaving(null),
      },
    )
  }

  // ── Remedies ─────────────────────────────────────────────────

  if (target.state === 'needs_worker') {
    return (
      <Remedy>
        Match this conversation to a member before recording ratings.
      </Remedy>
    )
  }

  if (target.state === 'needs_campaign') {
    return (
      <Remedy>
        Attach this conversation to a campaign to record ratings.
      </Remedy>
    )
  }

  if (target.state === 'needs_real_campaign') {
    return (
      <div className="space-y-1.5 rounded-md border border-dashed p-2">
        <Label className="text-[11px]">Assessments</Label>
        <p className="text-[11px] text-muted-foreground">
          Standalone chat — choose the campaign these assessments belong to.
          Ratings recorded against a standalone session never reach a wall
          chart.
        </p>
        <Select
          value=""
          onValueChange={(v) => onNominateCampaign?.(Number(v))}
          disabled={!onNominateCampaign}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue placeholder="Pick a campaign…" />
          </SelectTrigger>
          <SelectContent>
            {campaigns.map((c) => (
              <SelectItem key={c.campaign_id} value={String(c.campaign_id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  // ── Pinned chips ─────────────────────────────────────────────

  if (pinnedActivities.length === 0) {
    return (
      <div className="space-y-1.5 rounded-md border border-dashed p-2">
        <Label className="flex items-center gap-1 text-[11px]">
          <Pin className="h-3 w-3" />
          Assessments
        </Label>
        <p className="text-[11px] text-muted-foreground">
          {canPin
            ? 'Nothing pinned to this chat yet.'
            : 'No assessment pinned to this conversation.'}
        </p>
        {canPin && (
          <PinControls
            campaignId={campaignId}
            assessments={assessments}
            livePinned={livePinned}
            onPinActivity={onPinActivity}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1 text-[11px]">
        <Pin className="h-3 w-3" />
        Assessments
      </Label>
      {pinnedActivities.map((activity) => {
        const value =
          optimistic.get(activity.activity_id) ??
          savedByActivity.get(activity.activity_id) ??
          null
        const unassessed =
          value == null ||
          (value.rating == null && value.binary_value == null)
        return (
          <div key={activity.activity_id} className="space-y-1 rounded-md border p-2">
            <p className="text-[11px] font-medium">{activity.title}</p>
            <div className="flex flex-wrap gap-1">
              <Chip
                selected={unassessed}
                busy={saving === `${activity.activity_id}:none`}
                className={RATING_LEVELS[0].tailwindBg}
                onClick={() =>
                  tap(activity, { rating: null, binary_value: null })
                }
              >
                Unassessed
              </Chip>
              {activity.is_binary
                ? VOTE_SUPPORTER_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.value}
                      selected={value?.binary_value === opt.value}
                      busy={saving === `${activity.activity_id}:${opt.value}`}
                      onClick={() =>
                        tap(activity, {
                          rating: null,
                          binary_value: opt.value as string,
                        })
                      }
                    >
                      {opt.label}
                    </Chip>
                  ))
                : [1, 2, 3, 4, 5].map((level) => (
                    <Chip
                      key={level}
                      selected={value?.rating === level}
                      busy={saving === `${activity.activity_id}:${level}`}
                      className={bgForRating(level)}
                      title={labelForRating(level, activity.rating_labels)}
                      onClick={() =>
                        tap(activity, { rating: level, binary_value: null })
                      }
                    >
                      <span className="mr-1 font-mono text-[10px]">{level}</span>
                      {labelForRating(level, activity.rating_labels)}
                    </Chip>
                  ))}
            </div>
          </div>
        )
      })}
      {canPin && (
        <div className="space-y-1.5 pt-0.5">
          <PinControls
            dense
            campaignId={campaignId}
            assessments={assessments}
            livePinned={livePinned}
            onPinActivity={onPinActivity}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Pin an existing assessment, or create a new one.
 *
 * Shared by the empty and populated states. Creating used to be offered
 * only when nothing was pinned yet, so the moment an organiser pinned
 * their first assessment the ability to make another one disappeared —
 * and mid-chat is exactly when the need for a new one shows up.
 */
function PinControls({
  campaignId,
  assessments,
  livePinned,
  onPinActivity,
  dense = false,
}: {
  campaignId: number | null
  assessments: AssessmentActivity[]
  livePinned: number[]
  onPinActivity?: (activityId: number) => void
  dense?: boolean
}) {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const unpinned = assessments.filter(
    (a) => !livePinned.includes(a.activity_id),
  )
  const control = dense ? 'h-7 text-[11px]' : 'h-8 text-xs'

  return (
    <>
      {unpinned.length > 0 && (
        <Select value="" onValueChange={(v) => onPinActivity?.(Number(v))}>
          <SelectTrigger className={`${control} w-full`}>
            <SelectValue
              placeholder={
                livePinned.length > 0
                  ? 'Pin another…'
                  : 'Pin an existing assessment…'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {unpinned.map((a) => (
              <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                {a.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        size="sm"
        variant="outline"
        className={`${control} w-full`}
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="mr-1 h-3 w-3" />
        Create an assessment
      </Button>
      {campaignId != null && (
        <CreateAssessmentDialog
          campaignId={String(campaignId)}
          open={createOpen}
          onOpenChange={setCreateOpen}
          lockKind="assessment"
          onCreated={(activityId) => {
            // Create AND pin in one gesture — the point of having this
            // here rather than on the wall-chart header.
            queryClient.invalidateQueries({
              queryKey: ['sms-pinned-assessments', campaignId],
            })
            onPinActivity?.(activityId)
          }}
        />
      )}
    </>
  )
}

function Remedy({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
      {children}
    </div>
  )
}

function Chip({
  selected,
  busy,
  className = '',
  title,
  onClick,
  children,
}: {
  selected: boolean
  busy: boolean
  className?: string
  title?: string
  onClick: () => void
  children: React.ReactNode
}) {
  const tinted = className.length > 0
  return (
    <button
      type="button"
      title={title}
      disabled={busy}
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-2 py-0.5 text-[11px] text-foreground transition-colors ${
        tinted
          ? `${className} border-transparent`
          : 'border-muted bg-muted/40 hover:bg-muted'
      } ${selected ? 'ring-2 ring-primary/60' : tinted ? 'opacity-50 hover:opacity-100' : ''}`}
    >
      {busy && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
      {children}
    </button>
  )
}
