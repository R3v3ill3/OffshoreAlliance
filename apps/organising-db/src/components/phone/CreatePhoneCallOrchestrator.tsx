'use client'

/**
 * CreatePhoneCallOrchestrator — two-step dialog router.
 *
 * Step 1: PathwayPicker — Script + ratings, OR Assessment-only.
 * Step 2: OrderPicker  — set up first, OR build the list first.
 *
 * On confirm we insert a `phone_call_actions` row (status='in_progress')
 * carrying the resolved entry_branch, then navigate to whichever pathway
 * component matches the chosen order. The two components per pathway
 * are:
 *   • Script pathway:        Script wizard ←→ List step
 *   • Assessment-only path:  Assessment setup ←→ List step
 *
 * The action row is closed ('completed') once both components are linked
 * to it, which happens in the trailing component for each pathway.
 *
 * Do NOT confuse with `PhoneWizardSteps`, the full 6-step phone script
 * wizard. This dialog only decides the entry pathway + order.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PathwayPicker } from './orchestrator/PathwayPicker'
import { OrderPicker } from './orchestrator/OrderPicker'
import { entryBranchFor, type Order, type Pathway } from '@/types/phone-call-action'

type Step = 'pathway' | 'order'

interface Props {
  campaignId: number | string
  trigger?: React.ReactNode
  defaultOpen?: boolean
}

export function CreatePhoneCallOrchestrator({ campaignId, trigger, defaultOpen }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()

  const [open, setOpen] = useState(defaultOpen ?? false)
  const [step, setStep] = useState<Step>('pathway')
  const [pathway, setPathway] = useState<Pathway | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setStep('pathway')
      setPathway(null)
      setOrder(null)
    }
  }

  async function handleConfirm() {
    if (!pathway || !order || !user) return
    setIsSubmitting(true)

    try {
      const entryBranch = entryBranchFor(pathway, order)

      const payload = {
        campaign_id: Number(campaignId),
        created_by: user.id,
        // Variation knobs default to "none" — the script wizard collects
        // these on its own when the user is in the script pathway.
        variation_count: 1,
        variation_dimension: 'none' as const,
        entry_branch: entryBranch,
        status: 'in_progress' as const,
        selected_assessment_ids: [] as number[],
      }

      const { data, error } = await supabase
        .from('phone_call_actions')
        .insert(payload)
        .select('action_id')
        .single()

      if (error) throw error
      const actionId = data!.action_id

      setOpen(false)
      toast.success('Phone call action created')

      // returnTo is set so each component's Back button retraces to the
      // previous step in the chosen order (or to the campaign page if the
      // user is on the first component).
      const cid = String(campaignId)
      const campaignHref = `/campaigns/${cid}`
      const encodedCampaign = encodeURIComponent(campaignHref)

      let firstStepHref = ''
      if (pathway === 'script') {
        firstStepHref =
          order === 'setup_first'
            ? `/campaigns/phone-wizard?campaign_id=${cid}&action_id=${actionId}&returnTo=${encodedCampaign}`
            : `/campaigns/${cid}/phone/lists/new?action_id=${actionId}&returnTo=${encodedCampaign}`
      } else {
        firstStepHref =
          order === 'setup_first'
            ? `/campaigns/${cid}/phone/assessment-setup?action_id=${actionId}&returnTo=${encodedCampaign}`
            : `/campaigns/${cid}/phone/lists/new?action_id=${actionId}&pathway=assessment_only&returnTo=${encodedCampaign}`
      }

      router.push(firstStepHref)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      toast.error(`Failed to create phone call action: ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const defaultTrigger = (
    <Button>
      <Phone className="h-4 w-4 mr-2" />
      Create Phone Call
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'pathway' ? 'Create phone call' : 'Choose where to start'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Set up a phone call action for this campaign.
          </DialogDescription>
        </DialogHeader>

        {step === 'pathway' && (
          <PathwayPicker
            value={pathway}
            onChange={setPathway}
            onNext={() => setStep('order')}
            onCancel={() => handleOpenChange(false)}
          />
        )}

        {step === 'order' && pathway && (
          <OrderPicker
            pathway={pathway}
            value={order}
            onChange={setOrder}
            onConfirm={handleConfirm}
            onBack={() => setStep('pathway')}
            isSubmitting={isSubmitting}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
