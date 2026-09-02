/**
 * The SMS tools hub moved to /sms (it is org-wide, not a campaigns
 * sub-page). Old links and bookmarks land here; carry the scope across.
 */
import { redirect } from 'next/navigation'

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
  redirect(scope ? `/sms?scope=${encodeURIComponent(scope)}` : '/sms')
}
