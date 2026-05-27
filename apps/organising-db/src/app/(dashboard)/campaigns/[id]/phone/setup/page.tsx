'use client'

/**
 * Phone-call setup — step 1 (Pathway picker).
 *
 * Two entry modes:
 *
 * 1. Fresh entry (no action_id): step 1 of 2 — pick pathway, then go to
 *    /phone/setup/order to pick the order, which creates the
 *    phone_call_actions row.
 *
 * 2. Build-list entry (action_id present): the wall-chart Build List
 *    Fire flow already created the phone_call_actions row with
 *    entry_branch='build_list' and the list attached. Here we just need
 *    the user to pick a pathway; we then update entry_branch to match
 *    (list-first variant of the chosen pathway) and route straight to
 *    the setup component, skipping the OrderPicker since the list is
 *    already done.
 *
 * In both modes Back returns to the campaign page (the previous step).
 */

import { useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ListChecks, Loader2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PathwayPicker } from '@/components/phone/orchestrator/PathwayPicker'
import { IssueLinkDialog, type IssueLinkResult } from '@/components/share/issue-link-dialog'
import { IssuedLinkResultDialog } from '@/components/share/issued-link-result-dialog'
import type { Pathway } from '@/types/phone-call-action'

export default function PhoneSetupPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const campaignId = params.id as string

  const actionId = useMemo(() => {
    const raw = searchParams.get('action_id')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [searchParams])

  const [pathway, setPathway] = useState<Pathway | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareIssueResult, setShareIssueResult] = useState<IssueLinkResult | null>(null)

  // When action_id is present (build-list entry), fetch the row so we
  // can show "list already attached" and update its entry_branch later.
  const { data: action, isLoading: actionLoading } = useQuery({
    queryKey: ['phone-call-action-summary', actionId],
    enabled: actionId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phone_call_actions')
        .select('action_id, entry_branch, list_ids')
        .eq('action_id', actionId!)
        .maybeSingle()
      if (error) throw error
      return data as {
        action_id: number
        entry_branch: string
        list_ids: number[] | null
      } | null
    },
  })

  const attachedListId = action?.list_ids?.[0] ?? null
  const isBuildListEntry = actionId != null && attachedListId != null

  const backHref = `/campaigns/${campaignId}`

  async function handleNext() {
    if (!pathway) return

    // Fresh entry: hand off to the order picker as before.
    if (!isBuildListEntry) {
      router.push(`/campaigns/${campaignId}/phone/setup/order?pathway=${pathway}`)
      return
    }

    // Build-list entry: the list is already attached. Update the
    // action's entry_branch so the rest of the system treats it as a
    // list-first variant of the chosen pathway, then jump straight to
    // the setup component (assessment-setup or phone-wizard).
    setIsSubmitting(true)
    try {
      const newEntryBranch =
        pathway === 'script' ? 'list_first' : 'assessment_list_first'

      const { error } = await supabase
        .from('phone_call_actions')
        .update({ entry_branch: newEntryBranch })
        .eq('action_id', actionId!)
      if (error) throw error

      // returnTo points back to this page so the setup component's Back
      // retraces a real route (this pathway-picker → campaign page).
      const here = encodeURIComponent(
        `/campaigns/${campaignId}/phone/setup?action_id=${actionId}`,
      )

      const next =
        pathway === 'script'
          ? `/campaigns/phone-wizard?campaign_id=${campaignId}&action_id=${actionId}&returnTo=${here}`
          : `/campaigns/${campaignId}/phone/assessment-setup?action_id=${actionId}&returnTo=${here}`
      router.push(next)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Failed to set pathway: ${err.message}`
          : 'Failed to set pathway',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Create phone call</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {isBuildListEntry ? 'Step 1 of 1 · Pathway' : 'Step 1 of 2 · Pathway'}
          </p>
        </div>
      </div>

      {isBuildListEntry && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-800">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 flex-shrink-0" />
            <span>
              Call list <strong>#{attachedListId}</strong> is already attached
              (from Build List). Pick a pathway below to continue.
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-3.5 w-3.5 mr-1" />
              Share for mobile calling now
            </Button>
            <span className="text-xs text-blue-600">
              You can share immediately and set up a script in parallel.
            </span>
          </div>
        </div>
      )}

      <IssueLinkDialog
        title="Share for mobile calling"
        target={
          shareOpen && attachedListId != null
            ? {
                title: `Call list #${attachedListId}`,
                contextLabel: 'For call list',
                endpoint: `/api/campaigns/${campaignId}/call-lists/${attachedListId}/share-token`,
              }
            : null
        }
        passwordHelp="Share this link with your callers — each person picks their name on sign-in and the system prevents anyone calling the same contact twice."
        onClose={() => setShareOpen(false)}
        onIssued={(result) => {
          setShareOpen(false)
          setShareIssueResult(result)
        }}
      />

      <IssuedLinkResultDialog
        title="Mobile-call link ready"
        result={shareIssueResult}
        onClose={() => setShareIssueResult(null)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Pick a pathway</CardTitle>
          <CardDescription>
            {isBuildListEntry
              ? 'Choose whether this call uses a full script or only rates assessments. You can change this later via Edit setup.'
              : 'Pick the kind of phone call you want to set up. You can switch via Edit setup later if you change your mind.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {actionLoading && actionId != null ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading session…
              </span>
            </div>
          ) : (
            <PathwayPicker
              value={pathway}
              onChange={setPathway}
              onNext={handleNext}
              onCancel={() => router.push(backHref)}
              isSubmitting={isSubmitting}
              nextLabel={isBuildListEntry ? 'Continue' : 'Next'}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
