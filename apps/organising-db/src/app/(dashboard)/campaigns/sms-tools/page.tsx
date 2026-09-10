/**
 * The SMS tools hub moved to the Actions hub at /actions (it is
 * org-wide, not a campaigns sub-page). Old links and bookmarks land
 * here; carry the scope across.
 */
import { redirect } from 'next/navigation'
import { ACTIONS_HUB_PATH } from '@/lib/actions/hub-path'

export default async function SmsToolsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const standalone = first(params.standalone) === '1'
  const campaignId = first(params.campaign_id)
  const scope = standalone ? 'standalone' : campaignId ? campaignId : null
  redirect(
    scope ? `${ACTIONS_HUB_PATH}?scope=${encodeURIComponent(scope)}` : ACTIONS_HUB_PATH,
  )
}
