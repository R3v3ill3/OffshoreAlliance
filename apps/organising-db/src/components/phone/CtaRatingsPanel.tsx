'use client'

/**
 * Per-CTA rating widget shown on the call screen during a connected call.
 *
 * Replaces the legacy single-select "CTA Response" control. For each
 * call_script_cta_ambitions row attached to the active script we render
 * one row whose rating control is driven by the linked
 * campaign_activities (assessment) row:
 *
 *   - is_binary = true   → yes / no / unsure / abstain buttons
 *                          (VOTE_SUPPORTER_OPTIONS).
 *   - is_binary = false  → 1..5 buttons using RATING_LEVELS, with the
 *                          activity's rating_labels JSONB overriding the
 *                          default labels per level.
 *
 * The captured rating per CTA is held in a Map<cta_ambition_id,
 * CtaRatingValue> and serialised into the cta_ratings array sent to
 * record_call_attempt.
 */

import type { CallCtaAmbition } from '@/components/phone/setup/types'
import { RATING_LEVELS } from '@/types/planner-types'
import { VOTE_SUPPORTER_OPTIONS } from '@/lib/campaign/constants'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'

// ─── Public types ─────────────────────────────────────────────────────────────

/** Joined ambition row used by this panel. Includes the assessment activity. */
export interface CtaAmbitionWithAssessment extends CallCtaAmbition {
  /** id is required at runtime (rows we render were persisted). */
  id: number
  /** Joined campaign_activities columns; null when no assessment is linked. */
  activity?: {
    activity_id: number
    title: string
    is_binary: boolean
    rating_labels: Record<string, string> | null
  } | null
}

export interface CtaRatingValue {
  /** 1..5 for non-binary; null when only binary_value is set. */
  rating: number | null
  /** yes / no / unsure / abstain for binary; null when only rating is set. */
  binary_value: string | null
  /** Optional per-CTA notes. */
  notes: string | null
}

export interface CtaRatingsPanelProps {
  ambitions: CtaAmbitionWithAssessment[]
  values: Map<number, CtaRatingValue>
  onChange: (ambitionId: number, next: CtaRatingValue | null) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function labelForRating(level: number, overrides: Record<string, string> | null): string {
  if (overrides && overrides[String(level)]) return overrides[String(level)]
  const def = RATING_LEVELS.find((r) => r.value === level)
  return def?.shortLabel ?? String(level)
}

function bgForRating(level: number): string {
  return RATING_LEVELS.find((r) => r.value === level)?.tailwindBg ?? 'bg-muted'
}

// ─── Single-CTA row ───────────────────────────────────────────────────────────

interface CtaRowProps {
  ambition: CtaAmbitionWithAssessment
  value: CtaRatingValue | null
  onChange: (next: CtaRatingValue | null) => void
}

function CtaRow({ ambition, value, onChange }: CtaRowProps) {
  const activity = ambition.activity ?? null
  const isBinary = activity?.is_binary ?? false
  const overrides = activity?.rating_labels ?? null

  function setRating(rating: number) {
    if (value?.rating === rating) {
      // Toggle off
      const cleared: CtaRatingValue = { rating: null, binary_value: value.binary_value, notes: value.notes }
      onChange(cleared.binary_value || cleared.notes ? cleared : null)
      return
    }
    onChange({ rating, binary_value: value?.binary_value ?? null, notes: value?.notes ?? null })
  }

  function setBinary(binary_value: string) {
    if (value?.binary_value === binary_value) {
      const cleared: CtaRatingValue = { rating: value.rating, binary_value: null, notes: value.notes }
      onChange(cleared.rating != null || cleared.notes ? cleared : null)
      return
    }
    onChange({ rating: value?.rating ?? null, binary_value, notes: value?.notes ?? null })
  }

  function setNotes(notes: string) {
    const trimmed = notes || null
    if (!trimmed && value?.rating == null && value?.binary_value == null) {
      onChange(null)
      return
    }
    onChange({ rating: value?.rating ?? null, binary_value: value?.binary_value ?? null, notes: trimmed })
  }

  return (
    <div className="rounded-lg border bg-background p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{ambition.cta_label}</p>
          {activity ? (
            <p className="text-[10px] text-muted-foreground truncate">
              Assessment: {activity.title}
              {isBinary && <span className="ml-1">(binary)</span>}
            </p>
          ) : (
            <Badge variant="outline" className="mt-1 text-[10px] gap-1 border-amber-300 text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              No assessment linked — rating won&apos;t reach wall chart
            </Badge>
          )}
        </div>
      </div>

      {/* Rating control — binary vs 1..5 */}
      {isBinary ? (
        <div className="flex flex-wrap gap-1.5">
          {VOTE_SUPPORTER_OPTIONS.map((opt) => {
            const selected = value?.binary_value === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBinary(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/40 hover:bg-muted text-foreground border-muted'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((level) => {
            const selected = value?.rating === level
            return (
              <button
                key={level}
                type="button"
                onClick={() => setRating(level)}
                title={labelForRating(level, overrides)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selected
                    ? `${bgForRating(level)} ring-2 ring-primary/60 text-foreground border-transparent`
                    : `${bgForRating(level)} opacity-60 hover:opacity-100 text-foreground border-transparent`
                }`}
              >
                <span className="font-mono text-[10px] mr-1">{level}</span>
                {labelForRating(level, overrides)}
              </button>
            )
          })}
        </div>
      )}

      <input
        type="text"
        value={value?.notes ?? ''}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full h-7 text-xs border rounded px-2 bg-background"
      />
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function CtaRatingsPanel({ ambitions, values, onChange }: CtaRatingsPanelProps) {
  if (ambitions.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground italic">
          No CTAs configured for this script. Add CTA ambitions in the script editor to record
          per-CTA ratings during calls.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">CTA ratings</p>
      <p className="text-[10px] text-muted-foreground">
        Record the worker&apos;s rating for each call to action. Ratings linked to an assessment
        are written to the wall chart automatically.
      </p>
      {ambitions.map((a) => (
        <CtaRow
          key={a.id}
          ambition={a}
          value={values.get(a.id) ?? null}
          onChange={(v) => onChange(a.id, v)}
        />
      ))}
    </div>
  )
}
