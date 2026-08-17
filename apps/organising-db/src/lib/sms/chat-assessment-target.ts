/**
 * Which campaign's assessments a chat conversation writes against
 * (Phase 10, decision 6).
 *
 * Straightforward for a campaign chat: the conversation's campaign.
 * Not straightforward for a STANDALONE chat — those run on hidden
 * `is_sms_episode` campaigns (see lib/sms/sms-episode.ts), which carry
 * no assessment activities and are excluded from every campaign picker
 * by excludeSmsEpisodes(). Recording a rating there would produce data
 * that never surfaces on any wall chart.
 *
 * So an episode-backed board asks the organiser to nominate a real
 * campaign once, stored on `sms_lists.assessment_campaign_id`. Until
 * they do, the pinned assessment renders its remedy instead of chips.
 *
 * Unit tested in __tests__/chat-assessment-target.test.ts.
 */

export type SmsAssessmentTarget =
  | { state: "ready"; campaignId: number }
  /** Triage thread — no worker to rate. */
  | { state: "needs_worker" }
  /** Conversation not attached to any campaign. */
  | { state: "needs_campaign" }
  /** Episode-backed standalone chat with no nomination yet. */
  | { state: "needs_real_campaign" };

export interface AssessmentTargetInput {
  conversationCampaignId: number | null;
  conversationCampaignIsEpisode: boolean;
  /** sms_lists.assessment_campaign_id — the nominated real campaign. */
  boardAssessmentCampaignId: number | null;
  workerId: number | null;
}

export function resolveAssessmentTarget(
  input: AssessmentTargetInput,
): SmsAssessmentTarget {
  // A rating is about a person. Without one there is nothing to record,
  // whatever the campaign situation.
  if (input.workerId == null) return { state: "needs_worker" };

  // A nomination wins outright: it is the whole point of the column,
  // and it stays valid even if the episode campaign is later renamed.
  if (input.boardAssessmentCampaignId != null) {
    return { state: "ready", campaignId: input.boardAssessmentCampaignId };
  }

  if (input.conversationCampaignId == null) return { state: "needs_campaign" };

  if (input.conversationCampaignIsEpisode) {
    return { state: "needs_real_campaign" };
  }

  return { state: "ready", campaignId: input.conversationCampaignId };
}

/**
 * Drop pinned ids whose activity no longer exists (deleted from the
 * wall chart mid-session) or which belong to another campaign.
 *
 * Deliberately silent: a stale pin must degrade the pinned control, not
 * break the board. Order is preserved so the organiser's arrangement
 * survives.
 */
export function pruneSelectedAssessmentIds(
  selected: readonly number[],
  liveActivityIds: readonly number[],
): number[] {
  const live = new Set(liveActivityIds);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of selected) {
    if (!live.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
