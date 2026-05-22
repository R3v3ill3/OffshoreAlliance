'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BackgroundInfoStep, type BackgroundInfoValue } from './BackgroundInfoStep'
import { pathwayFor, type EntryBranch, type VariationDimension } from '@/types/phone-call-action'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: number | string
  actionId: number
}

interface ActionRow {
  action_id: number
  assessment_id: number | null
  variation_count: number
  variation_dimension: VariationDimension | null
  selected_assessment_ids: number[] | null
  entry_branch: EntryBranch
}

const EMPTY_VALUE: BackgroundInfoValue = {
  assessmentId: null,
  hasVariations: false,
  variationCount: 1,
  variationDimension: null,
  selectedAssessmentIds: [],
}

/**
 * Reusable mid-session setup editor. Renders the same `BackgroundInfoStep`
 * the orchestrator uses, but loads/saves against an existing
 * `phone_call_actions` row rather than creating a new one.
 *
 * Mounted on:
 *   • The dialler (CallSessionPage) — "Edit setup" button
 *   • The list-management page after Build List → Fire
 *
 * so both pathways can configure session assessments and variations after
 * the action row has been created.
 */
export function EditCallSetupDialog({ open, onOpenChange, campaignId, actionId }: Props) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [value, setValue] = useState<BackgroundInfoValue>(EMPTY_VALUE)
  const [isSaving, setIsSaving] = useState(false)

  const { data: action } = useQuery<ActionRow | null>({
    queryKey: ['phone-call-action', actionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phone_call_actions')
        .select(
          'action_id, assessment_id, variation_count, variation_dimension, selected_assessment_ids, entry_branch',
        )
        .eq('action_id', actionId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as ActionRow | null
    },
    enabled: open && actionId != null,
  })

  // Assessment-only sessions don't have a script, so variations + the
  // bargaining-strength assessment selector are meaningless there.
  const isAssessmentOnly = action
    ? pathwayFor(action.entry_branch) === 'assessment_only'
    : false

  useEffect(() => {
    if (action) {
      setValue({
        assessmentId: action.assessment_id,
        hasVariations:
          action.variation_count > 1 &&
          action.variation_dimension != null &&
          action.variation_dimension !== ('none' as VariationDimension),
        variationCount: action.variation_count,
        variationDimension:
          action.variation_dimension === ('none' as VariationDimension)
            ? null
            : action.variation_dimension,
        selectedAssessmentIds: Array.isArray(action.selected_assessment_ids)
          ? action.selected_assessment_ids
          : [],
      })
    }
  }, [action])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('phone_call_actions')
        .update({
          assessment_id: value.assessmentId,
          variation_count: value.hasVariations ? value.variationCount : 1,
          variation_dimension: value.hasVariations ? value.variationDimension : 'none',
          selected_assessment_ids: value.selectedAssessmentIds,
        })
        .eq('action_id', actionId)
      if (error) throw error
      toast.success('Call setup updated')
      queryClient.invalidateQueries({ queryKey: ['phone-call-action', actionId] })
      queryClient.invalidateQueries({
        queryKey: ['phone-call-action-selected-assessments', actionId],
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update call setup')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit call setup</DialogTitle>
          <DialogDescription>
            Adjust the assessments to rate and variation settings for this
            session. Changes apply to subsequent calls — already-recorded
            attempts are not modified.
          </DialogDescription>
        </DialogHeader>
        <BackgroundInfoStep
          campaignId={campaignId}
          value={value}
          onChange={setValue}
          onNext={handleSave}
          onCancel={() => onOpenChange(false)}
          hideScriptOnlyControls={isAssessmentOnly}
        />
        {isSaving && (
          <p className="text-xs text-muted-foreground text-center">Saving…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
