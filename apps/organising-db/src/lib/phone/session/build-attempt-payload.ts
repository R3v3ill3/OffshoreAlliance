/**
 * Shared call-attempt payload builders.
 *
 * Both the mobile shareable dialer (`MobileCallSession`) and the desktop
 * shareable dialer (`DesktopCallSession`) assemble the same
 * `record_call_attempt` wire payload. Centralising the assembly here keeps the
 * two surfaces byte-for-byte identical so reports never diverge by surface.
 */

import type {
  CallDisposition,
  CallListItemWithWorker,
  CallScriptSection,
  CapturedAssessmentRatingPayload,
  CapturedCtaRatingPayload,
  DialDisposition,
  RecordCallAttemptRequest,
  SupportLevel,
} from "@/types/planner-types";
import type { CapturedObjection, CapturedIssue } from "@/lib/phone/call-flow-state";
import type { OutcomeClassification } from "@/lib/phone/outcome-model";
import type { CtaRatingValue } from "@/components/phone/CtaRatingsPanel";
import type { AssessmentValue } from "@/components/phone/mobile/in-call/MobileAssessmentPanel";

export interface BuildAttemptPayloadArgs {
  contact: CallListItemWithWorker;
  scriptId: number | null;
  dialDisposition: DialDisposition | null;
  callDisposition: CallDisposition | null;
  notes: string;
  callbackAt: string | null;
  supportLevel: SupportLevel | null;
  outcome: OutcomeClassification | null;
  durationSeconds: number | null;
  sections: CallScriptSection[];
  stepReached: Set<number>;
  stepNotes: Record<number, string>;
  isConnected: boolean;
  objections: CapturedObjection[];
  issues: CapturedIssue[];
  ctaRatings: Map<number, CtaRatingValue>;
  assessmentValues: Map<number, AssessmentValue>;
  actionId: number | null;
}

/**
 * Build the full `record_call_attempt` request from the captured session
 * state. Step outcomes, CTA ratings and assessment ratings are only included
 * for connected calls (and only non-empty rating rows are forwarded).
 */
export function buildCallAttemptPayload(args: BuildAttemptPayloadArgs): RecordCallAttemptRequest {
  const stepOutcomes = args.sections.map((section, index) => ({
    section_id: section.section_id,
    reached: args.stepReached.has(index),
    outcome_value: null,
    notes: args.stepNotes[index] || null,
    sort_order: index,
  }));

  const ctaPayload: CapturedCtaRatingPayload[] = Array.from(args.ctaRatings.entries())
    .filter(([, value]) => value.rating != null || value.binary_value != null)
    .map(([id, value]) => ({
      cta_ambition_id: id,
      rating: value.rating,
      binary_value: value.binary_value,
      notes: value.notes,
    }));

  const assessmentPayload: CapturedAssessmentRatingPayload[] = Array.from(
    args.assessmentValues.entries(),
  )
    .filter(([, value]) => value.rating != null || (value.notes ?? "").trim().length > 0)
    .map(([activity_id, value]) => ({
      activity_id,
      rating: value.rating,
      notes: value.notes,
    }));

  return {
    list_item_id: args.contact.item_id,
    script_id: args.scriptId,
    dial_disposition: args.dialDisposition ?? "no_answer",
    call_disposition: args.callDisposition,
    overall_notes: args.notes.trim() || null,
    callback_datetime: args.callbackAt,
    support_level_assessed: args.supportLevel,
    cta_response: null,
    duration_seconds: args.durationSeconds,
    outcome_classification: args.outcome,
    step_outcomes: args.isConnected ? stepOutcomes : [],
    objections: args.objections,
    issues: args.issues,
    cta_ratings: ctaPayload,
    assessment_ratings: assessmentPayload,
    action_id: args.actionId,
  };
}

export interface BuildSkipPayloadArgs {
  contact: CallListItemWithWorker;
  scriptId: number | null;
  reason: string;
  notes?: string;
  actionId: number | null;
}

/**
 * Build the silent "skip" attempt — records a `no_answer` / `unable_to_reach`
 * attempt tagged with the caller's skip reason so the contact is deprioritised
 * rather than lost.
 */
export function buildSkipAttemptPayload(args: BuildSkipPayloadArgs): RecordCallAttemptRequest {
  return {
    list_item_id: args.contact.item_id,
    script_id: args.scriptId,
    dial_disposition: "no_answer",
    overall_notes: `[skipped: ${args.reason}]${args.notes ? `\n${args.notes}` : ""}`,
    outcome_classification: "unable_to_reach",
    action_id: args.actionId,
  };
}
