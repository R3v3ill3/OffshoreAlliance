/**
 * AI reply drafting for the SMS inbox (Phase 7, brief §8.2).
 *
 * Pure prompt/parse module — unit tested in
 * src/lib/sms/__tests__/sms-reply-prompts.test.ts. The route
 * (/api/sms/conversations/[id]/draft-reply) assembles the context
 * server-side and calls Anthropic exactly like /api/generate-draft
 * (same SDK-in-route pattern, model from lib/ai/models).
 *
 * Guardrails live in the SYSTEM prompt and in parseDraftReplyCandidates:
 *   - no invented commitments, dates, meetings or figures;
 *   - no industrial/legal advice — the escalation candidate is the
 *     canned answer (acknowledge + hand off), matching the inbox's
 *     sticky-escalation model;
 *   - ≤2 SMS segments preferred, plain Australian English;
 *   - never include any phone number (also enforced post-hoc: any
 *     candidate containing a phone-number-like token is dropped);
 *   - drafts are NEVER auto-sent — the UI only loads them into the
 *     composer for editing.
 */
import { OA_CONTEXT } from './draft-prompts'

export type DraftReplyKind = 'reply' | 'reply_and_advance' | 'escalate_tone'

export interface DraftReplyCandidate {
  kind: DraftReplyKind
  label: string
  body: string
}

export const DRAFT_REPLY_LABELS: Record<DraftReplyKind, string> = {
  reply: 'Answer only',
  reply_and_advance: 'Answer + advance the ask',
  escalate_tone: 'Acknowledge & escalate',
}

export interface SmsReplyTranscriptMessage {
  direction: 'inbound' | 'outbound'
  body: string
  at: string
}

export interface SmsReplyPromptContext {
  /** Oldest → newest, already truncated to the last ~20 messages. */
  transcript: SmsReplyTranscriptMessage[]
  worker: {
    name: string
    occupation: string | null
    employer: string | null
  } | null
  /** Recent activity assessments for the attached campaign (newest first). */
  ratings: Array<{
    activity: string
    rating: number | null
    binaryValue: string | null
    notes: string | null
    ratedAt: string
  }>
  campaignName: string | null
  /** The attached activity — its ask is the CTA to advance. */
  activity: {
    title: string
    description: string | null
    isBinary: boolean
    supporterOutcomeValue: string | null
  } | null
  /** Active canned replies (campaign + org-wide) as tone/wording reference. */
  cannedReplies: Array<{ title: string; body: string }>
  organiserName: string | null
}

export function buildSmsReplyPrompt(ctx: SmsReplyPromptContext): {
  system: string
  user: string
} {
  const system = `${OA_CONTEXT}

You draft SMS replies for an OA organiser answering a member inside a one-to-one text thread. The organiser reviews and edits every draft before sending — nothing you write is sent automatically.

HARD RULES — never break these:
- NEVER invent commitments, meetings, dates, times, figures, entitlements or outcomes. If the member asks for something you cannot know from the context, the draft says the organiser will find out and come back to them.
- NEVER give industrial or legal advice (entitlements, disputes, dismissal, pay claims, right of entry, protected action and the like). For those questions the correct draft acknowledges the question and says the organiser will escalate it to the right official — do not attempt an answer.
- NEVER include any phone number in a draft.
- NEVER mention AI, drafting, or that this message was generated.
- NEVER disclose, quote or reference the internal context above (ratings, assessments, notes, campaign details) in a draft — it informs your tone and suggestions only. If the member asks what is on file about them, the draft says the organiser will give them a call.
- Write plain Australian English, first person, as the organiser. Match the register of the organiser's earlier messages in the thread. No corporate tone, no emojis unless the thread already uses them.
- Keep each draft to at most 2 SMS segments (roughly 300 characters); shorter is better.
- Respect the thread: answer what the member actually said last.

OUTPUT FORMAT — respond with ONLY a JSON array (no prose, no code fences) of 1 to 3 objects:
  [{"kind": "reply", "body": "..."}, {"kind": "reply_and_advance", "body": "..."}, {"kind": "escalate_tone", "body": "..."}]
Kinds:
- "reply" — answer the member's last message, nothing more.
- "reply_and_advance" — answer, then advance the campaign ask (the activity CTA) in one natural sentence. Omit this candidate when there is no activity ask or advancing it would be tone-deaf.
- "escalate_tone" — acknowledge and hand off ("I'll take this to ... and come back to you") for questions needing an official/expert. Omit when nothing warrants escalation.`

  const lines: string[] = []

  if (ctx.campaignName) lines.push(`CAMPAIGN: ${ctx.campaignName}`)
  if (ctx.organiserName) lines.push(`ORGANISER (sender): ${ctx.organiserName}`)

  if (ctx.worker) {
    const bits = [
      `name: ${ctx.worker.name}`,
      ctx.worker.employer ? `employer: ${ctx.worker.employer}` : null,
      ctx.worker.occupation ? `occupation: ${ctx.worker.occupation}` : null,
    ].filter(Boolean)
    lines.push(`MEMBER: ${bits.join(' · ')}`)
  } else {
    lines.push('MEMBER: not yet matched to a worker record — keep it generic.')
  }

  if (ctx.ratings.length > 0) {
    lines.push('RECENT ASSESSMENTS (1=supportive leader … 5=oppositional; newest first):')
    for (const r of ctx.ratings) {
      const value =
        r.rating != null ? `rating ${r.rating}` : (r.binaryValue ?? 'recorded')
      lines.push(
        `- ${r.activity}: ${value}${r.notes ? ` — ${r.notes}` : ''} (${r.ratedAt.slice(0, 10)})`,
      )
    }
  }

  if (ctx.activity) {
    lines.push(
      `CURRENT ACTIVITY / ASK (the CTA for "reply_and_advance"): ${ctx.activity.title}${
        ctx.activity.description ? ` — ${ctx.activity.description}` : ''
      }${
        ctx.activity.isBinary && ctx.activity.supporterOutcomeValue
          ? ` (supporter outcome: ${ctx.activity.supporterOutcomeValue})`
          : ''
      }`,
    )
  } else {
    lines.push('CURRENT ACTIVITY / ASK: none attached — omit "reply_and_advance" unless the thread itself contains a live ask.')
  }

  if (ctx.cannedReplies.length > 0) {
    lines.push('CANNED REPLIES (tone/wording reference only — do not copy verbatim unless it fits):')
    for (const c of ctx.cannedReplies) {
      lines.push(`- ${c.title}: ${c.body}`)
    }
  }

  lines.push('CONVERSATION (oldest first; "MEMBER" is them, "US" is the organiser):')
  for (const m of ctx.transcript) {
    lines.push(`${m.direction === 'inbound' ? 'MEMBER' : 'US'}: ${m.body}`)
  }
  lines.push('Draft the reply candidates to the last MEMBER message now.')

  return { system, user: lines.join('\n') }
}

const VALID_KINDS = new Set<DraftReplyKind>([
  'reply',
  'reply_and_advance',
  'escalate_tone',
])

/**
 * Anything that looks like a dialable number (8+ digits, optional +61 /
 * spacing). Guardrail: drafts must never carry a phone number — a
 * hallucinated one is worse than none, so offending candidates are
 * dropped entirely rather than redacted.
 */
const PHONE_LIKE = /(?:\+?\d[\s\-().]{0,2}){8,}/

export function containsPhoneNumber(body: string): boolean {
  return PHONE_LIKE.test(body)
}

const MAX_CANDIDATE_CHARS = 640

/**
 * Parse the model output into validated candidates. Tolerates code
 * fences and surrounding prose (same salvage ladder as
 * /api/generate-draft), deduplicates kinds (first wins), drops empty /
 * over-long / phone-number-carrying bodies, and caps at 3.
 */
export function parseDraftReplyCandidates(text: string): DraftReplyCandidate[] {
  let parsed: unknown
  const trimmed = text.trim()
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    const start = trimmed.indexOf('[')
    const end = trimmed.lastIndexOf(']')
    try {
      if (fenced) {
        parsed = JSON.parse(fenced[1])
      } else if (start !== -1 && end > start) {
        parsed = JSON.parse(trimmed.slice(start, end + 1))
      } else {
        return []
      }
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []

  const seen = new Set<DraftReplyKind>()
  const out: DraftReplyCandidate[] = []
  for (const item of parsed) {
    if (out.length >= 3) break
    if (typeof item !== 'object' || item == null) continue
    const kind = (item as { kind?: unknown }).kind
    const body = (item as { body?: unknown }).body
    if (typeof kind !== 'string' || !VALID_KINDS.has(kind as DraftReplyKind)) {
      continue
    }
    if (typeof body !== 'string') continue
    const clean = body.trim()
    if (!clean || clean.length > MAX_CANDIDATE_CHARS) continue
    if (containsPhoneNumber(clean)) continue
    if (seen.has(kind as DraftReplyKind)) continue
    seen.add(kind as DraftReplyKind)
    out.push({
      kind: kind as DraftReplyKind,
      label: DRAFT_REPLY_LABELS[kind as DraftReplyKind],
      body: clean,
    })
  }
  return out
}
