/**
 * @deprecated Phase H: The standalone call session route is retired.
 *
 * Server-side redirect to the canonical campaign-scoped call session at
 * /campaigns/[campaignId]/phone/call/[listId].
 *
 * The campaign_id is derived from call_lists.campaign_id.
 * If the list cannot be found, redirects to /campaigns.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ listId: string }>
}

export default async function StandaloneCallSessionRedirect({ params }: Props) {
  const { listId } = await params
  const numericListId = parseInt(listId, 10)

  if (!Number.isFinite(numericListId)) {
    redirect('/campaigns')
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('call_lists')
    .select('campaign_id')
    .eq('list_id', numericListId)
    .single()

  if (data?.campaign_id) {
    redirect(`/campaigns/${data.campaign_id}/phone/call/${numericListId}`)
  }

  redirect('/campaigns')
}
