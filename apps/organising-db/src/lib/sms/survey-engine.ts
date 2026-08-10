/**
 * Pure SMS survey engine (brief §4.1) — parsing, branching, retry
 * ladder and rendering. No I/O: the webhook and timers cron gather
 * rows and apply the returned decisions, and the builder UI reuses
 * the renderers for its live phone preview.
 *
 * Parse order for choice questions (§4.1): value → label → synonyms
 * → numeric menu position. yes_no carries built-in synonym sets.
 * Long free-text on a non-open question is captured verbatim and
 * surfaced to a human WITHOUT burning a retry (freetext_on_choice).
 *
 * Unit tested in __tests__/survey-engine.test.ts — this module is
 * the heart of Phase 4.
 */

import type {
  SmsSurveyQuestionRow,
  SmsSurveyChoiceOption,
  SmsSurveyScaleRange,
} from "@/types/sms";

/** §4.1: completion cliffs after ~5 questions — builder warning cap. */
export const SURVEY_QUESTION_SOFT_CAP = 5;

/** campaign_activity_ratings.binary_value / sms_interactions.maps_to_binary are VARCHAR(30). */
const BINARY_VALUE_MAX = 30;
/** sms_survey_answers.parsed_value is VARCHAR(50). */
export const PARSED_VALUE_MAX = 50;

const YES_SYNONYMS = new Set([
  "yes", "y", "yeah", "yeh", "yep", "yea", "ya", "yas", "ok", "okay",
  "sure", "si", "aye", "definitely", "absolutely", "true", "1",
]);
const NO_SYNONYMS = new Set([
  "no", "n", "nope", "nah", "na", "never", "negative", "false", "2",
]);

/**
 * Inline STOP guard (belt — Mobile Message intercepts STOP platform-
 * side per brief §2.3 constraint 3, so this rarely fires; when it
 * does, the reply is an opt-out, never a survey answer).
 */
const STOP_RE = /^\s*(stop|unsubscribe|opt\s*out|optout)\s*[.!]*\s*$/i;

export function isStopKeyword(body: string | null | undefined): boolean {
  return !!body && STOP_RE.test(body);
}

/**
 * Lowercase, strip punctuation, collapse whitespace. Apostrophes are
 * removed (not space-replaced) so "I'll"/"can't" match the synonym
 * forms "ill"/"cant".
 */
export function normaliseAnswer(raw: string): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Options JSONB → sanitised option list. Hardened against malformed
 * authoring (staff can write arbitrary JSONB via PostgREST, bypassing
 * route validation): non-string labels fall back to the value, and
 * synonyms are filtered to strings — a poison option must never make
 * the parser throw (a webhook 500 would wedge the session until TTL).
 */
export function choiceOptions(
  question: Pick<SmsSurveyQuestionRow, "qtype" | "options">,
): SmsSurveyChoiceOption[] {
  if (question.qtype !== "choice" || !Array.isArray(question.options)) return [];
  return (question.options as unknown[])
    .filter(
      (o): o is Record<string, unknown> =>
        !!o && typeof o === "object" && typeof (o as { value?: unknown }).value === "string",
    )
    .map((o) => ({
      value: o.value as string,
      label: typeof o.label === "string" ? o.label : (o.value as string),
      synonyms: Array.isArray(o.synonyms)
        ? (o.synonyms as unknown[]).filter((s): s is string => typeof s === "string")
        : [],
    }));
}

export function scaleRange(
  question: Pick<SmsSurveyQuestionRow, "qtype" | "options">,
): SmsSurveyScaleRange {
  const fallback: SmsSurveyScaleRange = { min: 1, max: 5 };
  if (question.qtype !== "scale") return fallback;
  const o = question.options as Partial<SmsSurveyScaleRange> | null;
  const min = typeof o?.min === "number" && Number.isFinite(o.min) ? o.min : fallback.min;
  const max = typeof o?.max === "number" && Number.isFinite(o.max) ? o.max : fallback.max;
  return max > min ? { min, max } : fallback;
}

export type ParseResult =
  | { kind: "parsed"; value: string }
  | { kind: "invalid" }
  /** Long free-text on a non-open question: capture verbatim, surface to a human, no retry burnt. */
  | { kind: "freetext_on_choice" };

/** ≥3 words or >60 chars of unmatched text reads as a real message, not a failed menu pick. */
function looksLikeFreeText(normalised: string, raw: string): boolean {
  if (!normalised) return false;
  return normalised.split(" ").length >= 3 || raw.trim().length > 60;
}

/** Bare integer extraction ("3", " 3.", "3!!"): null when anything else rides along. */
function bareInteger(normalised: string): number | null {
  if (!/^\d+$/.test(normalised)) return null;
  const n = Number(normalised);
  return Number.isSafeInteger(n) ? n : null;
}

export function parseAnswer(
  question: Pick<SmsSurveyQuestionRow, "qtype" | "options">,
  rawBody: string,
): ParseResult {
  const raw = rawBody ?? "";
  const normalised = normaliseAnswer(raw);

  if (question.qtype === "open_text") {
    return raw.trim()
      ? { kind: "parsed", value: raw.trim() }
      : { kind: "invalid" };
  }

  if (!normalised) return { kind: "invalid" };

  if (question.qtype === "yes_no") {
    // Whole-reply first, then the first token ("yes please").
    const first = normalised.split(" ")[0];
    if (YES_SYNONYMS.has(normalised) || YES_SYNONYMS.has(first)) {
      return { kind: "parsed", value: "yes" };
    }
    if (NO_SYNONYMS.has(normalised) || NO_SYNONYMS.has(first)) {
      return { kind: "parsed", value: "no" };
    }
    return looksLikeFreeText(normalised, raw)
      ? { kind: "freetext_on_choice" }
      : { kind: "invalid" };
  }

  if (question.qtype === "scale") {
    const { min, max } = scaleRange(question);
    const n = bareInteger(normalised);
    if (n != null && n >= min && n <= max) {
      return { kind: "parsed", value: String(n) };
    }
    return looksLikeFreeText(normalised, raw)
      ? { kind: "freetext_on_choice" }
      : { kind: "invalid" };
  }

  // choice — value → label → synonyms → numeric menu position.
  const opts = choiceOptions(question);
  for (const o of opts) {
    if (normaliseAnswer(o.value) === normalised) {
      return { kind: "parsed", value: o.value };
    }
  }
  for (const o of opts) {
    if (o.label && normaliseAnswer(o.label) === normalised) {
      return { kind: "parsed", value: o.value };
    }
  }
  for (const o of opts) {
    for (const syn of o.synonyms ?? []) {
      if (normaliseAnswer(syn) === normalised) {
        return { kind: "parsed", value: o.value };
      }
    }
  }
  const pos = bareInteger(normalised);
  if (pos != null && pos >= 1 && pos <= opts.length) {
    return { kind: "parsed", value: opts[pos - 1].value };
  }
  return looksLikeFreeText(normalised, raw)
    ? { kind: "freetext_on_choice" }
    : { kind: "invalid" };
}

// ─── Branching ──────────────────────────────────────────────────────

export type NextStep =
  | { kind: "question"; question: SmsSurveyQuestionRow }
  | { kind: "complete" };

/**
 * Branching override for the parsed value, else the next question by
 * sort_order, else complete. Unknown branch targets fall through to
 * sort order (belt against stale authoring).
 */
export function nextStep(
  questions: SmsSurveyQuestionRow[],
  current: SmsSurveyQuestionRow,
  parsedValue: string,
): NextStep {
  const ordered = [...questions].sort(
    (a, b) => a.sort_order - b.sort_order || a.question_id - b.question_id,
  );

  const branching = current.branching;
  if (branching && typeof branching === "object") {
    const target =
      branching[parsedValue] ??
      // Tolerate normalised-key authoring ("Yes" vs "yes").
      branching[normaliseAnswer(parsedValue)];
    if (target === "end") return { kind: "complete" };
    if (typeof target === "number") {
      const q = ordered.find((x) => x.question_id === target);
      if (q) return { kind: "question", question: q };
    }
  }

  const idx = ordered.findIndex((q) => q.question_id === current.question_id);
  const next = idx >= 0 ? ordered[idx + 1] : undefined;
  return next ? { kind: "question", question: next } : { kind: "complete" };
}

// ─── Rendering ──────────────────────────────────────────────────────

function numberedMenu(opts: SmsSurveyChoiceOption[]): string {
  return opts.map((o, i) => `${i + 1}. ${o.label || o.value}`).join("\n");
}

export function renderQuestion(question: SmsSurveyQuestionRow): string {
  const prompt = question.prompt.trim();
  switch (question.qtype) {
    case "choice": {
      const opts = choiceOptions(question);
      return opts.length > 0 ? `${prompt}\n${numberedMenu(opts)}` : prompt;
    }
    case "yes_no":
      return `${prompt}\nReply YES or NO`;
    case "scale": {
      const { min, max } = scaleRange(question);
      return `${prompt}\nReply with a number from ${min} to ${max}`;
    }
    default:
      return prompt;
  }
}

/**
 * Invitation + first question in ONE send (decided in-phase: a
 * second message would double invitation cost, and "invited" then
 * cleanly means "has the first question in hand").
 */
export function renderInvitation(
  invitationBody: string | null,
  firstQuestion: SmsSurveyQuestionRow,
): string {
  const intro = invitationBody?.trim();
  const q = renderQuestion(firstQuestion);
  return intro ? `${intro}\n\n${q}` : q;
}

/** Question-timeout nudge (one per question). */
export function renderNudge(question: SmsSurveyQuestionRow): string {
  const custom = question.nudge_text?.trim();
  if (custom) return custom;
  return `Just checking in — when you have a moment:\n${renderQuestion(question)}`;
}

/** Reminder copy (varied from the nudge; max reminder_offsets.length sends). */
export function renderReminder(question: SmsSurveyQuestionRow): string {
  return `We'd still love to hear from you. ${renderQuestion(question)}`;
}

// ─── Retry ladder ───────────────────────────────────────────────────

export type RetryStep =
  | { kind: "reprompt"; body: string }
  | { kind: "handoff" };

function optionSummary(question: SmsSurveyQuestionRow): string {
  switch (question.qtype) {
    case "choice": {
      const opts = choiceOptions(question);
      return opts.map((o) => o.label || o.value).join(", ");
    }
    case "yes_no":
      return "YES or NO";
    case "scale": {
      const { min, max } = scaleRange(question);
      return `a number from ${min} to ${max}`;
    }
    default:
      return "";
  }
}

/**
 * §4.1 retry ladder. `retriesSoFar` = invalid replies already burnt
 * on this question BEFORE the current one:
 *   0 → specific re-prompt with the options (or invalid_prompt),
 *   1 → restructured numbered menu,
 *   ≥ retryLimit → hand off to a human with the transcript.
 */
export function retryLadder(
  question: SmsSurveyQuestionRow,
  retriesSoFar: number,
  retryLimit: number,
): RetryStep {
  if (retriesSoFar >= retryLimit) return { kind: "handoff" };

  if (retriesSoFar === 0) {
    const custom = question.invalid_prompt?.trim();
    if (custom) return { kind: "reprompt", body: custom };
    const summary = optionSummary(question);
    return {
      kind: "reprompt",
      body: summary
        ? `Sorry, we didn't catch that. Please reply with ${summary}.`
        : `Sorry, we didn't catch that. ${renderQuestion(question)}`,
    };
  }

  // Second (and any later pre-handoff) attempt: strip back to a
  // bare numbered menu / minimal instruction.
  switch (question.qtype) {
    case "choice": {
      const opts = choiceOptions(question);
      return {
        kind: "reprompt",
        body: `Please reply with just a number:\n${numberedMenu(opts)}`,
      };
    }
    case "yes_no":
      return {
        kind: "reprompt",
        body: "Please reply with just YES or NO.",
      };
    case "scale": {
      const { min, max } = scaleRange(question);
      return {
        kind: "reprompt",
        body: `Please reply with just a number from ${min} to ${max}.`,
      };
    }
    default:
      return {
        kind: "reprompt",
        body: `Please reply with a short answer. ${renderQuestion(question)}`,
      };
  }
}

// ─── Outcome mapping (answer → rating write) ────────────────────────

export interface OutcomeMapping {
  rating: number | null;
  binary: string | null;
}

/**
 * How a parsed answer maps onto the existing sms_interactions →
 * trg_sms_to_rating pipeline (brief §5.1):
 *   scale 1–5 (or a numeric choice value 1–5) → maps_to_rating,
 *   yes_no / other choice values → maps_to_binary (VARCHAR(30)),
 *   open_text and out-of-range scales → no mapping (no rating).
 */
export function outcomeMapping(
  question: Pick<SmsSurveyQuestionRow, "qtype">,
  parsedValue: string,
): OutcomeMapping {
  const none: OutcomeMapping = { rating: null, binary: null };
  switch (question.qtype) {
    case "open_text":
      return none;
    case "yes_no":
      return { rating: null, binary: parsedValue };
    case "scale": {
      const n = Number(parsedValue);
      return Number.isInteger(n) && n >= 1 && n <= 5
        ? { rating: n, binary: null }
        : none;
    }
    case "choice": {
      if (/^\d+$/.test(parsedValue)) {
        const n = Number(parsedValue);
        if (n >= 1 && n <= 5) return { rating: n, binary: null };
      }
      return { rating: null, binary: parsedValue.slice(0, BINARY_VALUE_MAX) };
    }
    default:
      return none;
  }
}
