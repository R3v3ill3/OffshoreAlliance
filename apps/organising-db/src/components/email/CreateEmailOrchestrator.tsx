'use client'

/**
 * CreateEmailOrchestrator — entry-point button for the campaign-scoped
 * email setup flow.
 *
 * Mirrors CreatePhoneCallOrchestrator. Routes to /campaigns/{id}/email/setup
 * which renders the EmailPathwayPicker. From there:
 *   1. setup → /setup/order → /email/wizard (setup-first)
 *                            or /email/lists/new → /email/wizard (list-first)
 *   2. setup with ?draft_id=… (build-list fire) skips the OrderPicker and
 *      hands the user a list-attached wizard.
 */

import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  campaignId: number | string
  trigger?: React.ReactNode
  /** Legacy prop slot for parity with CreatePhoneCallOrchestrator; ignored. */
  defaultOpen?: boolean
}

export function CreateEmailOrchestrator({ campaignId, trigger }: Props) {
  const href = `/campaigns/${campaignId}/email/setup`

  if (trigger) {
    return <Link href={href}>{trigger}</Link>
  }

  return (
    <Button asChild>
      <Link href={href}>
        <Mail className="h-4 w-4 mr-2" />
        Create Email
      </Link>
    </Button>
  )
}
