'use client'

/**
 * Survey definition editor (brief §4.1 authoring model: a linear list
 * with optional per-answer branch overrides — not a flow canvas).
 *
 * - Per-question type editors (choice options with value/label/
 *   synonyms, scale min/max, yes/no, open text), per-answer branch
 *   selects (→ later question or End), write-rating toggle when the
 *   survey has an activity target, invalid/nudge copy overrides.
 * - Invitation body with compliance validation (org name required;
 *   opt-out optional) and a segment counter over the COMBINED
 *   invitation + question 1 message (they go out as one send).
 * - >5 questions warning (§4.1: completion cliffs after Q3–Q6).
 * - Live phone-style preview driven by the pure engine renderers.
 */
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowDown, ArrowUp, Plus, Scale, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CreateAssessmentDialog } from '@/components/campaigns/assessments/create-assessment-dialog'
import { countSegments } from '@/lib/sms/segments'
import { validateSmsBody } from '@/lib/sms/compliance'
import {
  SURVEY_QUESTION_SOFT_CAP,
  renderInvitation,
  renderQuestion,
} from '@/lib/sms/survey-engine'
import { useSmsSenders } from '@/lib/hooks/useSmsBroadcast'
import {
  BALLOT_COMPLIANCE_BANNER,
  BALLOT_INDICATIVE_SENTENCE,
  invitationMentionsIndicative,
  type SurveyQuestionInput,
} from '@/lib/sms/survey-validation'
import type {
  SmsBallotRevotePolicy,
  SmsSurveyChoiceOption,
  SmsSurveyPurpose,
  SmsSurveyQuestionRow,
  SmsSurveyQuestionType,
  SmsSurveyScaleRange,
} from '@/types/sms'

export interface SurveyEditorQuestion {
  prompt: string
  qtype: SmsSurveyQuestionType
  choiceOptions: Array<{ value: string; label: string; synonyms: string }>
  scaleMin: number
  scaleMax: number
  /** parsed value → question index | 'end' | undefined (= next in order). */
  branching: Record<string, number | 'end'>
  write_rating: boolean
  /** Phase 8: per-question override of the survey's ratings target. NULL = fall back to the survey target. */
  activity_id: number | null
  invalid_prompt: string
  nudge_text: string
}

export interface SurveyEditorValue {
  title: string
  /** Phase 5: 'indicative_ballot' switches on the integrity layer. */
  purpose: SmsSurveyPurpose
  revote_policy: SmsBallotRevotePolicy
  results_restricted: boolean
  activity_id: number | null
  sender_number_id: number | null
  invitation_body: string
  completion_body: string
  retry_limit: number
  question_timeout_minutes: number
  session_ttl_hours: number
  reminder_offsets: number[]
  questions: SurveyEditorQuestion[]
}

export const EMPTY_SURVEY_QUESTION: SurveyEditorQuestion = {
  prompt: '',
  qtype: 'yes_no',
  choiceOptions: [
    { value: 'yes', label: 'Yes', synonyms: '' },
    { value: 'no', label: 'No', synonyms: '' },
  ],
  scaleMin: 1,
  scaleMax: 5,
  branching: {},
  write_rating: false,
  activity_id: null,
  invalid_prompt: '',
  nudge_text: '',
}

export const EMPTY_SURVEY: SurveyEditorValue = {
  title: '',
  purpose: 'survey',
  revote_policy: 'locked',
  results_restricted: false,
  activity_id: null,
  sender_number_id: null,
  invitation_body: '',
  completion_body: 'Thanks — that’s everything. Offshore Alliance.',
  retry_limit: 2,
  question_timeout_minutes: 240,
  session_ttl_hours: 72,
  reminder_offsets: [1440, 2880],
  questions: [{ ...EMPTY_SURVEY_QUESTION }],
}

/** Editor state → the routes' question payload (branch targets by index). */
export function toQuestionInputs(
  questions: SurveyEditorQuestion[],
): SurveyQuestionInput[] {
  return questions.map((q) => ({
    prompt: q.prompt,
    qtype: q.qtype,
    options:
      q.qtype === 'choice'
        ? q.choiceOptions
            .filter((o) => o.value.trim())
            .map((o) => ({
              value: o.value.trim(),
              label: o.label.trim() || o.value.trim(),
              synonyms: o.synonyms
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            }))
        : q.qtype === 'scale'
          ? { min: q.scaleMin, max: q.scaleMax }
          : null,
    branching: Object.keys(q.branching).length > 0 ? q.branching : null,
    write_rating: q.write_rating,
    activity_id: q.activity_id,
    invalid_prompt: q.invalid_prompt.trim() || null,
    nudge_text: q.nudge_text.trim() || null,
  }))
}

/** Server question rows → editor state (for editing a draft). */
export function fromQuestionRows(
  rows: SmsSurveyQuestionRow[],
): SurveyEditorQuestion[] {
  const ordered = [...rows].sort(
    (a, b) => a.sort_order - b.sort_order || a.question_id - b.question_id,
  )
  const indexById = new Map(ordered.map((q, i) => [q.question_id, i]))
  return ordered.map((q) => {
    const branching: Record<string, number | 'end'> = {}
    for (const [value, target] of Object.entries(q.branching ?? {})) {
      if (target === 'end') branching[value] = 'end'
      else if (indexById.has(target)) branching[value] = indexById.get(target)!
    }
    const opts = Array.isArray(q.options)
      ? (q.options as SmsSurveyChoiceOption[])
      : []
    const scale =
      !Array.isArray(q.options) && q.options
        ? (q.options as SmsSurveyScaleRange)
        : { min: 1, max: 5 }
    return {
      prompt: q.prompt,
      qtype: q.qtype,
      choiceOptions:
        opts.length > 0
          ? opts.map((o) => ({
              value: o.value,
              label: o.label ?? o.value,
              synonyms: (o.synonyms ?? []).join(', '),
            }))
          : EMPTY_SURVEY_QUESTION.choiceOptions.map((o) => ({ ...o })),
      scaleMin: scale.min ?? 1,
      scaleMax: scale.max ?? 5,
      branching,
      write_rating: q.write_rating,
      activity_id: q.activity_id,
      invalid_prompt: q.invalid_prompt ?? '',
      nudge_text: q.nudge_text ?? '',
    }
  })
}

/** Editor question → a fake row for the pure engine renderers. */
function toPreviewRow(
  q: SurveyEditorQuestion,
  index: number,
): SmsSurveyQuestionRow {
  return {
    question_id: index + 1,
    survey_id: 0,
    sort_order: index,
    prompt: q.prompt || `Question ${index + 1}`,
    qtype: q.qtype,
    options:
      q.qtype === 'choice'
        ? q.choiceOptions
            .filter((o) => o.value.trim())
            .map((o) => ({
              value: o.value.trim(),
              label: o.label.trim() || o.value.trim(),
            }))
        : q.qtype === 'scale'
          ? { min: q.scaleMin, max: q.scaleMax }
          : null,
    branching: null,
    write_rating: q.write_rating,
    activity_id: q.activity_id,
    invalid_prompt: null,
    nudge_text: null,
    created_at: '',
    updated_at: '',
  }
}

interface ActivityOption {
  activity_id: number
  title: string
}

interface SmsSurveyEditorProps {
  value: SurveyEditorValue
  onChange: (value: SurveyEditorValue) => void
  activities: ActivityOption[]
  disabled?: boolean
  /** Needed to mount CreateAssessmentDialog's inline "+ New assessment" affordance. */
  campaignId: string
  /**
   * Invalidated in addition to the dialog's own ['campaign-activities', …]
   * key when a new assessment is created inline, so the activities list
   * this editor renders (queryKey ['sms-survey-activities', campaignId])
   * refreshes too.
   */
  onActivityCreated?: (activityId: number) => void
  /** Highlight + scroll target when the flow chart selects a question. */
  selectedQuestionIndex?: number | null
  onSelectQuestion?: (index: number) => void
}

export function SmsSurveyEditor({
  value,
  onChange,
  activities,
  disabled,
  campaignId,
  onActivityCreated,
  selectedQuestionIndex = null,
  onSelectQuestion,
}: SmsSurveyEditorProps) {
  const { data: senders } = useSmsSenders()
  // 'survey' targets the survey-level activity_id; a number targets that
  // question's per-question override. null = dialog closed.
  const [createAssessmentTarget, setCreateAssessmentTarget] = useState<
    'survey' | number | null
  >(null)
  const questionRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (selectedQuestionIndex == null) return
    const el = questionRefs.current[selectedQuestionIndex]
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedQuestionIndex])

  const patch = (p: Partial<SurveyEditorValue>) => onChange({ ...value, ...p })
  const patchQuestion = (i: number, p: Partial<SurveyEditorQuestion>) => {
    const questions = value.questions.map((q, idx) =>
      idx === i ? { ...q, ...p } : q,
    )
    onChange({ ...value, questions })
  }

  const addQuestion = () => {
    patch({
      questions: [...value.questions, { ...EMPTY_SURVEY_QUESTION }],
    })
    onSelectQuestion?.(value.questions.length)
  }

  const moveQuestion = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= value.questions.length) return
    const questions = [...value.questions]
    ;[questions[i], questions[j]] = [questions[j], questions[i]]
    // Branch targets reference indexes — remap the swap.
    const remap = (t: number | 'end') =>
      t === 'end' ? t : t === i ? j : t === j ? i : t
    onChange({
      ...value,
      questions: questions.map((q) => ({
        ...q,
        branching: Object.fromEntries(
          Object.entries(q.branching).map(([v, t]) => [v, remap(t)]),
        ),
      })),
    })
  }

  const removeQuestion = (i: number) => {
    const questions = value.questions
      .filter((_, idx) => idx !== i)
      .map((q) => ({
        ...q,
        branching: Object.fromEntries(
          Object.entries(q.branching)
            .filter(([, t]) => t === 'end' || t !== i)
            .map(([v, t]) => [v, t === 'end' ? t : t > i ? t - 1 : t] as const),
        ),
      }))
    onChange({ ...value, questions })
  }

  const isBallot = value.purpose === 'indicative_ballot'
  const indicativeOk =
    !isBallot || invitationMentionsIndicative(value.invitation_body)

  /**
   * Switching to ballot mode auto-appends the indicative framing when
   * missing (§8.1 stored framing — the open route rejects without it).
   */
  const setPurpose = (purpose: SmsSurveyPurpose) => {
    if (
      purpose === 'indicative_ballot' &&
      !invitationMentionsIndicative(value.invitation_body)
    ) {
      const base = value.invitation_body.trim()
      patch({
        purpose,
        invitation_body: base
          ? `${base} ${BALLOT_INDICATIVE_SENTENCE}`
          : BALLOT_INDICATIVE_SENTENCE,
      })
      return
    }
    patch({ purpose })
  }

  const compliance = validateSmsBody(value.invitation_body)
  const previewRows = value.questions.map(toPreviewRow)
  const invitationPreview = previewRows.length
    ? renderInvitation(value.invitation_body || null, previewRows[0])
    : value.invitation_body
  // Cheap enough to run per render (React Compiler memoises).
  const invitationSegments = countSegments(invitationPreview)

  /** Answer values that can carry a branch for a question. */
  const branchableValues = (q: SurveyEditorQuestion): string[] => {
    if (q.qtype === 'yes_no') return ['yes', 'no']
    if (q.qtype === 'choice') {
      return q.choiceOptions.map((o) => o.value.trim()).filter(Boolean)
    }
    return []
  }

  return (
    <>
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="survey-title">Title</Label>
        <Input
          id="survey-title"
          placeholder="e.g. EBA log of claims temperature check"
          value={value.title}
          disabled={disabled}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select
          value={value.purpose}
          disabled={disabled}
          onValueChange={(v) => setPurpose(v as SmsSurveyPurpose)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="survey">Survey</SelectItem>
            <SelectItem value="indicative_ballot">Indicative ballot</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isBallot && (
        <>
          {/* Mandatory compliance banner (brief §4.2/§8.1) — fixed,
              non-editable framing. */}
          <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
            <Scale className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              <span className="font-semibold">{BALLOT_COMPLIANCE_BANNER}</span>{' '}
              In-app ballots supplement formal ballots — they never replace
              them. The roll freezes when you open; one vote per member; every
              voter gets a hash receipt; all ballot activity is logged.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Revote policy</Label>
              <Select
                value={value.revote_policy}
                disabled={disabled}
                onValueChange={(v) =>
                  patch({ revote_policy: v as SmsBallotRevotePolicy })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="locked">
                    One vote per member (locked)
                  </SelectItem>
                  <SelectItem value="revote_until_close">
                    Allow re-votes until close (last vote counts)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Re-votes are logged as supersessions in the ballot event log.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Results visibility</Label>
              <div className="flex items-center gap-2 pt-1.5">
                <Switch
                  id="ballot-restricted"
                  checked={value.results_restricted}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    patch({ results_restricted: checked })
                  }
                />
                <Label htmlFor="ballot-restricted" className="text-xs">
                  Restrict results — aggregate tally only
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Hides per-member answer breakdowns; votes stay confidential,
                not anonymous.
              </p>
            </div>
          </div>
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Sender number</Label>
          <Select
            value={value.sender_number_id != null ? String(value.sender_number_id) : 'none'}
            disabled={disabled}
            onValueChange={(v) =>
              patch({ sender_number_id: v === 'none' ? null : Number(v) })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a number" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— choose —</SelectItem>
              {(senders ?? []).map((s) => (
                <SelectItem key={s.number_id} value={String(s.number_id)}>
                  {s.label || s.phone_e164}
                  {s.purpose === 'survey' ? ' (survey)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Ratings target (assessment activity)</Label>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              disabled={disabled}
              onClick={() => setCreateAssessmentTarget('survey')}
            >
              + New assessment
            </Button>
          </div>
          <Select
            value={value.activity_id != null ? String(value.activity_id) : 'none'}
            disabled={disabled}
            onValueChange={(v) =>
              patch({ activity_id: v === 'none' ? null : Number(v) })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None — answers only</SelectItem>
              {activities.map((a) => (
                <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                  {a.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Marked questions write member ratings through the existing SMS
            pipeline.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="survey-invitation">Invitation message</Label>
        <Textarea
          id="survey-invitation"
          rows={3}
          placeholder='e.g. "Offshore Alliance: quick 3-question survey on the EBA claims. Reply STOP to opt out."'
          value={value.invitation_body}
          disabled={disabled}
          onChange={(e) => patch({ invitation_body: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Sent together with question 1 as one message —{' '}
          {invitationSegments.segments || 1} part
          {invitationSegments.segments === 1 ? '' : 's'} (
          {invitationSegments.encoding}).
        </p>
        {!compliance.ok && (
          <ul className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 space-y-0.5">
            {compliance.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {!indicativeOk && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            Ballot invitations must describe the poll as
            &ldquo;indicative&rdquo; — e.g. &ldquo;{BALLOT_INDICATIVE_SENTENCE}
            &rdquo;. The ballot cannot be opened without it.
          </p>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Questions</Label>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={addQuestion}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add question
          </Button>
        </div>

        {value.questions.length > SURVEY_QUESTION_SOFT_CAP && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            {value.questions.length} questions — completion drops sharply past{' '}
            {SURVEY_QUESTION_SOFT_CAP} (1–3 questions complete ~83% of the
            time, 9+ only ~56%). Consider trimming.
          </p>
        )}

        {value.questions.map((q, i) => (
          <div
            key={i}
            ref={(el) => {
              questionRefs.current[i] = el
            }}
            onClick={() => onSelectQuestion?.(i)}
            className={cn(
              'rounded-md border p-3 space-y-2.5 bg-muted/20 transition-colors',
              selectedQuestionIndex === i &&
                'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/40',
            )}
          >
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Q{i + 1}</Badge>
              <Select
                value={q.qtype}
                disabled={disabled}
                onValueChange={(v) =>
                  patchQuestion(i, {
                    qtype: v as SmsSurveyQuestionType,
                    branching: {},
                  })
                }
              >
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes_no">Yes / No</SelectItem>
                  <SelectItem value="choice">Multiple choice</SelectItem>
                  <SelectItem value="scale">Scale</SelectItem>
                  <SelectItem value="open_text">Open text</SelectItem>
                </SelectContent>
              </Select>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled || i === 0}
                  onClick={() => moveQuestion(i, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled || i === value.questions.length - 1}
                  onClick={() => moveQuestion(i, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={disabled || value.questions.length <= 1}
                  onClick={() => removeQuestion(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <Textarea
              rows={2}
              placeholder="Question prompt"
              value={q.prompt}
              disabled={disabled}
              onChange={(e) => patchQuestion(i, { prompt: e.target.value })}
            />

            {q.qtype === 'choice' && (
              <div className="space-y-1.5">
                {q.choiceOptions.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-1.5">
                    <Input
                      className="h-8 w-24"
                      placeholder="value"
                      value={o.value}
                      disabled={disabled}
                      onChange={(e) => {
                        const choiceOptions = q.choiceOptions.map((x, xi) =>
                          xi === oi ? { ...x, value: e.target.value } : x,
                        )
                        patchQuestion(i, { choiceOptions })
                      }}
                    />
                    <Input
                      className="h-8 flex-1"
                      placeholder="Label shown in the menu"
                      value={o.label}
                      disabled={disabled}
                      onChange={(e) => {
                        const choiceOptions = q.choiceOptions.map((x, xi) =>
                          xi === oi ? { ...x, label: e.target.value } : x,
                        )
                        patchQuestion(i, { choiceOptions })
                      }}
                    />
                    <Input
                      className="h-8 flex-1"
                      placeholder="synonyms, comma-separated"
                      value={o.synonyms}
                      disabled={disabled}
                      onChange={(e) => {
                        const choiceOptions = q.choiceOptions.map((x, xi) =>
                          xi === oi ? { ...x, synonyms: e.target.value } : x,
                        )
                        patchQuestion(i, { choiceOptions })
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled || q.choiceOptions.length <= 2}
                      onClick={() =>
                        patchQuestion(i, {
                          choiceOptions: q.choiceOptions.filter(
                            (_, xi) => xi !== oi,
                          ),
                        })
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    patchQuestion(i, {
                      choiceOptions: [
                        ...q.choiceOptions,
                        { value: '', label: '', synonyms: '' },
                      ],
                    })
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Option
                </Button>
              </div>
            )}

            {q.qtype === 'scale' && (
              <div className="flex items-center gap-2">
                <Label className="text-xs">From</Label>
                <Input
                  type="number"
                  className="h-8 w-20"
                  value={q.scaleMin}
                  disabled={disabled}
                  onChange={(e) =>
                    patchQuestion(i, { scaleMin: Number(e.target.value) })
                  }
                />
                <Label className="text-xs">to</Label>
                <Input
                  type="number"
                  className="h-8 w-20"
                  value={q.scaleMax}
                  disabled={disabled}
                  onChange={(e) =>
                    patchQuestion(i, { scaleMax: Number(e.target.value) })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  1–5 scales write straight onto the rating ladder.
                </p>
              </div>
            )}

            {branchableValues(q).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Branching (default: next question)
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {branchableValues(q).map((v) => (
                    <div key={v} className="flex items-center gap-1.5">
                      <span className="text-xs w-20 truncate" title={v}>
                        “{v}” →
                      </span>
                      <Select
                        value={
                          q.branching[v] === undefined
                            ? 'next'
                            : q.branching[v] === 'end'
                              ? 'end'
                              : String(q.branching[v])
                        }
                        disabled={disabled}
                        onValueChange={(sel) => {
                          const branching = { ...q.branching }
                          if (sel === 'next') delete branching[v]
                          else if (sel === 'end') branching[v] = 'end'
                          else branching[v] = Number(sel)
                          patchQuestion(i, { branching })
                        }}
                      >
                        <SelectTrigger className="h-8 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="next">Next question</SelectItem>
                          <SelectItem value="end">End survey</SelectItem>
                          {value.questions.map((oq, oqi) =>
                            oqi !== i ? (
                              <SelectItem key={oqi} value={String(oqi)}>
                                Q{oqi + 1}
                                {oq.prompt
                                  ? `: ${oq.prompt.slice(0, 30)}`
                                  : ''}
                              </SelectItem>
                            ) : null,
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {value.activity_id != null && q.qtype !== 'open_text' && (
              <div className="flex items-center gap-2">
                <Switch
                  id={`wr-${i}`}
                  checked={q.write_rating}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    patchQuestion(i, { write_rating: checked })
                  }
                />
                <Label htmlFor={`wr-${i}`} className="text-xs">
                  Write answer to the ratings target
                </Label>
              </div>
            )}

            {value.activity_id != null && q.qtype !== 'open_text' && q.write_rating && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Write to</Label>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    disabled={disabled}
                    onClick={() => setCreateAssessmentTarget(i)}
                  >
                    + New assessment
                  </Button>
                </div>
                <Select
                  value={q.activity_id != null ? String(q.activity_id) : 'survey'}
                  disabled={disabled}
                  onValueChange={(v) =>
                    patchQuestion(i, { activity_id: v === 'survey' ? null : Number(v) })
                  }
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="survey">Survey target</SelectItem>
                    {activities.map((a) => (
                      <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                        {a.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Overrides the survey&apos;s ratings target for this question only.
                </p>
              </div>
            )}
          </div>
        ))}

        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={disabled}
          onClick={addQuestion}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add question
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="survey-completion">Completion message (optional)</Label>
        <Textarea
          id="survey-completion"
          rows={2}
          value={value.completion_body}
          disabled={disabled}
          onChange={(e) => patch({ completion_body: e.target.value })}
        />
      </div>

      {/* Settings */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Retries before handoff</Label>
          <Input
            type="number"
            min={0}
            max={5}
            className="h-8"
            value={value.retry_limit}
            disabled={disabled}
            onChange={(e) => patch({ retry_limit: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Nudge after (minutes)</Label>
          <Input
            type="number"
            min={10}
            className="h-8"
            value={value.question_timeout_minutes}
            disabled={disabled}
            onChange={(e) =>
              patch({ question_timeout_minutes: Number(e.target.value) })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Session expires after (hours)</Label>
          <Input
            type="number"
            min={1}
            className="h-8"
            value={value.session_ttl_hours}
            disabled={disabled}
            onChange={(e) => patch({ session_ttl_hours: Number(e.target.value) })}
          />
        </div>
      </div>

      {/* Live phone preview */}
      <div className="space-y-1.5">
        <Label>Preview</Label>
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 max-h-72 overflow-y-auto">
          {previewRows.length > 0 && (
            <PreviewBubble body={invitationPreview} />
          )}
          {previewRows.slice(1).map((row, i) => (
            <PreviewBubble key={i} body={renderQuestion(row)} />
          ))}
          {value.completion_body.trim() && (
            <PreviewBubble body={value.completion_body.trim()} />
          )}
        </div>
      </div>
    </div>
    <CreateAssessmentDialog
      campaignId={campaignId}
      open={createAssessmentTarget !== null}
      onOpenChange={(open) => {
        if (!open) setCreateAssessmentTarget(null)
      }}
      lockKind="assessment"
      onCreated={(activityId) => {
        if (createAssessmentTarget === 'survey') {
          patch({ activity_id: activityId })
        } else if (typeof createAssessmentTarget === 'number') {
          patchQuestion(createAssessmentTarget, { activity_id: activityId })
        }
        onActivityCreated?.(activityId)
        setCreateAssessmentTarget(null)
      }}
    />
    </>
  )
}

function PreviewBubble({ body }: { body: string }) {
  return (
    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white border px-3 py-2 text-sm whitespace-pre-wrap shadow-sm">
      {body}
    </div>
  )
}
