"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BINARY_SUPPORTER_OUTCOME_OPTIONS } from "@/lib/campaign/constants";
import {
  isLikelyMetadataHeader,
  type ParticipationMappableField,
} from "@/lib/import/participation-import-shared";
import { useWallChartAssessmentOptions } from "../assessment-selector";
import { RatingTargetSelect } from "./rating-target-select";
import type { AssessmentChoice, QuestionMapping } from "./types";
import type { ParticipationImportController } from "./use-participation-import";

const NONE = "__none__";

const IDENTITY_FIELDS: { field: ParticipationMappableField; label: string }[] = [
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone / mobile" },
  { field: "first_name", label: "First name" },
  { field: "last_name", label: "Last name" },
  { field: "full_name", label: "Full name (single column)" },
];

/**
 * Step 2 — map identity columns, then map one or more survey questions
 * onto assessments (existing or new, incl. perception scales), and set
 * the conflict policy.
 */
export function StepMapping({
  campaignId,
  controller,
}: {
  campaignId: string;
  controller: ParticipationImportController;
}) {
  const {
    source,
    columnMap,
    setColumnMap,
    questions,
    addQuestion,
    removeQuestion,
    cleanupStats,
    conflictPolicy,
    setConflictPolicy,
    effectiveRows,
    importRows,
  } = controller;

  const questionHeaders = useMemo(
    () =>
      source?.kind === "csv"
        ? source.csv.headers.filter((h) => !isLikelyMetadataHeader(h))
        : [],
    [source]
  );
  const headers = source?.kind === "csv" ? source.csv.headers : [];

  const identityOk =
    source?.kind === "an" ||
    Boolean(
      columnMap.email ||
        columnMap.phone ||
        columnMap.full_name ||
        (columnMap.first_name && columnMap.last_name)
    );

  const notRecordedCount = importRows.length - effectiveRows.length;

  function setField(field: ParticipationMappableField, header: string | null) {
    setColumnMap({ ...columnMap, [field]: header ?? undefined });
  }

  return (
    <div className="space-y-5">
      {source?.kind === "csv" && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Worker identity columns</h3>
          <p className="text-xs text-muted-foreground">
            Used to match rows to worker records (email first, then phone, then
            name). At least email, phone, or a name is required.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {IDENTITY_FIELDS.map(({ field, label }) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Select
                  value={columnMap[field] ?? NONE}
                  onValueChange={(v) => setField(field, v === NONE ? null : v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} className="text-xs">
                      — not in file —
                    </SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {!identityOk && (
            <p className="text-xs text-destructive">
              Map at least an email, phone, or name column to continue.
            </p>
          )}
          {(cleanupStats.duplicatesCollapsed > 0 || cleanupStats.skippedNoIdentity > 0) && (
            <p className="text-xs text-muted-foreground">
              {cleanupStats.duplicatesCollapsed > 0 &&
                `${cleanupStats.duplicatesCollapsed} duplicate submission${cleanupStats.duplicatesCollapsed === 1 ? "" : "s"} collapsed (keeping the most recent). `}
              {cleanupStats.skippedNoIdentity > 0 &&
                `${cleanupStats.skippedNoIdentity} anonymous / identity-less row${cleanupStats.skippedNoIdentity === 1 ? "" : "s"} skipped.`}
            </p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              {source?.kind === "an" ? "Participation" : "Questions"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {source?.kind === "an"
                ? "Everyone who completed the action is recorded against one assessment."
                : "Map each survey question to its own assessment. Answers can also be kept verbatim as notes."}
            </p>
          </div>
          {source?.kind === "csv" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={addQuestion}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add question
            </Button>
          )}
        </div>

        {questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            campaignId={campaignId}
            controller={controller}
            question={q}
            index={i}
            questionHeaders={questionHeaders}
            canRemove={source?.kind === "csv" && questions.length > 1}
            onRemove={() => removeQuestion(q.id)}
          />
        ))}
      </section>

      {notRecordedCount > 0 && effectiveRows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {effectiveRows.length} row{effectiveRows.length === 1 ? "" : "s"} will be recorded;{" "}
          {notRecordedCount} ha{notRecordedCount === 1 ? "s" : "ve"} no mapped answers and will be
          skipped.
        </p>
      )}

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">If a worker already has an entry</h3>
        <RadioGroup
          value={conflictPolicy}
          onValueChange={(v) => setConflictPolicy(v as "overwrite" | "fill_blanks")}
          className="flex flex-col gap-1.5"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="overwrite" id="cp-overwrite" />
            <Label htmlFor="cp-overwrite" className="text-xs font-normal">
              Update it with the imported value (conflicts listed before applying)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="fill_blanks" id="cp-fill" />
            <Label htmlFor="cp-fill" className="text-xs font-normal">
              Keep the existing entry — only fill blanks
            </Label>
          </div>
        </RadioGroup>
      </section>
    </div>
  );
}

function QuestionCard({
  campaignId,
  controller,
  question,
  index,
  questionHeaders,
  canRemove,
  onRemove,
}: {
  campaignId: string;
  controller: ParticipationImportController;
  question: QuestionMapping;
  index: number;
  questionHeaders: string[];
  canRemove: boolean;
  onRemove: () => void;
}) {
  const {
    source,
    updateQuestion,
    setQuestionColumn,
    setQuestionValueTarget,
    setQuestionValueKeepNote,
  } = controller;
  const { data: options = [] } = useWallChartAssessmentOptions(campaignId);

  const a = question.assessment;
  const isBinary = a?.mode === "existing" ? a.option.is_binary : (a?.isBinary ?? true);
  const ratingLabels = a?.mode === "existing" ? a.option.rating_labels : null;

  const setAssessment = (next: AssessmentChoice | null) =>
    updateQuestion(question.id, { assessment: next });

  const defaultNewAssessment = (): AssessmentChoice => ({
    mode: "new",
    title:
      source?.kind === "an"
        ? `Participation — ${source.action.title}`
        : question.column
          ? question.column
          : "",
    isBinary: true,
    supporterOutcomeValue: "yes",
    isPerception: false,
    useAnswerLabels: true,
  });

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          {source?.kind === "an" ? "Participation" : `Question ${index + 1}`}
        </span>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-muted-foreground"
            onClick={onRemove}
            aria-label="Remove question"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>

      {source?.kind === "csv" && (
        <div className="space-y-1">
          <Label className="text-xs">Answer column</Label>
          <Select
            value={question.column ?? NONE}
            onValueChange={(v) => setQuestionColumn(question.id, v === NONE ? null : v)}
          >
            <SelectTrigger className="h-8 w-full max-w-md text-xs">
              <SelectValue placeholder="Choose column…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-xs">
                — no column — record the same value for every row
              </SelectItem>
              {questionHeaders.map((h) => (
                <SelectItem key={h} value={h} className="text-xs">
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Target assessment ── */}
      <div className="space-y-2">
        <Label className="text-xs">Records to assessment</Label>
        <RadioGroup
          value={a?.mode ?? "new"}
          onValueChange={(v) => {
            if (v === "existing") {
              const linkedId =
                source?.kind === "an" ? source.action.linked_activity_id : null;
              const preferred =
                (linkedId != null ? options.find((o) => o.activity_id === linkedId) : null) ??
                options[0];
              if (preferred) setAssessment({ mode: "existing", option: preferred });
            } else {
              setAssessment(defaultNewAssessment());
            }
          }}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="new" id={`${question.id}-new`} />
            <Label htmlFor={`${question.id}-new`} className="text-xs font-normal">
              Create a new assessment
            </Label>
          </div>
          {(a == null || a.mode === "new") && (
            <NewAssessmentFields
              question={question}
              assessment={a?.mode === "new" ? a : null}
              onChange={setAssessment}
              ensureDefault={defaultNewAssessment}
            />
          )}
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="existing"
              id={`${question.id}-existing`}
              disabled={options.length === 0}
            />
            <Label htmlFor={`${question.id}-existing`} className="text-xs font-normal">
              Update an existing assessment
            </Label>
          </div>
          {a?.mode === "existing" && (
            <div className="pl-6">
              <Select
                value={String(a.option.activity_id)}
                onValueChange={(v) => {
                  const option = options.find((o) => o.activity_id === Number(v));
                  if (option) setAssessment({ mode: "existing", option });
                }}
              >
                <SelectTrigger className="h-8 w-full max-w-md text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.activity_id} value={String(o.activity_id)} className="text-xs">
                      {o.title}
                      {o.is_binary ? " (yes/no)" : " (1–5)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </RadioGroup>
      </div>

      {/* ── Value mapping ── */}
      {a != null &&
        (question.column ? (
          <div className="rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-2 font-medium">Answer</th>
                  <th className="p-2 font-medium">Rows</th>
                  <th className="p-2 font-medium">Record as</th>
                  <th className="p-2 font-medium" title="Keep the verbatim answer as a note on the entry">
                    Keep as note
                  </th>
                </tr>
              </thead>
              <tbody>
                {question.valueMappings.map((m) => (
                  <tr key={m.rawValue} className="border-b last:border-0">
                    <td className="max-w-52 truncate p-2" title={m.rawValue}>
                      {m.rawValue === "" ? (
                        <em className="text-muted-foreground">(blank)</em>
                      ) : (
                        m.rawValue
                      )}
                    </td>
                    <td className="p-2 tabular-nums">{m.count}</td>
                    <td className="p-2">
                      <RatingTargetSelect
                        value={m.target}
                        onChange={(target) => setQuestionValueTarget(question.id, m.rawValue, target)}
                        isBinary={isBinary}
                        ratingLabels={ratingLabels}
                        allowIgnore
                      />
                    </td>
                    <td className="p-2">
                      <Checkbox
                        checked={m.keepNote}
                        disabled={m.target.kind === "ignore"}
                        onCheckedChange={(checked) =>
                          setQuestionValueKeepNote(question.id, m.rawValue, checked === true)
                        }
                        aria-label={`Keep "${m.rawValue}" as note`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Label className="text-xs">Record every row as</Label>
            <RatingTargetSelect
              value={question.fixedTarget}
              onChange={(fixedTarget) => updateQuestion(question.id, { fixedTarget })}
              isBinary={isBinary}
              ratingLabels={ratingLabels}
            />
          </div>
        ))}

      {/* ── Non-responders ── */}
      {a != null && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${question.id}-nr`}
              checked={question.nonResponders.enabled}
              onCheckedChange={(checked) =>
                updateQuestion(question.id, {
                  nonResponders: { ...question.nonResponders, enabled: checked === true },
                })
              }
            />
            <Label htmlFor={`${question.id}-nr`} className="text-xs font-normal">
              Also record a value for workforce members <strong>not</strong> in this import
              (never overwrites an existing entry)
            </Label>
          </div>
          {question.nonResponders.enabled && (
            <div className="flex items-center gap-3 pl-6">
              <Label className="text-xs">Record non-responders as</Label>
              <RatingTargetSelect
                value={question.nonResponders.target}
                onChange={(target) =>
                  updateQuestion(question.id, {
                    nonResponders: { ...question.nonResponders, target },
                  })
                }
                isBinary={isBinary}
                ratingLabels={ratingLabels}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewAssessmentFields({
  question,
  assessment,
  onChange,
  ensureDefault,
}: {
  question: QuestionMapping;
  assessment: Extract<AssessmentChoice, { mode: "new" }> | null;
  onChange: (next: AssessmentChoice) => void;
  ensureDefault: () => AssessmentChoice;
}) {
  const a =
    assessment ?? (ensureDefault() as Extract<AssessmentChoice, { mode: "new" }>);
  const patch = (p: Partial<Extract<AssessmentChoice, { mode: "new" }>>) =>
    onChange({ ...a, ...p });

  return (
    <div className="space-y-2 pl-6">
      <div className="space-y-1">
        <Label htmlFor={`${question.id}-title`} className="text-xs">
          Title
        </Label>
        <Input
          id={`${question.id}-title`}
          value={a.title}
          placeholder="e.g. PA ballot — voting intention"
          className="h-8 max-w-md text-xs"
          onChange={(e) => patch({ title: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id={`${question.id}-binary`}
            checked={a.isBinary}
            onCheckedChange={(checked) => patch({ isBinary: checked })}
          />
          <Label htmlFor={`${question.id}-binary`} className="text-xs font-normal">
            Binary (yes / no / maybe) — untick for a 1–5 scale
          </Label>
        </div>
        {a.isBinary ? (
          <div className="flex items-center gap-2">
            <Label className="text-xs">Supportive outcome</Label>
            <Select
              value={a.supporterOutcomeValue}
              onValueChange={(v) => patch({ supporterOutcomeValue: v })}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BINARY_SUPPORTER_OUTCOME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          question.column && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${question.id}-labels`}
                checked={a.useAnswerLabels}
                onCheckedChange={(checked) => patch({ useAnswerLabels: checked === true })}
              />
              <Label htmlFor={`${question.id}-labels`} className="text-xs font-normal">
                Label the 1–5 scale with the answers
              </Label>
            </div>
          )
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={`${question.id}-perception`}
          checked={a.isPerception}
          onCheckedChange={(checked) => patch({ isPerception: checked })}
        />
        <Label htmlFor={`${question.id}-perception`} className="text-xs font-normal">
          Perception question (about others — excluded from workers&apos; cumulative
          support ratings)
        </Label>
      </div>
    </div>
  );
}
