/**
 * Pure rules for linking SMS survey questions to campaign assessment
 * activities (binary vs 1–5 scale) and mapping choice options onto
 * rating / binary_value fields.
 */
import { VOTE_SUPPORTER_OPTIONS } from "@/lib/campaign/constants";
import type {
  SmsSurveyChoiceOption,
  SmsSurveyQuestionType,
  SmsSurveyScaleRange,
} from "@/types/sms";
import type { SurveyQuestionInput } from "@/lib/sms/survey-validation";

export const BINARY_ASSESSMENT_VALUES: ReadonlySet<string> = new Set(
  VOTE_SUPPORTER_OPTIONS.map((o) => o.value),
);

export type AssessmentActivityRef = {
  activity_id: number;
  is_binary: boolean;
  title?: string;
};

/** qtype ↔ assessment method compatibility (when write_rating is on). */
export function assessmentLinkCompatible(
  qtype: SmsSurveyQuestionType,
  isBinary: boolean,
): boolean {
  if (qtype === "open_text") return false;
  if (isBinary) return qtype === "yes_no" || qtype === "choice";
  return qtype === "scale" || qtype === "choice";
}

export function assessmentLinkError(
  qtype: SmsSurveyQuestionType,
  isBinary: boolean,
  label: string,
): string | null {
  if (qtype === "open_text") {
    return `${label}: open-text answers cannot write to an assessment.`;
  }
  if (isBinary && qtype === "scale") {
    return `${label}: a scale question cannot write to a binary assessment — use yes/no or multiple choice with per-option maps.`;
  }
  if (!isBinary && qtype === "yes_no") {
    return `${label}: a yes/no question cannot write to a 1–5 scale assessment — use a scale or multiple choice with per-option maps.`;
  }
  return null;
}

const SKIP = { maps_to_rating: null, maps_to_binary: null } as const;

/** Normalise a choice option's assessment map fields. */
export function normaliseOptionMaps(
  o: Pick<SmsSurveyChoiceOption, "maps_to_rating" | "maps_to_binary">,
): { maps_to_rating: number | null; maps_to_binary: string | null } {
  const rating =
    typeof o.maps_to_rating === "number" &&
    Number.isInteger(o.maps_to_rating) &&
    o.maps_to_rating >= 1 &&
    o.maps_to_rating <= 5
      ? o.maps_to_rating
      : null;
  const binary =
    typeof o.maps_to_binary === "string" &&
    BINARY_ASSESSMENT_VALUES.has(o.maps_to_binary)
      ? o.maps_to_binary
      : null;
  return { maps_to_rating: rating, maps_to_binary: binary };
}

/**
 * Validate that questions with write_rating + activity_id are compatible
 * with the target assessment method and that choice option maps are
 * well-formed (mapped value in the allowed set, or explicit skip).
 */
export function validateSurveyAssessmentMappings(
  questions: SurveyQuestionInput[],
  activities: AssessmentActivityRef[],
): string[] {
  const byId = new Map(activities.map((a) => [a.activity_id, a]));
  const errors: string[] = [];

  questions.forEach((q, i) => {
    const label = `Question ${i + 1}`;
    if (!q.write_rating || q.activity_id == null) return;

    const activity = byId.get(q.activity_id);
    if (!activity) {
      // Campaign membership is checked separately in the route.
      return;
    }

    const qtype = q.qtype as SmsSurveyQuestionType;
    const linkErr = assessmentLinkError(qtype, activity.is_binary, label);
    if (linkErr) {
      errors.push(linkErr);
      return;
    }

    if (qtype === "scale") {
      const o = q.options as Partial<SmsSurveyScaleRange> | null | undefined;
      const min = o?.min;
      const max = o?.max;
      if (min !== 1 || max !== 5) {
        errors.push(
          `${label}: scale questions that write to a 1–5 assessment must use min 1 and max 5.`,
        );
      }
      return;
    }

    if (qtype !== "choice") return;

    const opts = Array.isArray(q.options)
      ? (q.options as SmsSurveyChoiceOption[])
      : [];
    opts.forEach((opt, oi) => {
      const optLabel = `${label} option ${oi + 1}${
        opt.label || opt.value ? ` (“${opt.label || opt.value}”)` : ""
      }`;
      const ratingSet =
        opt.maps_to_rating !== undefined && opt.maps_to_rating !== null;
      const binarySet =
        opt.maps_to_binary !== undefined &&
        opt.maps_to_binary !== null &&
        String(opt.maps_to_binary).trim() !== "";

      if (activity.is_binary) {
        if (ratingSet) {
          errors.push(
            `${optLabel}: cannot map to a 1–5 rating on a binary assessment.`,
          );
        }
        if (binarySet && !BINARY_ASSESSMENT_VALUES.has(String(opt.maps_to_binary))) {
          errors.push(
            `${optLabel}: binary map must be yes, no, unsure, or abstain (or Don’t write).`,
          );
        }
      } else {
        if (binarySet) {
          errors.push(
            `${optLabel}: cannot map to a binary value on a 1–5 scale assessment.`,
          );
        }
        if (
          ratingSet &&
          (!Number.isInteger(opt.maps_to_rating) ||
            (opt.maps_to_rating as number) < 1 ||
            (opt.maps_to_rating as number) > 5)
        ) {
          errors.push(`${optLabel}: rating map must be 1–5 (or Don’t write).`);
        }
      }
    });
  });

  return errors;
}

export { SKIP as ASSESSMENT_MAP_SKIP };
