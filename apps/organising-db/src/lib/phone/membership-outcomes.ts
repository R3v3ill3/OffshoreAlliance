import { isWorkerMemberLike } from '@/lib/campaign/constants'
import type { CallOutcomeDefinition } from '@/types/planner-types'

function payload(d: CallOutcomeDefinition): Record<string, unknown> | null {
  return d.side_effect_payload as Record<string, unknown> | null
}

/** Recruit-others prompt is stored on definitions with side_effect none + payload.phone_ask */
export function isRecruitOthersOutcome(d: CallOutcomeDefinition): boolean {
  return payload(d)?.phone_ask === 'recruit_others'
}

/** Join-union prompt: pending side effect, excluding any mis-tagged rows */
export function isJoinUnionOutcome(d: CallOutcomeDefinition): boolean {
  if (d.side_effect !== 'set_membership_pending') return false
  if (payload(d)?.phone_ask === 'recruit_others') return false
  return true
}

/**
 * Split definitions for the call UI: member-like workers see the recruit prompt;
 * others see the join-union (pending) prompt. Remaining definitions stay in "other".
 */
export function partitionCallOutcomeDefinitions(
  definitions: CallOutcomeDefinition[],
  args: { unionMembershipTypeName: string | null | undefined; memberRoleName?: string | null | undefined }
) {
  const memberLike = isWorkerMemberLike({
    unionMembershipTypeName: args.unionMembershipTypeName,
    memberRoleName: args.memberRoleName ?? undefined,
  })

  const membershipHeroOutcomes = definitions.filter((o) =>
    memberLike ? isRecruitOthersOutcome(o) : isJoinUnionOutcome(o)
  )

  const heroIds = new Set(membershipHeroOutcomes.map((o) => o.outcome_id))
  const otherOutcomes = definitions.filter((o) => !heroIds.has(o.outcome_id))

  return {
    membershipHeroOutcomes,
    otherOutcomes,
    showingRecruitPrompt: memberLike,
  }
}
