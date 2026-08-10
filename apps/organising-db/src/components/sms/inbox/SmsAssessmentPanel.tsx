'use client'

/**
 * Phase 3 in-chat assessment capture (brief §3.1 item 7, §5.1).
 *
 * Rendered in the member sidebar when the conversation is worker-matched
 * and campaign-attached. Two sections:
 *
 *   1. Quick capture (Spoke "scripted answer") — when the thread is
 *      attached to an activity, one-tap outcome buttons that record the
 *      member's reply as an assessment AND pre-fill the compose box from
 *      a canned reply tagged with that outcome_value.
 *   2. Campaign assessments — one row per campaign_activities
 *      activity_kind='assessment': 1–5 chips in RATING_LEVELS colours
 *      (rating_labels overrides honoured) with an explicit "Unassessed"
 *      state, or VOTE_SUPPORTER_OPTIONS pills when is_binary; notes;
 *      dirty-aware save. Explicit Unassessed on a saved rating deletes
 *      the row (rating scale memory: 1=supportive leader …
 *      5=oppositional leader, NULL=unassessed — surfaced as its own
 *      state, never hidden).
 *
 * Writes go through POST /api/sms/conversations/[id]/assessments →
 * record_assessment_event(source 'sms') → campaign_activity_ratings.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RATING_LEVELS } from '@/types/planner-types'
import { VOTE_SUPPORTER_OPTIONS } from '@/lib/campaign/constants'
import type { SmsCannedReplyRow } from '@/types/sms'
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

interface RatingValue {
  rating: number | null
  binary_value: string | null
  notes: string | null
}

const EMPTY_VALUE: RatingValue = { rating: null, binary_value: null, notes: null }

function labelForRating(
  level: number,
  overrides: Record<string, string> | null,
): string {
  if (overrides && overrides[String(level)]) return overrides[String(level)]
  const def = RATING_LEVELS.find((r) => r.value === level)
  return def?.shortLabel ?? String(level)
}

function bgForRating(level: number): string {
  return RATING_LEVELS.find((r) => r.value === level)?.tailwindBg ?? 'bg-muted'
}

function sameValue(a: RatingValue, b: RatingValue): boolean {
  return (
    a.rating === b.rating &&
    a.binary_value === b.binary_value &&
    (a.notes ?? '') === (b.notes ?? '')
  )
}

interface SmsAssessmentPanelProps {
  conversation: SmsConversationListItem
  cannedReplies: SmsCannedReplyRow[]
  onInsertCanned: (body: string) => void
}

export function SmsAssessmentPanel({
  conversation,
  cannedReplies,
  onInsertCanned,
}: SmsAssessmentPanelProps) {
  const supabase = createClient()
  const campaignId = conversation.campaign_id
  const workerId = conversation.worker?.worker_id ?? null
  const save = useSaveSmsAssessment(
    conversation.conversation_id,
    campaignId,
    workerId,
  )

  // Campaign assessments (same sourcing as the wall-chart Ratings tab).
  const { data: assessments = [] } = useQuery({
    queryKey: ['sms-campaign-assessments', campaignId],
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

  // The attached activity may be any activity_kind (e.g. sms_blast) —
  // fetch it separately for the quick-capture section.
  const { data: attachedActivity } = useQuery({
    queryKey: ['sms-attached-activity', conversation.activity_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_activities')
        .select('activity_id, title, is_binary, rating_labels, campaign_id')
        .eq('activity_id', conversation.activity_id as number)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        ...data,
        rating_labels: (data.rating_labels ?? null) as
          | Record<string, string>
          | null,
      } as AssessmentActivity & { campaign_id: number }
    },
    enabled: conversation.activity_id != null,
    staleTime: 30_000,
  })

  // Current saved values: 'actual' phase, NULL event (the same slot the
  // save writes to).
  const activityIds = useMemo(() => {
    const ids = assessments.map((a) => a.activity_id)
    if (
      conversation.activity_id != null &&
      !ids.includes(conversation.activity_id)
    ) {
      ids.push(conversation.activity_id)
    }
    return ids
  }, [assessments, conversation.activity_id])

  const { data: savedRows = [] } = useQuery({
    queryKey: ['sms-worker-assessment-ratings', campaignId, workerId, activityIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_activity_ratings')
        .select('activity_id, rating, binary_value, notes')
        .eq('worker_id', workerId as number)
        .eq('rating_phase', 'actual')
        .is('event_id', null)
        .in('activity_id', activityIds)
      if (error) throw error
      return data ?? []
    },
    enabled: workerId != null && activityIds.length > 0,
  })

  const savedByActivity = useMemo(() => {
    const map = new Map<number, RatingValue>()
    for (const r of savedRows) {
      map.set(r.activity_id as number, {
        rating: r.rating,
        binary_value: r.binary_value,
        notes: r.notes,
      })
    }
    return map
  }, [savedRows])

  // Local edits by activity — cleared on successful save so the row
  // re-syncs from the ratings query.
  const [edits, setEdits] = useState<Map<number, RatingValue>>(new Map())
  const [savingId, setSavingId] = useState<number | null>(null)
  const [quickSaving, setQuickSaving] = useState<string | null>(null)

  const setEdit = (activityId: number, next: RatingValue) => {
    setEdits((prev) => {
      const map = new Map(prev)
      map.set(activityId, next)
      return map
    })
  }

  const clearEdit = (activityId: number) => {
    setEdits((prev) => {
      const map = new Map(prev)
      map.delete(activityId)
      return map
    })
  }

  const saveRow = (activity: AssessmentActivity) => {
    const value =
      edits.get(activity.activity_id) ??
      savedByActivity.get(activity.activity_id) ??
      EMPTY_VALUE
    setSavingId(activity.activity_id)
    save.mutate(
      {
        activity_id: activity.activity_id,
        rating: value.rating,
        binary_value: value.binary_value,
        notes: value.notes,
      },
      {
        onSuccess: (res) => {
          clearEdit(activity.activity_id)
          toast.success(res.cleared ? 'Rating cleared (unassessed)' : 'Rating saved')
        },
        onError: (err: Error) => toast.error(err.message),
        onSettled: () => setSavingId(null),
      },
    )
  }

  /**
   * Spoke gesture: record the outcome AND load the linked canned reply
   * (campaign-scoped preferred over org-wide) into the compose box.
   */
  const quickCapture = (outcome: {
    value: string
    rating: number | null
    binary_value: string | null
  }) => {
    if (attachedActivity == null) return
    setQuickSaving(outcome.value)
    save.mutate(
      {
        activity_id: attachedActivity.activity_id,
        rating: outcome.rating,
        binary_value: outcome.binary_value,
      },
      {
        onSuccess: () => {
          const matches = cannedReplies.filter(
            (r) => r.outcome_value === outcome.value,
          )
          const reply =
            matches.find((r) => r.campaign_id != null) ?? matches[0] ?? null
          if (reply) {
            onInsertCanned(reply.body)
            toast.success('Outcome recorded — reply loaded into the composer')
          } else {
            toast.success('Outcome recorded')
          }
        },
        onError: (err: Error) => toast.error(err.message),
        onSettled: () => setQuickSaving(null),
      },
    )
  }

  const quickOptions = useMemo(() => {
    if (!attachedActivity) return []
    if (attachedActivity.is_binary) {
      return VOTE_SUPPORTER_OPTIONS.map((o) => ({
        value: o.value as string,
        label: o.label as string,
        rating: null as number | null,
        binary_value: o.value as string,
        bg: null as string | null,
      }))
    }
    return [1, 2, 3, 4, 5].map((level) => ({
      value: String(level),
      label: labelForRating(level, attachedActivity.rating_labels),
      rating: level as number | null,
      binary_value: null as string | null,
      bg: bgForRating(level),
    }))
  }, [attachedActivity])

  if (campaignId == null || workerId == null) return null

  return (
    <div className="space-y-3">
      {/* Quick capture — scripted answers for the attached activity. */}
      {attachedActivity && (
        <div className="space-y-1.5 rounded-md border bg-muted/20 p-2">
          <Label className="flex items-center gap-1 text-xs">
            <Zap className="h-3 w-3 text-amber-600" />
            Record reply outcome
          </Label>
          <p className="text-[10px] text-muted-foreground">
            {attachedActivity.title} — one tap records the assessment and
            loads the matching canned reply (if one is tagged).
          </p>
          <div className="flex flex-wrap gap-1">
            {quickOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={quickSaving != null}
                onClick={() => quickCapture(opt)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  opt.bg
                    ? `${opt.bg} border-transparent text-foreground opacity-80 hover:opacity-100`
                    : 'border-muted bg-muted/40 text-foreground hover:bg-muted'
                } ${quickSaving === opt.value ? 'ring-2 ring-primary/60' : ''}`}
              >
                {quickSaving === opt.value && (
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                )}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Per-assessment rating rows. */}
      <div className="space-y-1.5">
        <Label className="text-xs">Assessments</Label>
        {assessments.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No assessments exist for this campaign yet — add one from the
            wall chart header.
          </p>
        ) : (
          <div className="space-y-2">
            {assessments.map((a) => {
              const saved = savedByActivity.get(a.activity_id) ?? EMPTY_VALUE
              const value = edits.get(a.activity_id) ?? saved
              const dirty = !sameValue(value, saved)
              return (
                <AssessmentRow
                  key={a.activity_id}
                  activity={a}
                  value={value}
                  savedNotes={saved.notes}
                  dirty={dirty}
                  saving={savingId === a.activity_id}
                  onChange={(next) => setEdit(a.activity_id, next)}
                  onSave={() => saveRow(a)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function AssessmentRow({
  activity,
  value,
  savedNotes,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  activity: AssessmentActivity
  value: RatingValue
  savedNotes: string | null
  dirty: boolean
  saving: boolean
  onChange: (next: RatingValue) => void
  onSave: () => void
}) {
  const isBinary = !!activity.is_binary
  const unassessed = value.rating == null && value.binary_value == null

  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <p className="text-xs font-medium">{activity.title}</p>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() =>
            onChange({ rating: null, binary_value: null, notes: value.notes })
          }
          title={RATING_LEVELS[0].description}
          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
            unassessed
              ? `${RATING_LEVELS[0].tailwindBg} border-transparent text-foreground ring-2 ring-primary/60`
              : `${RATING_LEVELS[0].tailwindBg} border-transparent text-foreground opacity-50 hover:opacity-100`
          }`}
        >
          Unassessed
        </button>
        {isBinary
          ? VOTE_SUPPORTER_OPTIONS.map((opt) => {
              const selected = value.binary_value === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onChange({
                      rating: null,
                      binary_value: selected ? null : opt.value,
                      notes: value.notes,
                    })
                  }
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted bg-muted/40 text-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })
          : [1, 2, 3, 4, 5].map((level) => {
              const selected = value.rating === level
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() =>
                    onChange({
                      rating: selected ? null : level,
                      binary_value: null,
                      notes: value.notes,
                    })
                  }
                  title={labelForRating(level, activity.rating_labels)}
                  className={`rounded-full border border-transparent px-2 py-0.5 text-[11px] text-foreground transition-colors ${bgForRating(level)} ${
                    selected
                      ? 'ring-2 ring-primary/60'
                      : 'opacity-50 hover:opacity-100'
                  }`}
                >
                  <span className="mr-1 font-mono text-[10px]">{level}</span>
                  {labelForRating(level, activity.rating_labels)}
                </button>
              )
            })}
      </div>
      <input
        type="text"
        value={value.notes ?? ''}
        onChange={(e) =>
          onChange({
            rating: value.rating,
            binary_value: value.binary_value,
            notes: e.target.value || null,
          })
        }
        placeholder="Notes (optional)"
        className="h-7 w-full rounded border bg-background px-2 text-xs"
      />
      {savedNotes && !value.notes?.trim() && (
        <p className="text-[10px] text-muted-foreground">
          Notes can be updated but not cleared here — set the assessment to
          Unassessed to remove its note.
        </p>
      )}
      {dirty && (
        <Button
          size="sm"
          className="h-7 w-full text-xs"
          disabled={saving}
          onClick={onSave}
        >
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {unassessed ? 'Clear rating (unassessed)' : 'Save rating'}
        </Button>
      )}
    </div>
  )
}
