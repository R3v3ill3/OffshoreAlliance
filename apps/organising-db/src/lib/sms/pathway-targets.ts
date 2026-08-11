/**
 * SMS pathway → target resolution (brief §B, chain B, Phase 8 work
 * item 9) — pure, encodes the whole (pathway, workerListId) table
 * from the Phase 8 plan so SmsPathwayPicker/the setup page and its
 * tests can never drift from the fire route's own behaviour.
 *
 * Blast with a cohort fires today's fire/sms route in blast mode;
 * without a cohort it navigates to the Blasts tab and opens
 * NewBlastSheet. Survey never writes at fire time — it always
 * navigates to the Surveys tab, carrying the source list when one is
 * attached. Chat is not routed anywhere; it is always unavailable,
 * defence in depth behind the disabled picker card.
 */

export type SmsPathway = "blast" | "chat" | "survey";

export interface ResolveSmsPathwayTargetArgs {
  pathway: SmsPathway;
  campaignId: number | string;
  workerListId?: number | string | null;
}

export type SmsPathwayTarget =
  | { kind: "navigate"; href: string }
  | { kind: "fire"; body: { pathway: "blast" } }
  | { kind: "unavailable"; reason: string };

const CHAT_UNAVAILABLE_REASON =
  "The SMS chat workspace is coming in a later release";

export function resolveSmsPathwayTarget(
  args: ResolveSmsPathwayTargetArgs,
): SmsPathwayTarget {
  const { pathway, campaignId, workerListId } = args;
  const base = `/campaigns/${campaignId}?tab=outreach&sub=sms`;

  if (pathway === "chat") {
    return { kind: "unavailable", reason: CHAT_UNAVAILABLE_REASON };
  }

  if (pathway === "blast") {
    if (workerListId != null) {
      return { kind: "fire", body: { pathway: "blast" } };
    }
    return { kind: "navigate", href: `${base}&sms_view=blasts&new_blast=1` };
  }

  // pathway === "survey"
  if (workerListId != null) {
    return {
      kind: "navigate",
      href: `${base}&sms_view=surveys&survey_source_list=${workerListId}`,
    };
  }
  return { kind: "navigate", href: `${base}&sms_view=surveys&new_survey=1` };
}
