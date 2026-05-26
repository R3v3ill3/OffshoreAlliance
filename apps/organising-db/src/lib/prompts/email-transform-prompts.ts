/**
 * Prompts for the email composer's auxiliary AI surfaces:
 *   - inline `transform` (rewrite, shorten, lengthen, tone shifts)
 *   - `subject_variants` (3–5 candidate subject lines on demand)
 *
 * These intentionally do NOT load the full OA_CONTEXT + SOC framework
 * preamble that the primary draft route uses — those operate on hundreds
 * of words. Transforms run on small snippets and need to preserve voice
 * without overlaying the framework. Subject variant prompts only need
 * to know that this is a union-organising email.
 */

export type TransformAction =
  | 'rewrite'
  | 'shorten'
  | 'lengthen'
  | 'tone:militant'
  | 'tone:solidarity'
  | 'tone:plain'

const BASE_VOICE = `You are an assistant helping an Australian union organiser refine emails to members and workers. Preserve solidarity-first framing, plain Australian English, and any factual claims, names, numbers, dates, or merge tokens (e.g. {{first_name}}, {{employer_name}}) exactly as they appear. NEVER invent commitments, dates, or names. Match the writer's register unless explicitly asked to shift tone.`

interface TransformInput {
  text: string
  action: TransformAction
  scope: 'selection' | 'whole_body'
}

export function buildTransformPrompt(input: TransformInput): {
  system: string
  user: string
} {
  const scopeNote =
    input.scope === 'whole_body'
      ? 'You are transforming the entire email body. Keep its structure (greeting, paragraphs, sign-off) intact unless the action explicitly changes it.'
      : 'You are transforming a selected snippet from a longer email. The surrounding text is fixed — your output will be slotted back into the document where the snippet was, so do not greet or sign off unless the snippet already does.'

  const directive = ACTION_DIRECTIVES[input.action]

  const system = `${BASE_VOICE}\n\n${scopeNote}\n\nReturn ONLY the transformed text, with no preamble, no commentary, no markdown fences. Preserve paragraph breaks. If the input contains merge tokens like {{first_name}}, output them unchanged.`

  const user = `${directive}\n\nINPUT:\n${input.text}`

  return { system, user }
}

const ACTION_DIRECTIVES: Record<TransformAction, string> = {
  rewrite:
    'Rewrite the following so it reads more naturally and clearly while keeping the same meaning, facts, and approximate length.',
  shorten:
    'Shorten the following by 30–50% while preserving the core message, facts, and call-to-action. Cut filler, redundancy, and softening qualifiers.',
  lengthen:
    'Expand the following to roughly 1.5–2x its length by adding concrete detail, supporting evidence, or context — but do NOT invent specifics; if you need a fact that isn’t supplied, leave a [bracketed placeholder] for the writer to fill in.',
  'tone:militant':
    'Sharpen the language to a more militant, mobilising register: direct ownership of the fight, named threats, named demands, active verbs. Keep facts unchanged. Avoid clichés.',
  'tone:solidarity':
    'Warm the language to emphasise solidarity, collective identity, and shared interest with members. Move toward "we" and "us", inclusive framing, and acknowledgement of contribution.',
  'tone:plain':
    'Convert the language to plain English suited to a worksite leaflet: short sentences, concrete nouns, no jargon, average reading age ~14. Keep the call to action sharp.',
}

interface SubjectVariantsInput {
  bodyText: string
  hint?: string
}

export function buildSubjectVariantsPrompt(input: SubjectVariantsInput): {
  system: string
  user: string
} {
  const system = `${BASE_VOICE}\n\nYou generate subject lines for an Australian union-organising email. Each subject:\n- 30–55 characters when possible\n- One clear hook, no clickbait\n- Avoid all-caps, multiple exclamation marks, or commercial spam-trigger words (free, 100%, $$$, act now, etc).\n- May reference the campaign workforce, employer, ask, or action — but only using information that is present in the supplied body. Do not invent specifics.\n\nReturn ONLY a JSON array of 3 distinct subject-line strings. No commentary, no markdown.`

  const hintBlock = input.hint
    ? `\n\nWRITER HINT (use this if it points to the right hook):\n${input.hint}`
    : ''

  const user = `Generate 3 subject-line variants for this email body:${hintBlock}\n\nBODY:\n${input.bodyText}`

  return { system, user }
}
