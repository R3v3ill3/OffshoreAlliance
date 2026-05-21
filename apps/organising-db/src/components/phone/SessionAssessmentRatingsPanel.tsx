'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { CapturedAssessmentRatingPayload } from '@/types/planner-types'

interface CampaignAssessmentRow {
  activity_id: number
  title: string
}

interface Props {
  /** phone_call_actions.action_id — when null/undefined the panel renders nothing. */
  actionId: number | null
  /** Local rating map by activity_id; lifted state so the parent can serialize on submit. */
  values: Map<number, { rating: number | null; notes: string | null }>
  onChange: (
    activityId: number,
    next: { rating: number | null; notes: string | null } | null,
  ) => void
}

/**
 * Renders one rating row per assessment the driver chose at session setup
 * (phone_call_actions.selected_assessment_ids). Each row exposes a 1–5
 * scale plus an explicit "unassessed" pill so the driver can deliberately
 * skip an assessment for this call.
 *
 * The component does its own data fetching to keep CallSessionPage tight.
 */
export function SessionAssessmentRatingsPanel({ actionId, values, onChange }: Props) {
  const supabase = createClient()

  const { data: selectedIds = [] } = useQuery<number[]>({
    queryKey: ['phone-call-action-selected-assessments', actionId],
    queryFn: async () => {
      if (actionId == null) return []
      const { data, error } = await supabase
        .from('phone_call_actions')
        .select('selected_assessment_ids')
        .eq('action_id', actionId)
        .maybeSingle()
      if (error) throw error
      const ids = (data as { selected_assessment_ids?: number[] } | null)?.selected_assessment_ids
      return Array.isArray(ids) ? ids : []
    },
    enabled: actionId != null,
    staleTime: 30_000,
  })

  const { data: assessments = [] } = useQuery<CampaignAssessmentRow[]>({
    queryKey: ['campaign-assessments-by-ids', selectedIds],
    queryFn: async () => {
      if (selectedIds.length === 0) return []
      const { data, error } = await supabase
        .from('campaign_activities')
        .select('activity_id, title')
        .in('activity_id', selectedIds)
      if (error) throw error
      return (data ?? []) as CampaignAssessmentRow[]
    },
    enabled: selectedIds.length > 0,
  })

  // Preserve the user's setup-time ordering when rendering.
  const ordered = useMemo(() => {
    const byId = new Map(assessments.map((a) => [a.activity_id, a] as const))
    return selectedIds.map((id) => byId.get(id)).filter(Boolean) as CampaignAssessmentRow[]
  }, [assessments, selectedIds])

  if (actionId == null || ordered.length === 0) return null

  return (
    <div className="space-y-2 p-3 rounded border bg-background">
      <label className="text-xs font-medium">Session assessments</label>
      <p className="text-xs text-muted-foreground">
        Rate each assessment for this contact. Leave on &ldquo;Unassessed&rdquo; if
        you didn&apos;t gather enough signal during the call.
      </p>
      <div className="space-y-3">
        {ordered.map((a) => {
          const current = values.get(a.activity_id) ?? { rating: null, notes: null }
          return (
            <AssessmentRow
              key={a.activity_id}
              title={a.title}
              value={current}
              onChange={(next) => onChange(a.activity_id, next)}
            />
          )
        })}
      </div>
    </div>
  )
}

function AssessmentRow({
  title,
  value,
  onChange,
}: {
  title: string
  value: { rating: number | null; notes: string | null }
  onChange: (next: { rating: number | null; notes: string | null }) => void
}) {
  const ratingLabels = ['1', '2', '3', '4', '5']

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant={value.rating == null ? 'default' : 'outline'}
          className="h-7 text-xs"
          onClick={() => onChange({ rating: null, notes: value.notes })}
        >
          Unassessed
        </Button>
        {ratingLabels.map((label, idx) => {
          const rating = idx + 1
          const active = value.rating === rating
          return (
            <Button
              key={rating}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              className="h-7 w-8 text-xs px-0"
              onClick={() => onChange({ rating, notes: value.notes })}
            >
              {label}
            </Button>
          )
        })}
      </div>
      <input
        type="text"
        value={value.notes ?? ''}
        onChange={(e) =>
          onChange({ rating: value.rating, notes: e.target.value || null })
        }
        placeholder="Notes (optional)"
        className="w-full h-7 px-2 text-xs rounded border bg-background"
      />
    </div>
  )
}

/**
 * Build the assessment_ratings payload from the live values map. Filters out
 * rows that are still untouched (rating=null AND no notes) so we don't
 * insert empty rows during routine calls.
 */
export function serializeAssessmentRatings(
  values: Map<number, { rating: number | null; notes: string | null }>,
): CapturedAssessmentRatingPayload[] {
  const out: CapturedAssessmentRatingPayload[] = []
  values.forEach((v, activity_id) => {
    if (v.rating == null && (!v.notes || v.notes.trim() === '')) return
    out.push({ activity_id, rating: v.rating, notes: v.notes })
  })
  return out
}
