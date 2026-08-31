/**
 * Layout for a printable copy of an SMS survey.
 *
 * The same questions reach members two ways: over SMS, and on paper for
 * anyone the SMS cannot reach — no mobile, an overseas number Mobile
 * Message will not carry, or a member who simply asks for it by email.
 * A paper copy has to be answerable without the conversational scaffold
 * SMS provides, so each question carries its own answer field rather
 * than the "reply with a number from 1 to 5" instruction that only
 * makes sense in a text thread.
 *
 * Pure module — the docx assembly in the route consumes these lines, so
 * the layout decisions stay testable without generating a file.
 */

import type {
  SmsSurveyChoiceOption,
  SmsSurveyQuestionRow,
  SmsSurveyScaleRange,
} from "@/types/sms";

/** Matches `{{token}}` / `{{ token }}` — mirror of TEMPLATE_TOKEN_RE. */
const TOKEN_RE = /\{\{\s*\w+\s*\}\}/g;

/**
 * Merge tokens cannot resolve on paper — there is no recipient. Replace
 * them with a blank the reader can ignore, rather than printing
 * `{{first_name}}` at a member.
 */
export function stripMergeTokensForPrint(text: string | null | undefined): string {
  return (text ?? "")
    .replace(TOKEN_RE, "______")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}

export interface AnswerLine {
  /** Rendered text for the line. */
  text: string;
  /** A ruled blank for handwriting, rather than an option to tick. */
  ruled?: boolean;
}

function choiceOptions(
  options: SmsSurveyChoiceOption[] | SmsSurveyScaleRange | null | undefined,
): SmsSurveyChoiceOption[] {
  return Array.isArray(options) ? options : [];
}

function scaleRange(
  options: SmsSurveyChoiceOption[] | SmsSurveyScaleRange | null | undefined,
): { min: number; max: number } {
  if (!options || Array.isArray(options)) return { min: 1, max: 5 };
  const { min, max } = options;
  // Guard a malformed range rather than emitting an empty or reversed
  // row of boxes on a form someone has to fill in by hand.
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return { min: 1, max: 5 };
  }
  return { min, max };
}

/**
 * The answer field for one question, as printable lines.
 *
 * Ticks are drawn with an empty ballot box so the form works in black
 * and white and needs no field shading.
 */
export function answerLinesForQuestion(
  question: Pick<SmsSurveyQuestionRow, "qtype" | "options">,
): AnswerLine[] {
  switch (question.qtype) {
    case "yes_no":
      return [{ text: "☐  Yes        ☐  No" }];

    case "choice": {
      const opts = choiceOptions(question.options);
      if (opts.length === 0) return [{ text: "", ruled: true }];
      return opts.map((o) => ({
        text: `☐  ${(o.label || o.value || "").trim()}`,
      }));
    }

    case "scale": {
      const { min, max } = scaleRange(question.options);
      const boxes: string[] = [];
      for (let n = min; n <= max; n += 1) boxes.push(`☐ ${n}`);
      return [
        { text: boxes.join("    ") },
        { text: `(${min} = lowest, ${max} = highest)` },
      ];
    }

    case "open_text":
    default:
      // Three ruled lines: enough for a sentence or two without
      // running a single question onto its own page.
      return [
        { text: "", ruled: true },
        { text: "", ruled: true },
        { text: "", ruled: true },
      ];
  }
}

export interface PrintableSurvey {
  title: string;
  campaignName: string | null;
  intro: string;
  questions: Array<{
    number: number;
    prompt: string;
    answers: AnswerLine[];
  }>;
}

/**
 * Assemble the printable model. Retired questions are excluded — they
 * are no longer asked over SMS, so printing them would collect answers
 * the survey cannot file.
 */
export function buildPrintableSurvey(args: {
  title: string;
  campaignName?: string | null;
  invitationBody?: string | null;
  questions: SmsSurveyQuestionRow[];
}): PrintableSurvey {
  const live = args.questions
    .filter((q) => !q.retired_at)
    .sort(
      (a, b) => a.sort_order - b.sort_order || a.question_id - b.question_id,
    );

  return {
    title: args.title.trim() || "Survey",
    campaignName: args.campaignName?.trim() || null,
    intro: stripMergeTokensForPrint(args.invitationBody),
    questions: live.map((q, i) => ({
      number: i + 1,
      prompt: stripMergeTokensForPrint(q.prompt),
      answers: answerLinesForQuestion(q),
    })),
  };
}

/** Filename for the download — safe across Windows, macOS and Linux. */
export function printableSurveyFilename(title: string): string {
  const base = (title || "survey")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return `${base || "survey"}.docx`;
}
