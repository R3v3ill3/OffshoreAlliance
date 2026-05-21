'use client'

/**
 * Assessment-only setup page — the standalone setup component for the
 * assessment-only pathway (orchestrator: PathwayPicker → OrderPicker →
 * here OR list-step).
 *
 * What it does
 *   • Loads the phone_call_actions row by action_id.
 *   • Shows a multi-select of campaign assessments + an "Add assessment"
 *     button that opens the existing CreateAssessmentDialog.
 *   • Saves the picked activity_ids to phone_call_actions.selected_assessment_ids.
 *   • Routes onward based on entry_branch:
 *       'assessment_first'      → list step (still needs a list)
 *       'assessment_list_first' → dialler (list already attached)
 *
 * Back navigation uses returnTo when the user is on the first component,
 * or routes to the list step when the user is on the second component.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Loader2, Plus, Star } from 'lucide-react'
import { toast } from 'sonner'
import { CreateAssessmentDialog } from '@/components/campaigns/assessments/create-assessment-dialog'
import {
  fetchUserAssessments,
  type UserAssessmentRow,
} from '@/lib/phone/fetch-user-assessments'
import type { EntryBranch } from '@/types/phone-call-action'

interface ActionRow {
  action_id: number
  campaign_id: number
  entry_branch: EntryBranch
  selected_assessment_ids: number[] | null
  list_ids: number[] | null
}

type CampaignAssessmentRow = UserAssessmentRow

export default function AssessmentSetupPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const campaignId = params.id as string
  const actionId = useMemo(() => {
    const raw = searchParams.get('action_id')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [searchParams])
  const returnTo = searchParams.get('returnTo')
    ? decodeURIComponent(searchParams.get('returnTo')!)
    : `/campaigns/${campaignId}`

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [addAssessmentOpen, setAddAssessmentOpen] = useState(false)

  const { data: action, isLoading: actionLoading } = useQuery<ActionRow | null>({
    queryKey: ['phone-call-action', actionId],
    queryFn: async () => {
      if (actionId == null) return null
      const { data, error } = await supabase
        .from('phone_call_actions')
        .select('action_id, campaign_id, entry_branch, selected_assessment_ids, list_ids')
        .eq('action_id', actionId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as ActionRow | null
    },
    enabled: actionId != null,
  })

  // Seed the local selection from the action row on first load.
  useEffect(() => {
    if (action && action.selected_assessment_ids) {
      setSelectedIds(new Set(action.selected_assessment_ids))
    }
  }, [action])

  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery<CampaignAssessmentRow[]>({
    queryKey: ['campaign-assessment-options', campaignId],
    queryFn: () => fetchUserAssessments(supabase, Number(campaignId)),
  })

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Resolve the "next" destination based on entry_branch + list state.
  function computeNextHref(): string {
    if (!action) return returnTo
    const cid = String(campaignId)
    const lid = action.list_ids?.[0]
    const isListFirstOrder = action.entry_branch === 'assessment_list_first'
    if (isListFirstOrder) {
      // List already attached; go to the dialler.
      if (lid) {
        return `/campaigns/${cid}/phone/call/${lid}?action_id=${action.action_id}`
      }
      // Fallback to the list step if for some reason no list is linked.
      return `/campaigns/${cid}/phone/lists/new?action_id=${action.action_id}&pathway=assessment_only&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
    }
    // setup-first order — need a list next.
    return `/campaigns/${cid}/phone/lists/new?action_id=${action.action_id}&pathway=assessment_only&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
  }

  // Back navigation always retraces to whichever page sent us here —
  // that's the URL the caller wrote into ?returnTo=. Don't try to be
  // clever based on entry_branch; the previous component already knows
  // its own URL and encodes it on every link, so trusting returnTo
  // gives the correct retrace for both setup-first and list-first orders.
  function computeBackHref(): string {
    return returnTo
  }

  async function handleSaveAndContinue() {
    if (actionId == null) {
      toast.error('Missing phone-call action — restart from "Create Phone Call".')
      return
    }
    setIsSaving(true)
    try {
      const ids = Array.from(selectedIds)
      const { error } = await supabase
        .from('phone_call_actions')
        .update({ selected_assessment_ids: ids })
        .eq('action_id', actionId)
      if (error) throw error
      toast.success('Assessments saved')
      queryClient.invalidateQueries({ queryKey: ['phone-call-action', actionId] })
      queryClient.invalidateQueries({
        queryKey: ['phone-call-action-selected-assessments', actionId],
      })
      router.push(computeNextHref())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save assessments')
    } finally {
      setIsSaving(false)
    }
  }

  if (actionLoading || (!action && actionId != null)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading setup…</span>
      </div>
    )
  }

  const orderLabel = action?.entry_branch === 'assessment_list_first'
    ? 'Step 2 of 2'
    : 'Step 1 of 2'

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(computeBackHref())}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="text-xs text-muted-foreground uppercase tracking-wide">
          {orderLabel} · Assessment-only pathway
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            Pick assessments to rate during the call
          </CardTitle>
          <CardDescription>
            Each ticked assessment shows up as a rating row in the dialler so
            you can score every contact 1–5 (or leave unassessed). Newly
            created assessments persist to the campaign and stay available
            outside this session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
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

          {assessmentsLoading ? (
            <p className="text-sm text-muted-foreground">Loading assessments…</p>
          ) : assessments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No assessments defined for this campaign yet. Use the
              &ldquo;New assessment&rdquo; button above to create one.
            </p>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto rounded border bg-muted/30 p-2">
              {assessments.map((a) => (
                <label
                  key={a.activity_id}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-background rounded"
                >
                  <Checkbox
                    checked={selectedIds.has(a.activity_id)}
                    onCheckedChange={() => toggle(a.activity_id)}
                  />
                  <span>{a.title}</span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => router.push(computeBackHref())}
          disabled={isSaving}
        >
          Back
        </Button>
        <Button
          onClick={handleSaveAndContinue}
          disabled={isSaving || actionId == null}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Saving…
            </>
          ) : (
            'Save and continue'
          )}
        </Button>
      </div>

      {actionId != null && (
        <CreateAssessmentDialog
          campaignId={campaignId}
          open={addAssessmentOpen}
          onOpenChange={setAddAssessmentOpen}
          lockKind="assessment"
          onCreated={(activityId) => {
            queryClient.invalidateQueries({
              queryKey: ['campaign-assessment-options', campaignId],
            })
            if (typeof activityId === 'number') {
              setSelectedIds((prev) => {
                const next = new Set(prev)
                next.add(activityId)
                return next
              })
            }
          }}
        />
      )}
    </div>
  )
}
