'use client'

/**
 * CreatePhoneCallOrchestrator — entry-point button for the phone-call
 * setup flow.
 *
 * Previously this opened a 2-step dialog. The dialog has been replaced
 * with full-page routes (/phone/setup → /phone/setup/order) so every
 * step of the flow lives in browser history and Back retraces step-by-
 * step instead of dumping the user back at the campaign page.
 *
 * The component keeps its existing name + props (campaignId, trigger,
 * defaultOpen) for backwards compatibility with the campaign page that
 * imports it. `trigger` lets callers override the default button; the
 * legacy `defaultOpen` prop is ignored — the flow is page-based now,
 * so there is no dialog to pre-open.
 */

import Link from 'next/link'
import { Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  campaignId: number | string
  trigger?: React.ReactNode
  /** Legacy prop from the dialog era; ignored. */
  defaultOpen?: boolean
}

export function CreatePhoneCallOrchestrator({ campaignId, trigger }: Props) {
  const href = `/campaigns/${campaignId}/phone/setup`

  if (trigger) {
    return <Link href={href}>{trigger}</Link>
  }

  return (
    <Button asChild>
      <Link href={href}>
        <Phone className="h-4 w-4 mr-2" />
        Create Phone Call
      </Link>
    </Button>
  )
}
