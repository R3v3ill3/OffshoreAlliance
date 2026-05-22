'use client'

/**
 * Email setup — step 2 of 2 (Order picker).
 *
 * Mirrors /campaigns/[id]/phone/setup/order/page.tsx.
 *
 * Reads the chosen pathway from ?pathway=. On Confirm:
 *   1. Insert a campaign_comms_drafts row (status='draft', platform='email',
 *      entry_branch derived from (pathway, order)).
 *   2. Resolve the first pathway component URL.
 *   3. Navigate with returnTo so Back retraces this page.
 */

import { useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmailOrderPicker } from '@/components/email/orchestrator/EmailOrderPicker'
import {
  entryBranchForEmail,
  type EmailOrder,
  type EmailPathway,
} from '@/types/email-action'

function isEmailPathway(value: string | null): value is EmailPathway {
  return value === 'ai' || value === 'paste'
}

export default function EmailSetupOrderPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const supabase = createClient()
  const campaignId = params.id as string

  const pathway = useMemo<EmailPathway | null>(() => {
    const raw = searchParams.get('pathway')
    return isEmailPathway(raw) ? raw : null
  }, [searchParams])

  const [order, setOrder] = useState<EmailOrder | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const backHref = `/campaigns/${campaignId}/email/setup`

  async function handleConfirm() {
    if (!pathway || !order) return
    if (!user) {
      toast.error('You must be signed in to create an email draft.')
      return
    }
    setIsSubmitting(true)
    try {
      const entryBranch = entryBranchForEmail(pathway, order)

      // campaign_comms_drafts.stage_number is NOT NULL with CHECK BETWEEN 1
      // AND 6 (see migration 20260409100000_comms_draft_system.sql). Mirror
      // the fire-email route's logic: pick the active stage_plan, else 1.
      const { data: stagePlans, error: stageErr } = await supabase
        .from('campaign_stage_plans')
        .select('stage_number, status')
        .eq('campaign_id', Number(campaignId))
      if (stageErr) throw stageErr
      const activeStage = stagePlans?.find((s) => s.status === 'active')
      const stageNumber = activeStage?.stage_number ?? 1

      const { data, error } = await supabase
        .from('campaign_comms_drafts')
        .insert({
          campaign_id: Number(campaignId),
          stage_number: stageNumber,
          platform: 'email',
          status: 'draft',
          subject: '',
          body: '',
          entry_branch: entryBranch,
          created_by: user.id,
        })
        .select('draft_id')
        .single()
      if (error) throw error
      const draftId = data!.draft_id

      toast.success('Email draft created')

      const here = encodeURIComponent(
        `/campaigns/${campaignId}/email/setup/order?pathway=${pathway}`,
      )

      const firstStepHref =
        order === 'setup_first'
          ? `/campaigns/${campaignId}/email/wizard?draft_id=${draftId}&entry_branch=${entryBranch}&pathway=${pathway}&returnTo=${here}`
          : `/campaigns/${campaignId}/email/lists/new?draft_id=${draftId}&entry_branch=${entryBranch}&pathway=${pathway}&returnTo=${here}`

      router.push(firstStepHref)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Failed to create email draft: ${err.message}`
          : 'Failed to create email draft',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!pathway) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No pathway selected. Use the Back button or restart from
            &ldquo;Create Email&rdquo;.
          </CardContent>
        </Card>
      </div>
    )
  }

  const pathwayLabel = pathway === 'ai' ? 'AI-assisted' : 'Paste / write'

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Choose where to start</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Step 2 of 2 · {pathwayLabel}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order</CardTitle>
          <CardDescription>
            Choose which component to set up first. Either order ends at the same send step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailOrderPicker
            pathway={pathway}
            value={order}
            onChange={setOrder}
            onConfirm={handleConfirm}
            onBack={() => router.push(backHref)}
            isSubmitting={isSubmitting}
          />
        </CardContent>
      </Card>
    </div>
  )
}
