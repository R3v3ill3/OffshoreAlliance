/**
 * Diff helpers for post-open survey edits — classify low vs high risk
 * so the UI can require a strong acknowledge before saving.
 */
import type {
  SmsSurveyChoiceOption,
  SmsSurveyQuestionRow,
  SmsSurveyScaleRange,
} from '@/types/sms'
import type { SurveyQuestionInput } from '@/lib/sms/survey-validation'

export type IntegrityRisk = 'low' | 'high'

export interface IntegrityFinding {
  risk: IntegrityRisk
  code: string
  message: string
}

function choiceValues(
  options: SmsSurveyChoiceOption[] | SmsSurveyScaleRange | null | undefined,
): string[] {
  if (!Array.isArray(options)) return []
  return options.map((o) => o.value).filter(Boolean).sort()
}

function scaleKey(
  options: SmsSurveyChoiceOption[] | SmsSurveyScaleRange | null | undefined,
): string | null {
  if (!options || Array.isArray(options)) return null
  return `${options.min}:${options.max}`
}

/**
 * Compare existing DB questions to an incoming index-based payload.
 * High-risk: qtype change, MC value set change, scale range change,
 * removed questions, fewer questions than before.
 */
export function assessSurveyEditIntegrity(
  existing: SmsSurveyQuestionRow[],
  incoming: SurveyQuestionInput[],
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = []
  const ordered = [...existing].sort(
    (a, b) => a.sort_order - b.sort_order || a.question_id - b.question_id,
  )

  if (incoming.length < ordered.length) {
    findings.push({
      risk: 'high',
      code: 'question_removed',
      message: `Removing ${ordered.length - incoming.length} question(s) can orphan or hide prior answers.`,
    })
  }

  const n = Math.min(ordered.length, incoming.length)
  for (let i = 0; i < n; i++) {
    const prev = ordered[i]
    const next = incoming[i]
    const label = `Q${i + 1}`

    if (next.qtype && next.qtype !== prev.qtype) {
      findings.push({
        risk: 'high',
        code: 'qtype_changed',
        message: `${label}: question type changing from ${prev.qtype} to ${next.qtype}.`,
      })
    }

    if ((next.qtype ?? prev.qtype) === 'choice' || prev.qtype === 'choice') {
      const before = choiceValues(prev.options).join('|')
      const after = choiceValues(next.options ?? prev.options).join('|')
      if (before !== after) {
        findings.push({
          risk: 'high',
          code: 'choice_values_changed',
          message: `${label}: multiple-choice values changed — earlier answers may not match new options.`,
        })
      }
    }

    if ((next.qtype ?? prev.qtype) === 'scale' || prev.qtype === 'scale') {
      const before = scaleKey(prev.options)
      const after = scaleKey(next.options ?? prev.options)
      if (before && after && before !== after) {
        findings.push({
          risk: 'high',
          code: 'scale_range_changed',
          message: `${label}: scale range changed (${before} → ${after}).`,
        })
      }
    }

    // Branching / prompt changes are low risk (noted once if any differ).
    const prevBranch = JSON.stringify(prev.branching ?? {})
    const nextBranch = JSON.stringify(next.branching ?? {})
    if (prevBranch !== nextBranch) {
      findings.push({
        risk: 'low',
        code: 'branching_changed',
        message: `${label}: branching updated — in-flight sessions on older versions keep prior paths.`,
      })
    }
    if (
      next.prompt !== undefined &&
      next.prompt.trim() !== prev.prompt.trim()
    ) {
      findings.push({
        risk: 'low',
        code: 'prompt_changed',
        message: `${label}: prompt wording changed.`,
      })
    }
  }

  if (incoming.length > ordered.length) {
    findings.push({
      risk: 'low',
      code: 'question_added',
      message: `Adding ${incoming.length - ordered.length} question(s) — only new sessions / later prompts use them.`,
    })
  }

  // Dedupe by code+message
  const seen = new Set<string>()
  return findings.filter((f) => {
    const k = `${f.code}:${f.message}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function hasHighRiskFindings(findings: IntegrityFinding[]): boolean {
  return findings.some((f) => f.risk === 'high')
}
