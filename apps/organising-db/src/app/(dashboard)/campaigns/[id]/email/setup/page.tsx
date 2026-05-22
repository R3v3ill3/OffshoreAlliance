'use client'

/**
 * Email setup — step 1 (Pathway picker).
 *
 * Mirrors /campaigns/[id]/phone/setup/page.tsx.
 *
 * Two entry modes:
 *
 * 1. Fresh entry (no draft_id): step 1 of 2 — pick AI vs paste, then go
 *    to /email/setup/order to pick the order, which creates the
 *    campaign_comms_drafts row.
 *
 * 2. Build-list entry (draft_id present and the draft has email_list_id):
 *    the wall-chart Build List Fire flow already created the draft +
 *    email_list with entry_branch='build_list'. Here we just need the
 *    user to pick a pathway; we then update entry_branch to the
 *    list-first variant and route straight to the email wizard,
 *    skipping the OrderPicker.
 *
 * In both modes Back returns to the campaign page.
 */

import { useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ListChecks, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmailPathwayPicker } from '@/components/email/orchestrator/EmailPathwayPicker'
import { entryBranchForEmail, type EmailPathway } from '@/types/email-action'

export default function EmailSetupPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const campaignId = params.id as string

  const draftId = useMemo(() => {
    const raw = searchParams.get('draft_id')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [searchParams])

  const [pathway, setPathway] = useState<EmailPathway | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: draft, isLoading: draftLoading } = useQuery({
    queryKey: ['email-draft-summary', draftId],
    enabled: draftId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_comms_drafts')
        .select('draft_id, entry_branch, email_list_id')
        .eq('draft_id', draftId!)
        .maybeSingle()
      if (error) throw error
      return data as {
        draft_id: number
        entry_branch: string | null
        email_list_id: number | null
      } | null
    },
  })

  const attachedListId = draft?.email_list_id ?? null
  const isBuildListEntry = draftId != null && attachedListId != null

  const backHref = `/campaigns/${campaignId}`

  async function handleNext() {
    if (!pathway) return

    if (!isBuildListEntry) {
      router.push(`/campaigns/${campaignId}/email/setup/order?pathway=${pathway}`)
      return
    }

    setIsSubmitting(true)
    try {
      const newBranch = entryBranchForEmail(pathway, 'list_first')
      const { error } = await supabase
        .from('campaign_comms_drafts')
        .update({ entry_branch: newBranch })
        .eq('draft_id', draftId!)
      if (error) throw error

      const here = encodeURIComponent(
        `/campaigns/${campaignId}/email/setup?draft_id=${draftId}`,
      )
      router.push(
        `/campaigns/${campaignId}/email/wizard?draft_id=${draftId}&entry_branch=${newBranch}&pathway=${pathway}&returnTo=${here}`,
      )
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
          <h2 className="text-lg font-semibold">Create email</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {isBuildListEntry ? 'Step 1 of 1 · Pathway' : 'Step 1 of 2 · Pathway'}
          </p>
        </div>
      </div>

      {isBuildListEntry && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <ListChecks className="h-4 w-4 flex-shrink-0" />
          <span>
            Email list <strong>#{attachedListId}</strong> is already attached
            (from Build List). Pick a pathway below to continue.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pick a pathway</CardTitle>
          <CardDescription>
            {isBuildListEntry
              ? 'Choose whether the AI drafts a starting body or you paste/write it yourself. You can switch later from inside the editor.'
              : 'Pick how the email body is created. You can switch between AI and manual editing later inside the editor.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {draftLoading && draftId != null ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading draft…</span>
            </div>
          ) : (
            <EmailPathwayPicker
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
