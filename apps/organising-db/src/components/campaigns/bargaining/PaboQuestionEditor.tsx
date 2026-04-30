"use client";

import { useState } from "react";
import { Plus, Pencil, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PaboBallotQuestion, BallotQuestionOutcome } from "@/hooks/usePaboApplications";

// ── Types ──────────────────────────────────────────────────────────────────

interface PaboQuestionEditorProps {
  paboId: number;
  questions: PaboBallotQuestion[];
  canWrite: boolean;
  onAddQuestion: (params: {
    pabo_id: number;
    question_order: number;
    question_text: string;
    action_type?: string | null;
  }) => Promise<unknown>;
  onUpdateQuestion: (params: {
    question_id: number;
    pabo_id: number;
    question_text?: string;
    action_type?: string | null;
    votes_yes?: number | null;
    votes_no?: number | null;
    informal_count?: number | null;
    outcome?: BallotQuestionOutcome | null;
  }) => Promise<unknown>;
  isSaving?: boolean;
}

interface QuestionFormState {
  question_text: string;
  action_type: string;
  votes_yes: string;
  votes_no: string;
  informal_count: string;
  outcome: BallotQuestionOutcome | "";
}

const EMPTY_FORM: QuestionFormState = {
  question_text: "",
  action_type: "",
  votes_yes: "",
  votes_no: "",
  informal_count: "",
  outcome: "",
};

// ── Outcome badge ──────────────────────────────────────────────────────────

const OUTCOME_VARIANT: Record<
  BallotQuestionOutcome,
  "success" | "destructive" | "secondary" | "outline"
> = {
  carried: "success",
  failed: "destructive",
  pending: "secondary",
  withdrawn: "outline",
};

function OutcomeBadge({ outcome }: { outcome: BallotQuestionOutcome | null }) {
  if (!outcome) return <Badge variant="secondary">Pending</Badge>;
  return (
    <Badge variant={OUTCOME_VARIANT[outcome]}>
      {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
    </Badge>
  );
}

// ── Inline edit row ────────────────────────────────────────────────────────

function QuestionRow({
  question,
  canWrite,
  onUpdate,
  isSaving,
}: {
  question: PaboBallotQuestion;
  canWrite: boolean;
  onUpdate: (params: Parameters<PaboQuestionEditorProps["onUpdateQuestion"]>[0]) => Promise<unknown>;
  isSaving?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<QuestionFormState>({
    question_text: question.question_text,
    action_type: question.action_type ?? "",
    votes_yes: question.votes_yes != null ? String(question.votes_yes) : "",
    votes_no: question.votes_no != null ? String(question.votes_no) : "",
    informal_count:
      question.informal_count != null ? String(question.informal_count) : "",
    outcome: question.outcome ?? "",
  });

  function handleSave() {
    const updates: Parameters<PaboQuestionEditorProps["onUpdateQuestion"]>[0] = {
      question_id: question.question_id,
      pabo_id: question.pabo_id,
      question_text: form.question_text || question.question_text,
      action_type: form.action_type || null,
      votes_yes: form.votes_yes !== "" ? Number(form.votes_yes) : null,
      votes_no: form.votes_no !== "" ? Number(form.votes_no) : null,
      informal_count: form.informal_count !== "" ? Number(form.informal_count) : null,
      outcome: (form.outcome as BallotQuestionOutcome) || null,
    };
    onUpdate(updates).then(() => setEditing(false));
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-3 py-3 border-b last:border-0">
        <span className="text-muted-foreground text-sm font-mono w-6 shrink-0 pt-0.5">
          {question.question_order}.
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm">{question.question_text}</p>
          {question.action_type && (
            <p className="text-xs text-muted-foreground">
              Action type: {question.action_type}
            </p>
          )}
          {(question.votes_yes != null || question.votes_no != null) && (
            <p className="text-xs text-muted-foreground">
              Yes: {question.votes_yes ?? "—"} &nbsp;·&nbsp; No:{" "}
              {question.votes_no ?? "—"}
              {question.informal_count != null &&
                ` · Informal: ${question.informal_count}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <OutcomeBadge outcome={question.outcome} />
          {canWrite && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="py-3 border-b last:border-0 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="font-mono">Q{question.question_order}</span>
        <span>— editing</span>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Question text</Label>
        <Textarea
          value={form.question_text}
          onChange={(e) => setForm({ ...form, question_text: e.target.value })}
          rows={2}
          className="text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Action type (optional)</Label>
        <Input
          value={form.action_type}
          onChange={(e) => setForm({ ...form, action_type: e.target.value })}
          placeholder="e.g. stop-work, overtime ban"
          className="text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Votes yes</Label>
          <Input
            type="number"
            min={0}
            value={form.votes_yes}
            onChange={(e) => setForm({ ...form, votes_yes: e.target.value })}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Votes no</Label>
          <Input
            type="number"
            min={0}
            value={form.votes_no}
            onChange={(e) => setForm({ ...form, votes_no: e.target.value })}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Informal</Label>
          <Input
            type="number"
            min={0}
            value={form.informal_count}
            onChange={(e) =>
              setForm({ ...form, informal_count: e.target.value })
            }
            className="text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Outcome override</Label>
        <Select
          value={form.outcome}
          onValueChange={(v) =>
            setForm({ ...form, outcome: v as BallotQuestionOutcome | "" })
          }
        >
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Auto (from vote counts)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Auto (from vote counts)</SelectItem>
            <SelectItem value="carried">Carried</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          <Check className="h-3.5 w-3.5" />
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
          disabled={isSaving}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function PaboQuestionEditor({
  paboId,
  questions,
  canWrite,
  onAddQuestion,
  onUpdateQuestion,
  isSaving,
}: PaboQuestionEditorProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<
    Pick<QuestionFormState, "question_text" | "action_type">
  >({ question_text: "", action_type: "" });

  function handleAddSubmit() {
    if (!addForm.question_text.trim()) return;
    const nextOrder =
      questions.length > 0
        ? Math.max(...questions.map((q) => q.question_order)) + 1
        : 1;
    onAddQuestion({
      pabo_id: paboId,
      question_order: nextOrder,
      question_text: addForm.question_text.trim(),
      action_type: addForm.action_type.trim() || null,
    }).then(() => {
      setAddForm({ question_text: "", action_type: "" });
      setShowAddForm(false);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Ballot Questions</CardTitle>
        {canWrite && !showAddForm && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-4 w-4" />
            Add question
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-0 pb-4">
        {questions.length === 0 && !showAddForm && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No ballot questions yet.
            {canWrite && " Click 'Add question' to draft the first one."}
          </p>
        )}

        {questions.map((q) => (
          <QuestionRow
            key={q.question_id}
            question={q}
            canWrite={canWrite}
            onUpdate={onUpdateQuestion}
            isSaving={isSaving}
          />
        ))}

        {showAddForm && (
          <div className="pt-3 space-y-3 border-t mt-2">
            <p className="text-sm font-medium text-muted-foreground">
              Question {questions.length + 1}
            </p>
            <div className="space-y-2">
              <Label className="text-xs">Question text *</Label>
              <Textarea
                value={addForm.question_text}
                onChange={(e) =>
                  setAddForm({ ...addForm, question_text: e.target.value })
                }
                rows={2}
                placeholder="Do you authorise industrial action consisting of…"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Action type (optional)</Label>
              <Input
                value={addForm.action_type}
                onChange={(e) =>
                  setAddForm({ ...addForm, action_type: e.target.value })
                }
                placeholder="e.g. stop-work meeting, work bans"
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAddSubmit}
                disabled={!addForm.question_text.trim() || isSaving}
              >
                <Check className="h-3.5 w-3.5" />
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowAddForm(false);
                  setAddForm({ question_text: "", action_type: "" });
                }}
                disabled={isSaving}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
