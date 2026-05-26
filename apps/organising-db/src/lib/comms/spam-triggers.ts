/**
 * Subject-line and preheader spam-trigger wordlist + scoring.
 *
 * Tiered by impact:
 *  - 'hard' — strongly correlated with spam classification in 2024–25
 *    deliverability research (Mequoda, EmailToolTester, Mailgun annual).
 *  - 'soft' — context-dependent words that look fine in organising emails
 *    but spam-filter heuristics still flag in bulk. Surface as advisories.
 *
 * The matcher is case-insensitive and recognises word boundaries; symbols
 * and ALL-CAPS bursts are handled separately so we can score those even
 * when the user types them mid-sentence.
 */

export interface SpamTrigger {
  match: string
  tier: 'hard' | 'soft'
  reason: string
}

export const HARD_TRIGGERS: SpamTrigger[] = [
  { match: '$$$', tier: 'hard', reason: 'Dollar-sign clusters are a classic spam marker.' },
  { match: '100% free', tier: 'hard', reason: 'Almost universally flagged.' },
  { match: '100% guaranteed', tier: 'hard', reason: 'Almost universally flagged.' },
  { match: 'act now', tier: 'hard', reason: 'High-urgency phrases trip Bayesian filters.' },
  { match: 'click here', tier: 'hard', reason: 'Common in phishing — filters down-rank.' },
  { match: 'no obligation', tier: 'hard', reason: 'Classic commercial-spam phrase.' },
  { match: 'risk-free', tier: 'hard', reason: 'Classic commercial-spam phrase.' },
  { match: 'congratulations', tier: 'hard', reason: 'Lottery / scam association.' },
  { match: "you've been selected", tier: 'hard', reason: 'Scam association.' },
  { match: 'winner', tier: 'hard', reason: 'Scam association.' },
  { match: 'cash bonus', tier: 'hard', reason: 'Commercial-spam phrase.' },
  { match: 'cheap', tier: 'hard', reason: 'Triggers commercial filters.' },
  { match: 'lowest price', tier: 'hard', reason: 'Triggers commercial filters.' },
]

export const SOFT_TRIGGERS: SpamTrigger[] = [
  { match: 'reminder', tier: 'soft', reason: 'Often overused — consider specifics.' },
  { match: 'urgent', tier: 'soft', reason: 'Use sparingly — repeated urgency erodes trust.' },
  { match: 'help', tier: 'soft', reason: 'Vague hook — be specific where possible.' },
  { match: 'important', tier: 'soft', reason: 'Better to say WHY it is important.' },
  { match: 'last chance', tier: 'soft', reason: 'Pressure word — use sparingly.' },
  { match: 'don’t miss', tier: 'soft', reason: 'Pressure word — use sparingly.' },
  { match: 'free', tier: 'soft', reason: 'Better in body than subject.' },
  { match: 'limited time', tier: 'soft', reason: 'Generic urgency.' },
  { match: '% off', tier: 'soft', reason: 'Commercial pattern.' },
]

const ALL_TRIGGERS = [...HARD_TRIGGERS, ...SOFT_TRIGGERS]

export interface SpamFinding {
  trigger: SpamTrigger
  index: number
}

export function scanSpamTriggers(text: string): SpamFinding[] {
  if (!text) return []
  const findings: SpamFinding[] = []
  const lower = text.toLowerCase()
  for (const trigger of ALL_TRIGGERS) {
    const needle = trigger.match.toLowerCase()
    let from = 0
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from)
      if (idx === -1) break
      // Token-boundary check for word-shaped triggers (skip for symbolic ones).
      if (/^[\w%]/.test(needle)) {
        const left = lower[idx - 1] ?? ' '
        const right = lower[idx + needle.length] ?? ' '
        if (/[a-z0-9]/.test(left) || (/[a-z0-9]/.test(right) && !needle.endsWith('off'))) {
          from = idx + needle.length
          continue
        }
      }
      findings.push({ trigger, index: idx })
      from = idx + needle.length
    }
  }
  return findings
}

export interface StructuralFlags {
  shoutPercent: number
  exclamationCount: number
  questionCount: number
  emojiCount: number
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu

export function scanStructural(text: string): StructuralFlags {
  if (!text) {
    return { shoutPercent: 0, exclamationCount: 0, questionCount: 0, emojiCount: 0 }
  }
  const letters = text.match(/[A-Za-z]/g) ?? []
  const upper = text.match(/[A-Z]/g) ?? []
  const shoutPercent = letters.length === 0 ? 0 : (upper.length / letters.length) * 100
  return {
    shoutPercent: Math.round(shoutPercent),
    exclamationCount: (text.match(/!/g) ?? []).length,
    questionCount: (text.match(/\?/g) ?? []).length,
    emojiCount: (text.match(EMOJI_RE) ?? []).length,
  }
}

/**
 * Subject-length classification per 2024–25 deliverability research:
 *   30–50 chars: optimal (mobile inbox cutoff ~30–40, desktop ~50)
 *   51–70 chars: still acceptable
 *   >70 chars: truncated in Gmail desktop, hidden on mobile
 *   <15 chars: too vague to drive open
 */
export function classifySubjectLength(
  len: number,
): 'too-short' | 'green' | 'amber' | 'red' {
  if (len === 0) return 'too-short'
  if (len < 15) return 'too-short'
  if (len <= 50) return 'green'
  if (len <= 70) return 'amber'
  return 'red'
}

/**
 * Preheader length — 40–130 visible across major clients (Litmus 2024).
 * <40 truncates poorly, 75 is the cross-client sweet spot, >150 wastes space.
 */
export function classifyPreheaderLength(
  len: number,
): 'too-short' | 'green' | 'amber' | 'red' {
  if (len === 0) return 'too-short'
  if (len < 40) return 'amber'
  if (len <= 130) return 'green'
  if (len <= 150) return 'amber'
  return 'red'
}

/** Approximate mobile-inbox subject truncation point (visual marker). */
export const SUBJECT_MOBILE_CUTOFF = 35
export const SUBJECT_DESKTOP_CUTOFF = 70
export const PREHEADER_MOBILE_CUTOFF = 45
export const PREHEADER_DESKTOP_CUTOFF = 130
