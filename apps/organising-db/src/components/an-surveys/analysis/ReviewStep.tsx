"use client";

/**
 * Steps 1 and 2 of the AI analysis, then the trigger for step 3.
 *
 *  1. "Review data" — the model reads the schema and a sample, returns a
 *     summary, data-quality notes, schema suggestions (each applied with a
 *     PATCH on that one qkey) and up to six clarifying questions.
 *  2. The clarifying questions become a form; with audience / tone /
 *     free-text theming / notes they make the ExtractionBrief.
 *  3. "Generate report" posts {extraction_brief, review} to generate.
 *
 * The model never emits numbers we keep — the dashboard draws the app's own
 * aggregates beside every insight — so this step is about *what to look
 * at*, not *what the answers are*.
 */

import { useMemo, useState } from "react";
import { Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import type { ClarifyingQuestion, ExtractionBrief, ReviewOutput } from "@/lib/an-surveys/schemas";
import { AN_SURVEY_QUESTION_TYPES, type AnSurveyQuestion } from "@/lib/an-surveys/types";
import {
  describeAnSurveyError,
  useGenerateAnSurveyReport,
  usePatchAnSurvey,
  useReviewAnSurvey,
} from "@/lib/hooks/useAnSurveys";

const AUDIENCES: { value: ExtractionBrief["audience"]; label: string }[] = [
  { value: "organisers", label: "Organisers" },
  { value: "members", label: "Members" },
  { value: "delegates", label: "Delegates" },
  { value: "external", label: "External" },
];

type AnswerState = Record<string, string | string[]>;

export interface ReviewStepProps {
  importId: string;
  questions: AnSurveyQuestion[];
  canWrite: boolean;
  /** Fired after a report has been generated. */
  onGenerated: () => void;
  /** Pre-fill from a previous run (Start over keeps the answers editable). */
  initialReview?: ReviewOutput | null;
  initialBrief?: ExtractionBrief | null;
  className?: string;
}

export function ReviewStep({
  importId,
  questions,
  canWrite,
  onGenerated,
  initialReview = null,
  initialBrief = null,
  className,
}: ReviewStepProps) {
  const [review, setReview] = useState<ReviewOutput | null>(initialReview);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<AnswerState>(() => seedAnswers(initialReview, initialBrief));
  const [audience, setAudience] = useState<ExtractionBrief["audience"]>(initialBrief?.audience ?? "organisers");
  const [tone, setTone] = useState(initialBrief?.tone ?? "");
  const [theming, setTheming] = useState(initialBrief?.free_text_theming ?? true);
  const [notes, setNotes] = useState(initialBrief?.notes ?? "");
  const [focus, setFocus] = useState<Set<string>>(new Set(initialBrief?.focus_qkeys ?? []));
  const [error, setError] = useState<string | null>(null);

  const reviewMutation = useReviewAnSurvey(importId);
  const generate = useGenerateAnSurveyReport(importId);
  const patch = usePatchAnSurvey(importId);

  const busy = reviewMutation.isPending || generate.isPending;
  const questionByKey = useMemo(() => new Map(questions.map((q) => [q.qkey, q])), [questions]);
  const reportable = useMemo(
    () =>
      [...questions]
        .sort((a, b) => a.sort - b.sort)
        .filter((q) => q.include_in_report && q.qtype !== "identity"),
    [questions]
  );

  const runReview = async () => {
    setError(null);
    try {
      const res = await reviewMutation.mutateAsync();
      setReview(res.review);
      setApplied(new Set());
      setAnswers(seedAnswers(res.review, null));
    } catch (e) {
      setError(describeAnSurveyError(e, "The AI review failed"));
    }
  };

  const applySuggestion = async (s: ReviewOutput["schema_suggestions"][number]) => {
    setError(null);
    try {
      await patch.mutateAsync({
        questions: [
          {
            qkey: s.qkey,
            ...(s.suggested_type ? { qtype: s.suggested_type } : {}),
            ...(s.suggested_label ? { label: s.suggested_label } : {}),
          },
        ],
      });
      setApplied((prev) => new Set(prev).add(s.qkey));
    } catch (e) {
      setError(describeAnSurveyError(e, "Could not apply the suggestion"));
    }
  };

  const brief: ExtractionBrief = useMemo(
    () => ({
      answers: (review?.clarifying_questions ?? []).map((cq) => {
        const a = answers[cq.id];
        return {
          id: cq.id,
          question: cq.question,
          answer: Array.isArray(a) ? a.join("; ") : (a ?? ""),
        };
      }),
      focus_qkeys: [...focus],
      audience,
      tone: tone.trim() ? tone.trim() : null,
      free_text_theming: theming,
      notes: notes.trim() ? notes.trim() : null,
    }),
    [review, answers, focus, audience, tone, theming, notes]
  );

  const runGenerate = async () => {
    setError(null);
    try {
      await generate.mutateAsync({ extraction_brief: brief, review });
      onGenerated();
    } catch (e) {
      setError(describeAnSurveyError(e, "Report generation failed"));
    }
  };

  if (!canWrite) {
    return (
      <p className={cn("rounded-md border border-dashed p-6 text-sm text-muted-foreground", className)}>
        Running the analysis needs write access. Ask an organiser to generate the report.
      </p>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Step 1 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" aria-hidden />
            1. Review the data
          </CardTitle>
          <CardDescription>
            The AI reads the question list and a sample of anonymised answers, checks the detected types, and asks
            what you want out of the report. Identity columns are never sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {reviewMutation.isPending ? (
            <div className="flex items-center gap-3 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              <EurekaLoadingSpinner size="sm" />
              Reviewing the data…
            </div>
          ) : (
            <Button type="button" onClick={() => void runReview()} disabled={busy}>
              {review ? "Review again" : "Review data"}
            </Button>
          )}

          {review && !reviewMutation.isPending && (
            <div className="space-y-3">
              <p className="whitespace-pre-line text-sm">{review.summary}</p>

              {review.data_quality_notes.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Data quality
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {review.data_quality_notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {review.schema_suggestions.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Suggested changes to the questions
                  </p>
                  <ul className="space-y-1.5">
                    {review.schema_suggestions.map((s) => {
                      const q = questionByKey.get(s.qkey);
                      const done = applied.has(s.qkey);
                      const nothingToApply = !s.suggested_type && !s.suggested_label;
                      return (
                        <li
                          key={s.qkey}
                          className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2 text-sm"
                        >
                          <div className="min-w-48 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium">{q?.label ?? s.qkey}</span>
                              {s.suggested_type && (
                                <Badge variant="outline" className="font-normal">
                                  → {AN_SURVEY_QUESTION_TYPES.find((t) => t.value === s.suggested_type)?.label ?? s.suggested_type}
                                </Badge>
                              )}
                              {s.suggested_label && (
                                <Badge variant="outline" className="font-normal">
                                  rename → “{s.suggested_label}”
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{s.reason}</p>
                          </div>
                          {!nothingToApply && (
                            <Button
                              type="button"
                              size="sm"
                              variant={done ? "ghost" : "outline"}
                              disabled={done || patch.isPending || busy}
                              onClick={() => void applySuggestion(s)}
                            >
                              {done ? (
                                <>
                                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                                  Applied
                                </>
                              ) : (
                                "Apply"
                              )}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2 + 3 */}
      {review && !reviewMutation.isPending && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4" aria-hidden />
              2. What should the report draw out?
            </CardTitle>
            <CardDescription>
              Your answers become the brief the report is written to. It is saved with the report, so a refreshed CSV
              can re-run the same brief without asking again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {review.clarifying_questions.map((cq) => (
              <ClarifyingField
                key={cq.id}
                question={cq}
                value={answers[cq.id]}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [cq.id]: v }))}
                disabled={busy}
              />
            ))}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <Select
                  value={audience}
                  onValueChange={(v) => setAudience(v as ExtractionBrief["audience"])}
                  disabled={busy}
                >
                  <SelectTrigger aria-label="Audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="an-survey-tone">Tone (optional)</Label>
                <Input
                  id="an-survey-tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="e.g. plain, upbeat, for a members' meeting"
                  maxLength={200}
                  disabled={busy}
                />
              </div>
            </div>

            {reportable.length > 0 && (
              <div className="space-y-1.5">
                <Label>Focus on these questions (optional — blank means all)</Label>
                <div className="flex flex-wrap gap-2">
                  {reportable.map((q) => {
                    const on = focus.has(q.qkey);
                    return (
                      <label
                        key={q.qkey}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                          on && "border-primary bg-primary/5"
                        )}
                      >
                        <Checkbox
                          checked={on}
                          disabled={busy}
                          onCheckedChange={(v) =>
                            setFocus((prev) => {
                              const next = new Set(prev);
                              if (v === true) next.add(q.qkey);
                              else next.delete(q.qkey);
                              return next;
                            })
                          }
                        />
                        {q.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <Label htmlFor="an-survey-theming">Theme the free-text answers</Label>
                <p className="text-xs text-muted-foreground">
                  Groups open comments into themes; the app counts how many responses fall in each.
                </p>
              </div>
              <Switch id="an-survey-theming" checked={theming} onCheckedChange={setTheming} disabled={busy} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="an-survey-notes">Anything else the report should know? (optional)</Label>
              <Textarea
                id="an-survey-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Context, what decision this feeds, anything to avoid…"
                disabled={busy}
              />
            </div>

            {generate.isPending ? (
              <div className="flex items-center gap-3 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                <EurekaLoadingSpinner size="sm" />
                Writing the report… this can take a minute.
              </div>
            ) : (
              <div className="flex justify-end">
                <Button type="button" onClick={() => void runGenerate()} disabled={busy}>
                  {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                  3. Generate report
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function seedAnswers(review: ReviewOutput | null, brief: ExtractionBrief | null): AnswerState {
  const out: AnswerState = {};
  if (!review) return out;
  const prior = new Map((brief?.answers ?? []).map((a) => [a.id, a.answer]));
  for (const cq of review.clarifying_questions) {
    const p = prior.get(cq.id);
    if (p == null) continue;
    out[cq.id] = cq.kind === "multi" ? p.split("; ").filter(Boolean) : p;
  }
  return out;
}

function ClarifyingField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: ClarifyingQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  disabled: boolean;
}) {
  if (question.kind === "single") {
    // Radios up to four options; a select beyond that keeps the form short.
    if (question.options.length <= 4) {
      return (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{question.question}</legend>
          <RadioGroup
            value={typeof value === "string" ? value : ""}
            onValueChange={onChange}
            disabled={disabled}
            className="gap-1.5"
          >
            {question.options.map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={o} />
                {o}
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      );
    }
    return (
      <div className="space-y-1.5">
        <Label>{question.question}</Label>
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {question.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (question.kind === "multi") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{question.question}</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {question.options.map((o) => {
            const on = chosen.includes(o);
            return (
              <label key={o} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={on}
                  disabled={disabled}
                  onCheckedChange={(v) => onChange(v === true ? [...chosen, o] : chosen.filter((c) => c !== o))}
                />
                {o}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`cq-${question.id}`}>{question.question}</Label>
      <Textarea
        id={`cq-${question.id}`}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={2000}
        disabled={disabled}
      />
    </div>
  );
}
