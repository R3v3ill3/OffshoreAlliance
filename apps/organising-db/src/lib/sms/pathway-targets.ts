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
 * attached. Chat (the P2P board) mirrors Survey: never writes at fire
 * time, always navigates to the Chats tab, carrying the source list
 * when one is attached.
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

export function resolveSmsPathwayTarget(
  args: ResolveSmsPathwayTargetArgs,
): SmsPathwayTarget {
  const { pathway, campaignId, workerListId } = args;
  const base = `/campaigns/${campaignId}?tab=outreach&sub=sms`;

  if (pathway === "chat") {
    if (workerListId != null) {
      return {
        kind: "navigate",
        href: `${base}&sms_view=chats&chat_source_list=${workerListId}`,
      };
    }
    return { kind: "navigate", href: `${base}&sms_view=chats&new_chat=1` };
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
