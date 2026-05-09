'use client'

/**
 * @deprecated Phase B: The standalone call session route is retired.
 *
 * All call lists now have a campaign_id (orphan rows were migrated into
 * the "OA Membership Outreach" standing campaign). This page redirects
 * to the canonical campaign-scoped call session at
 * /campaigns/[campaignId]/phone/call/[listId].
 */

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function StandaloneCallSessionRedirect() {
  const params = useParams()
  const router = useRouter()
  const listId = Number(params.listId)

  useEffect(() => {
    async function redirect() {
      const supabase = createClient()
      const { data } = await supabase
        .from('call_lists')
        .select('campaign_id')
        .eq('list_id', listId)
        .single()

      if (data?.campaign_id) {
        router.replace(`/campaigns/${data.campaign_id}/phone/call/${listId}`)
      } else {
        router.replace('/campaigns/phone-wizard')
      }
    }
    if (Number.isFinite(listId)) void redirect()
  }, [listId, router])

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-muted-foreground text-sm">Redirecting to call session…</p>
    </div>
  )
}
