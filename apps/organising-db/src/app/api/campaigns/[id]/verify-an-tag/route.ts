import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ActionNetworkClient } from '@/lib/api/action-network'

function getAnClient(): ActionNetworkClient {
  const apiKey = process.env.ACTION_NETWORK_API_KEY
  if (!apiKey || apiKey === 'your-action-network-key-here') {
    throw new Error('Action Network API key not configured')
  }
  return new ActionNetworkClient({ apiKey })
}

function parseSampleAnIds(raw: string | null): string[] {
  if (!raw) return []
  return [...new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))]
}

function personTaggingsIncludeTag(
  response: Awaited<ReturnType<ActionNetworkClient['getPersonTags']>>,
  tagId: string,
): boolean {
  const taggings = (response._embedded?.['osdi:taggings'] ?? []) as Array<
    Record<string, unknown>
  >
  return taggings.some((tagging) => {
    const links = (tagging as Record<string, Record<string, { href: string }>>)?._links
    return links?.['osdi:tag']?.href?.endsWith(`/tags/${tagId}`) ?? false
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const campaignId = Number(id)
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 })
    }

    const tagId = request.nextUrl.searchParams.get('tagId')?.trim()
    if (!tagId) {
      return NextResponse.json({ error: 'Missing tagId' }, { status: 400 })
    }

    const sampleAnIds = parseSampleAnIds(
      request.nextUrl.searchParams.get('sampleAnIds'),
    ).slice(0, 3)
    const anClient = getAnClient()

    const [detailed, tagDetail, personTagResults] = await Promise.all([
      anClient.getTaggingsDetailed(tagId),
      anClient.getTag(tagId).catch(() => null),
      Promise.allSettled(sampleAnIds.map((personId) => anClient.getPersonTags(personId))),
    ])

    const matchedInTag = sampleAnIds.filter((personId) =>
      detailed.person_hrefs.some((href) => href.endsWith(`/people/${personId}`)),
    ).length
    const matchedPerPerson = personTagResults.filter((result) =>
      result.status === 'fulfilled'
        ? personTaggingsIncludeTag(result.value, tagId)
        : false,
    ).length

    return NextResponse.json({
      success: true,
      tag_total: detailed.total,
      expected_total: sampleAnIds.length,
      matched_in_tag: matchedInTag,
      matched_per_person: matchedPerPerson,
      consistent: matchedPerPerson === sampleAnIds.length,
      tag_browser_url: tagDetail?.browser_url ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
