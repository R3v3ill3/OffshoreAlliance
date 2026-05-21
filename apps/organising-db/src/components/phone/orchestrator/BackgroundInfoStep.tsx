'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Plus } from 'lucide-react'
import { CreateAssessmentDialog } from '@/components/campaigns/assessments/create-assessment-dialog'
import {
  fetchUserAssessments,
  type UserAssessmentRow,
} from '@/lib/phone/fetch-user-assessments'
import type { VariationDimension } from '@/types/phone-call-action'

const VARIATION_DIMENSION_OPTIONS: { value: VariationDimension; label: string; hint: string }[] = [
  {
    value: 'membership_status',
    label: 'Membership status',
    hint: 'Tailor scripts for members vs non-members vs lapsed.',
  },
  {
    value: 'organising_role',
    label: 'Organising role',
    hint: 'Separate script tracks for delegates, reps, and rank-and-file.',
  },
  {
    value: 'occupation',
    label: 'Occupation',
    hint: 'Vary the script by job type or trade within the campaign.',
  },
  {
    value: 'rating_band',
    label: 'Rating band',
    hint: 'Target different messages to supporter, neutral, and unsupportive bands.',
  },
]

interface Assessment {
  assessment_id: number
  assessed_at: string
}

export interface BackgroundInfoValue {
  assessmentId: number | null
  hasVariations: boolean
  variationCount: number
  variationDimension: VariationDimension | null
  /**
   * Campaign assessments (campaign_activities.activity_id where
   * activity_kind = 'assessment') the driver wants to rate every contact
   * against during this call session. The dialler renders one rating row
   * per id. Empty array = no per-call assessment capture.
   */
  selectedAssessmentIds: number[]
}

type CampaignAssessmentRow = UserAssessmentRow

interface Props {
  campaignId: number | string
  value: BackgroundInfoValue
  onChange: (v: BackgroundInfoValue) => void
  onNext: () => void
  onCancel: () => void
}

export function BackgroundInfoStep({ campaignId, value, onChange, onNext, onCancel }: Props) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [addAssessmentOpen, setAddAssessmentOpen] = useState(false)

  const { data: assessments = [], isError: assessmentsError } = useQuery<Assessment[]>({
    queryKey: ['bargaining-strength-assessments', String(campaignId)],
    queryFn: async () => {
      try {
          const { data, error } = await supabase
          .from('bargaining_strength_assessments' as never)
          .select('assessment_id, assessed_at')
          .eq('campaign_id', Number(campaignId))
          .order('assessed_at', { ascending: false })
        if (error) return []
        return (data ?? []) as Assessment[]
      } catch {
        return []
      }
    },
    retry: false,
  })

  // Campaign assessments available to rate during this call session.
  // Driven by the same campaign_activities table the Workforce → Assessments
  // tab uses, with script-shadow rows filtered out (see
  // fetchUserAssessments docstring for the rationale).
  const { data: campaignAssessments = [] } = useQuery<CampaignAssessmentRow[]>({
    queryKey: ['campaign-assessment-options', String(campaignId)],
    queryFn: () => fetchUserAssessments(supabase, Number(campaignId)),
  })

  const selectedSet = new Set(value.selectedAssessmentIds)
  const toggleAssessment = (id: number) => {
    const next = new Set(selectedSet)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onChange({ ...value, selectedAssessmentIds: Array.from(next) })
  }

  // Keep variationDimension in sync when toggling variations off
  useEffect(() => {
    if (!value.hasVariations && value.variationDimension !== null) {
      onChange({ ...value, variationDimension: null, variationCount: 1 })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.hasVariations])

  const isValid =
    !value.hasVariations ||
    (value.variationCount >= 2 &&
      value.variationCount <= 5 &&
      value.variationDimension !== null)

  const selectedDimension = VARIATION_DIMENSION_OPTIONS.find(
    (o) => o.value === value.variationDimension
  )

  return (
    <div className="space-y-6">
      {/* Assessment selector */}
      <div className="space-y-2">
        <Label htmlFor="assessment-select">Bargaining strength assessment (optional)</Label>
        {assessmentsError || assessments.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No assessments configured for this campaign — you can skip this field.
          </p>
        ) : (
          <Select
            value={value.assessmentId != null ? String(value.assessmentId) : 'none'}
            onValueChange={(v) =>
              onChange({
                ...value,
                assessmentId: v === 'none' ? null : Number(v),
              })
            }
          >
            <SelectTrigger id="assessment-select">
              <SelectValue placeholder="Select an assessment…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {assessments.map((a) => (
                <SelectItem key={a.assessment_id} value={String(a.assessment_id)}>
                  {`Assessment ${new Date(a.assessed_at).toLocaleDateString()}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          Linking an assessment lets the script and CTA ambitions draw on the campaign&apos;s
          bargaining-strength data.
        </p>
      </div>

      {/* Multi-select: assessments to rate during this call session */}
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <Label>Assessments to rate during the call (optional)</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAddAssessmentOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New assessment
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tick the assessments you want to record a rating for on each contact
          (e.g. support level, willingness to take action). The dialler will
          show one rating row per assessment per call. New assessments you add
          here are saved to the campaign and remain available outside this
          session.
        </p>
        {campaignAssessments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No assessments defined for this campaign yet. Use the &ldquo;New
            assessment&rdquo; button above to create one.
          </p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto rounded border bg-muted/30 p-2">
            {campaignAssessments.map((a) => (
              <label
                key={a.activity_id}
                className="flex items-center gap-2 px-1 py-1 text-sm cursor-pointer hover:bg-background rounded"
              >
                <Checkbox
                  checked={selectedSet.has(a.activity_id)}
                  onCheckedChange={() => toggleAssessment(a.activity_id)}
                />
                <span>{a.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Variations toggle */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="has-variations"
            checked={value.hasVariations}
            onCheckedChange={(checked) =>
              onChange({
                ...value,
                hasVariations: checked,
                variationCount: checked ? 2 : 1,
                variationDimension: checked ? value.variationDimension : null,
              })
            }
          />
          <Label htmlFor="has-variations" className="cursor-pointer font-medium">
            This call has variations
          </Label>
        </div>

        <p className="text-xs text-muted-foreground">
          Variations let you create multiple slightly different scripts or lists for different
          worker segments — e.g. one for members and one for non-members — all tracked under
          this single phone call action.
        </p>

        {value.hasVariations && (
          <div className="pl-4 border-l-2 border-muted space-y-4">
            {/* Number of variations */}
            <div className="space-y-2">
              <Label htmlFor="variation-count">Number of variations (2–5)</Label>
              <Input
                id="variation-count"
                type="number"
                min={2}
                max={5}
                value={value.variationCount}
                onChange={(e) => {
                  const n = Math.min(5, Math.max(2, Number(e.target.value)))
                  onChange({ ...value, variationCount: n })
                }}
                className="w-24"
              />
            </div>

            {/* Variation dimension */}
            <div className="space-y-2">
              <Label htmlFor="variation-dimension">Variation dimension *</Label>
              <Select
                value={value.variationDimension ?? ''}
                onValueChange={(v) =>
                  onChange({ ...value, variationDimension: v as VariationDimension })
                }
              >
                <SelectTrigger id="variation-dimension">
                  <SelectValue placeholder="Select what to vary by…" />
                </SelectTrigger>
                <SelectContent>
                  {VARIATION_DIMENSION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDimension && (
                <p className="text-xs text-muted-foreground">{selectedDimension.hint}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onNext} disabled={!isValid}>
          Next
        </Button>
      </div>

      <CreateAssessmentDialog
        campaignId={String(campaignId)}
        open={addAssessmentOpen}
        onOpenChange={setAddAssessmentOpen}
        lockKind="assessment"
        onCreated={(activityId) => {
          // Auto-tick the new assessment for this session and refresh the list.
          queryClient.invalidateQueries({
            queryKey: ['campaign-assessment-options', String(campaignId)],
          })
          if (typeof activityId === 'number') {
            const next = new Set(value.selectedAssessmentIds)
            next.add(activityId)
            onChange({ ...value, selectedAssessmentIds: Array.from(next) })
          }
        }}
      />
    </div>
  )
}
