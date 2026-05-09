/**
 * Bidirectional mapping between wizard audience-tag chips and the
 * versioned audience_descriptor stored on call_scripts (and reflected
 * in call_lists.source_filters).
 *
 * Phase E — UX coherence: audience descriptor.
 */

export type AudienceDescriptorV1 = {
  version: 1
  filters: {
    membership?: 'member' | 'member_pending' | 'non_member'
    employer_id?: number
    worksite_id?: number
    roles?: string[]
    occupations?: string[]
    assessment?: { activity_id: number; rating_buckets: string[] }
    cumulative_rating?: { min?: number; max?: number; include_unrated?: boolean }
  }
  narrative?: {
    tone?: string[]
    audience_segments?: string[]
    engagement_intensity?: 'low' | 'medium' | 'high'
  }
  priority_order?: Record<string, unknown> | null
}

export type AudienceDescriptor = AudienceDescriptorV1

/** Well-known audience segment tag keys used in the wizard Step 2 chips. */
const SEGMENT_TO_MEMBERSHIP: Record<string, AudienceDescriptorV1['filters']['membership']> = {
  existing_members: 'member',
  member_pending: 'member_pending',
  lapsed_members: 'non_member',
  non_members_known: 'non_member',
  non_members_unknown: 'non_member',
}

const SEGMENT_TO_ROLES: Record<string, string[]> = {
  delegates: ['delegate'],
  hsrs: ['hsr'],
  bargaining_reps: ['bargaining_rep'],
}

/**
 * Translate wizard audience-segment tags (strings from the chip picker) into
 * the `filters` section of an AudienceDescriptorV1.
 */
export function audienceTagsToFilters(
  tags: string[],
  extras?: {
    tone?: string[]
    engagementIntensity?: 'low' | 'medium' | 'high'
    employerId?: number
    worksiteId?: number
  }
): AudienceDescriptorV1 {
  const filters: AudienceDescriptorV1['filters'] = {}

  // Membership resolution — prefer the most specific signal
  const memberships = tags
    .map((t) => SEGMENT_TO_MEMBERSHIP[t])
    .filter(Boolean) as AudienceDescriptorV1['filters']['membership'][]

  if (memberships.length > 0) {
    // If mixed, use the first; the UI should prevent contradictory selections
    filters.membership = memberships[0]
  }

  // Role resolution
  const roles = tags.flatMap((t) => SEGMENT_TO_ROLES[t] ?? [])
  if (roles.length > 0) filters.roles = [...new Set(roles)]

  if (extras?.employerId) filters.employer_id = extras.employerId
  if (extras?.worksiteId) filters.worksite_id = extras.worksiteId

  const narrative: AudienceDescriptorV1['narrative'] = {
    audience_segments: tags,
    tone: extras?.tone?.length ? extras.tone : undefined,
    engagement_intensity: extras?.engagementIntensity,
  }

  return { version: 1, filters, narrative }
}

/**
 * Translate source_filters (from call_lists) or descriptor.filters back into
 * audience-segment tag strings for wizard Step 2 pre-population.
 */
export function filtersToAudienceTags(
  filters: AudienceDescriptorV1['filters'] | Record<string, unknown>
): string[] {
  const tags: string[] = []
  const f = filters as AudienceDescriptorV1['filters']

  if (f.membership === 'member') tags.push('existing_members')
  if (f.membership === 'member_pending') tags.push('member_pending')
  if (f.membership === 'non_member') {
    // Best-effort: without extra context we emit the broader label
    tags.push('non_members_known')
  }

  const roles = f.roles ?? []
  if (roles.includes('delegate')) tags.push('delegates')
  if (roles.includes('hsr')) tags.push('hsrs')
  if (roles.includes('bargaining_rep')) tags.push('bargaining_reps')

  return [...new Set(tags)]
}

/** Extract narrative tone tags from a stored descriptor (for Step 2 pre-fill). */
export function descriptorToTone(descriptor: AudienceDescriptor | null | undefined): string[] {
  return descriptor?.narrative?.tone ?? []
}

/** Extract engagement intensity from a stored descriptor. */
export function descriptorToEngagementIntensity(
  descriptor: AudienceDescriptor | null | undefined
): 'low' | 'medium' | 'high' | undefined {
  return descriptor?.narrative?.engagement_intensity
}
