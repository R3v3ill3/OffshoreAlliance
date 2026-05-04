'use client'

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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { BackgroundInfoStep, type BackgroundInfoValue } from './orchestrator/BackgroundInfoStep'
import { BranchPicker } from './orchestrator/BranchPicker'
import type { EntryBranch, PhoneCallAction } from '@/types/phone-call-action'

type Step = 'background_info' | 'branch_picker'

const INITIAL_BACKGROUND: BackgroundInfoValue = {
  assessmentId: null,
  hasVariations: false,
  variationCount: 1,
  variationDimension: null,
}

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
  const [step, setStep] = useState<Step>('background_info')
  const [backgroundInfo, setBackgroundInfo] = useState<BackgroundInfoValue>(INITIAL_BACKGROUND)
  const [selectedBranch, setSelectedBranch] = useState<EntryBranch | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setStep('background_info')
      setBackgroundInfo(INITIAL_BACKGROUND)
      setSelectedBranch(null)
    }
  }

  async function handleConfirm() {
    if (!selectedBranch || !user) return
    setIsSubmitting(true)

    try {
      const payload = {
        campaign_id: Number(campaignId),
        created_by: user.id,
        assessment_id: backgroundInfo.assessmentId ?? null,
        variation_count: backgroundInfo.hasVariations ? backgroundInfo.variationCount : 1,
        variation_dimension: backgroundInfo.hasVariations
          ? backgroundInfo.variationDimension
          : 'none',
        entry_branch: selectedBranch,
        status: 'in_progress',
      }

      const { data, error } = await supabase
        .from('phone_call_actions' as never)
        .insert(payload as never)
        .select('action_id')
        .single()

      if (error) throw error

      const actionId = (data as Pick<PhoneCallAction, 'action_id'>).action_id

      setOpen(false)
      toast.success('Phone call action created')

      if (selectedBranch === 'script_first') {
        router.push(
          `/campaigns/phone-wizard?campaign_id=${campaignId}&action_id=${actionId}`
        )
      } else {
        router.push(
          `/campaigns/${campaignId}/phone/lists/new?action_id=${actionId}`
        )
      }
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
            {step === 'background_info' ? 'Phone Call Setup' : 'How do you want to start?'}
          </DialogTitle>
        </DialogHeader>

        {step === 'background_info' && (
          <BackgroundInfoStep
            campaignId={campaignId}
            value={backgroundInfo}
            onChange={setBackgroundInfo}
            onNext={() => setStep('branch_picker')}
            onCancel={() => setOpen(false)}
          />
        )}

        {step === 'branch_picker' && (
          <BranchPicker
            value={selectedBranch}
            onChange={setSelectedBranch}
            onConfirm={handleConfirm}
            onBack={() => setStep('background_info')}
            isSubmitting={isSubmitting}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
