"use client";

import { CheckCircle2, XCircle, Clock, MinusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PaboBallotQuestion, BallotQuestionOutcome } from "@/hooks/usePaboApplications";

// ── Helpers ────────────────────────────────────────────────────────────────

function votePct(
  votes: number | null | undefined,
  total: number | null | undefined,
): string {
  if (votes == null || !total || total === 0) return "—";
  return `${Math.round((votes / total) * 100)}%`;
}

function totalVotes(q: PaboBallotQuestion): number | null {
  if (q.votes_yes == null && q.votes_no == null) return null;
  return (q.votes_yes ?? 0) + (q.votes_no ?? 0) + (q.informal_count ?? 0);
}

// ── Outcome icon ───────────────────────────────────────────────────────────

function OutcomeIcon({ outcome }: { outcome: BallotQuestionOutcome | null }) {
  switch (outcome) {
    case "carried":
      return <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-destructive shrink-0" />;
    case "withdrawn":
      return <MinusCircle className="h-5 w-5 text-muted-foreground shrink-0" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground shrink-0" />;
  }
}

const OUTCOME_VARIANT: Record<
  BallotQuestionOutcome,
  "success" | "destructive" | "secondary" | "outline"
> = {
  carried: "success",
  failed: "destructive",
  pending: "secondary",
  withdrawn: "outline",
};

function outcomeLabel(outcome: BallotQuestionOutcome | null): string {
  if (!outcome) return "Pending";
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

// ── Summary row ────────────────────────────────────────────────────────────

function QuestionResultRow({ question }: { question: PaboBallotQuestion }) {
  const total = totalVotes(question);
  const yesPct =
    question.votes_yes != null && total
      ? Math.round((question.votes_yes / total) * 100)
      : null;

  return (
    <div className="space-y-2 py-3 border-b last:border-0">
      <div className="flex items-start gap-3">
        <OutcomeIcon outcome={question.outcome} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium">
              Q{question.question_order}. {question.question_text}
            </p>
            <Badge
              variant={
                question.outcome
                  ? OUTCOME_VARIANT[question.outcome]
                  : "secondary"
              }
              className="shrink-0"
            >
              {outcomeLabel(question.outcome)}
            </Badge>
          </div>
          {question.action_type && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {question.action_type}
            </p>
          )}
        </div>
      </div>

      {(question.votes_yes != null || question.votes_no != null) && (
        <div className="ml-8 space-y-1.5">
          {/* Yes bar */}
          <div className="flex items-center gap-2 text-xs">
            <span className="w-8 text-right text-muted-foreground">Yes</span>
            <div className="flex-1">
              <Progress
                value={yesPct ?? 0}
                className="h-2"
              />
            </div>
            <span className="w-20 text-muted-foreground tabular-nums">
              {question.votes_yes ?? "—"} ({votePct(question.votes_yes, total)})
            </span>
          </div>

          {/* No bar */}
          <div className="flex items-center gap-2 text-xs">
            <span className="w-8 text-right text-muted-foreground">No</span>
            <div className="flex-1">
              <Progress
                value={
                  question.votes_no != null && total
                    ? Math.round((question.votes_no / total) * 100)
                    : 0
                }
                className="h-2 [&>div]:bg-destructive"
              />
            </div>
            <span className="w-20 text-muted-foreground tabular-nums">
              {question.votes_no ?? "—"} ({votePct(question.votes_no, total)})
            </span>
          </div>

          {question.informal_count != null && (
            <p className="text-xs text-muted-foreground ml-10">
              Informal: {question.informal_count}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface PaboResultsCardProps {
  questions: PaboBallotQuestion[];
}

export function PaboResultsCard({ questions }: PaboResultsCardProps) {
  const carried = questions.filter((q) => q.outcome === "carried").length;
  const failed = questions.filter((q) => q.outcome === "failed").length;
  const pending = questions.filter(
    (q) => !q.outcome || q.outcome === "pending",
  ).length;

  if (questions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Ballot Results</CardTitle>
          <div className="flex gap-2 flex-wrap">
            {carried > 0 && (
              <Badge variant="success">
                {carried} carried
              </Badge>
            )}
            {failed > 0 && (
              <Badge variant="destructive">
                {failed} failed
              </Badge>
            )}
            {pending > 0 && (
              <Badge variant="secondary">
                {pending} pending
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-0 pb-4">
        {questions.map((q) => (
          <QuestionResultRow key={q.question_id} question={q} />
        ))}
      </CardContent>
    </Card>
  );
}
