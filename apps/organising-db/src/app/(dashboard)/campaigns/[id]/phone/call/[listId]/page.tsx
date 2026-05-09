'use client'

/**
 * Canonical campaign call-session route.
 *
 * Thin wrapper — all logic lives in the shared
 * `@/components/phone/CallSessionPage` component (Phase H).
 */

import { useParams } from 'next/navigation'
import { CallSessionPage } from '@/components/phone/CallSessionPage'

export default function CampaignCallSessionPage() {
  const params = useParams()
  return (
    <CallSessionPage
      campaignId={params.id as string}
      listId={params.listId as string}
    />
  )
}
