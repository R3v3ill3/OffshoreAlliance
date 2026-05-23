'use client'

/**
 * CreateEmailOrchestrator — entry-point button for the campaign-scoped
 * email setup flow.
 *
 * Mirrors CreatePhoneCallOrchestrator. Routes straight to the (hot-select)
 * order picker. From there:
 *   • Draft email first → /email/wizard
 *   • Build list first  → /email/lists/new → /email/wizard
 *
 * The wall-chart Build List fire path bypasses this entry entirely and
 * lands the user directly in /email/wizard with the list already attached.
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
  const href = `/campaigns/${campaignId}/email/setup/order`

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
