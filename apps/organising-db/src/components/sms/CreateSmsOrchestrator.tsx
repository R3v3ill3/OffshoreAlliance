'use client'

/**
 * CreateSmsOrchestrator — entry-point button for the SMS setup flow
 * (Phase 8, brief §A decision 2).
 *
 * A byte-for-byte structural clone of CreatePhoneCallOrchestrator /
 * CreateEmailOrchestrator: a Link wrapper, no dialog. Routes to the
 * pathway picker at /campaigns/[id]/sms/setup.
 */

import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  campaignId: number | string
  trigger?: React.ReactNode
  /** Legacy prop slot for parity with CreatePhoneCallOrchestrator; ignored. */
  defaultOpen?: boolean
}

export function CreateSmsOrchestrator({ campaignId, trigger }: Props) {
  const href = `/campaigns/${campaignId}/sms/setup`

  if (trigger) {
    return <Link href={href}>{trigger}</Link>
  }

  return (
    <Button asChild>
      <Link href={href}>
        <MessageSquare className="h-4 w-4 mr-2" />
        Create SMS
      </Link>
    </Button>
  )
}
