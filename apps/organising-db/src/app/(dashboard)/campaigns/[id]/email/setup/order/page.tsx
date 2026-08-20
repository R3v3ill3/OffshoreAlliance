'use client'

/**
 * Email setup — order picker (now the only setup screen).
 *
 * The pathway picker has been removed: every email defaults to entry_branch
 * 'ai_first' / 'ai_list_first' (the user re-selects AI vs paste vs template
 * inside the body step itself, where the choice is actually meaningful).
 *
 * Cards are hot-select: clicking one immediately creates the draft and
 * navigates onward. No intermediate Continue button. Back returns to the
 * campaign page.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmailOrderPicker } from '@/components/email/orchestrator/EmailOrderPicker'
import {
  entryBranchForEmail,
  type EmailOrder,
} from '@/types/email-action'

export default function EmailSetupOrderPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const campaignId = params.id as string

  // Default pathway is 'ai' — the user re-chooses inside the body step.
  const pathway = 'ai' as const

  const [submitting, setSubmitting] = useState<EmailOrder | null>(null)

  const backHref = `/campaigns/${campaignId}`

  async function handleSelect(order: EmailOrder) {
    if (!user) {
      toast.error('You must be signed in to create an email draft.')
      return
    }
    setSubmitting(order)
    try {
      const entryBranch = entryBranchForEmail(pathway, order)

      // campaign_comms_drafts.stage_number is NOT NULL with CHECK BETWEEN 1
      // AND 6. Mirror the fire-email route's logic: pick the active stage
      // plan, else 1.
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

      const here = encodeURIComponent(
        `/campaigns/${campaignId}/email/setup/order`,
      )

      const firstStepHref =
        order === 'setup_first'
          ? `/campaigns/${campaignId}/email/wizard?draft_id=${draftId}&entry_branch=${entryBranch}&returnTo=${here}`
          : `/campaigns/${campaignId}/email/lists/new?draft_id=${draftId}&entry_branch=${entryBranch}&returnTo=${here}`

      router.push(firstStepHref)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Failed to create email draft: ${err.message}`
          : 'Failed to create email draft',
      )
      setSubmitting(null)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(backHref)}
          disabled={submitting != null}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Create email</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Where do you want to start?
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/campaigns/${campaignId}/email/import`}>
            <Upload className="h-4 w-4 mr-1" />
            Import recipients
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order</CardTitle>
          <CardDescription>
            Click a card to begin. You can pick AI, template, or paste once
            you reach the body editor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailOrderPicker
            onSelect={handleSelect}
            onBack={() => router.push(backHref)}
            submitting={submitting}
          />
        </CardContent>
      </Card>
    </div>
  )
}
