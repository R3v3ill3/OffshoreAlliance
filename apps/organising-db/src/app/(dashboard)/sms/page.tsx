/**
 * The SMS hub became the Actions hub at /actions — it lists email
 * sends and call lists alongside SMS. Old links and bookmarks land
 * here; every search param is carried across, so `?scope=`, `?open=`
 * and `?standalone=` all still open what they used to.
 *
 * `/sms/new`, `/sms/inbox` and `/sms/numbers` are separate route
 * segments and are untouched by this page.
 */
import { redirect } from 'next/navigation'
import { ACTIONS_HUB_PATH } from '@/lib/actions/hub-path'

export default async function SmsHubRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first != null) qs.set(key, first)
  }
  const query = qs.toString()
  redirect(query ? `${ACTIONS_HUB_PATH}?${query}` : ACTIONS_HUB_PATH)
}
