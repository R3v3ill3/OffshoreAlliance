"use client";

/**
 * The detected questions, editable: label, type, include-in-report. Only
 * the rows the user changed are sent (PATCH questions[]), so the route can
 * flag them `user_edited` and stop re-detection overwriting them.
 *
 *  * meta rows: "include" means "use as a breakdown" (cross-tab axis).
 *  * multi_select rows show the source columns they were grouped from and
 *    the free-text "other" column, if any.
 *  * identity rows can never be included — they are the columns that name
 *    a person and are only ever used for assessment mapping.
 *  * rows whose column vanished from the latest upload are muted.
 */

import { useMemo, useState } from "react";
import { Loader2, Lock, Save, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import {
  AN_SURVEY_QUESTION_TYPES,
  type AnSurveyQuestion,
  type AnSurveyQuestionPatch,
  type AnSurveyQuestionType,
} from "@/lib/an-surveys/types";
import { describeAnSurveyError, usePatchAnSurvey } from "@/lib/hooks/useAnSurveys";

interface RowEdit {
  label?: string;
  qtype?: AnSurveyQuestionType;
  include_in_report?: boolean;
}

export interface ReviewSchemaTableProps {
  importId: string;
  questions: AnSurveyQuestion[];
  canWrite: boolean;
  className?: string;
}

export function ReviewSchemaTable({ importId, questions, canWrite, className }: ReviewSchemaTableProps) {
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [error, setError] = useState<string | null>(null);
  const patch = usePatchAnSurvey(importId);

  const ordered = useMemo(() => [...questions].sort((a, b) => a.sort - b.sort), [questions]);

  const effective = (q: AnSurveyQuestion) => {
    const e = edits[q.qkey] ?? {};
    const qtype = e.qtype ?? q.qtype;
    return {
      label: e.label ?? q.label,
      qtype,
      // Identity can never be included, whatever was stored.
      include: qtype === "identity" ? false : (e.include_in_report ?? q.include_in_report),
    };
  };

  const setEdit = (q: AnSurveyQuestion, patchRow: RowEdit) => {
    setEdits((prev) => {
      const next = { ...(prev[q.qkey] ?? {}), ...patchRow };
      // Drop edits that restore the stored value so the diff stays honest.
      if (next.label !== undefined && next.label === q.label) delete next.label;
      if (next.qtype !== undefined && next.qtype === q.qtype) delete next.qtype;
      if (next.include_in_report !== undefined && next.include_in_report === q.include_in_report) {
        delete next.include_in_report;
      }
      const out = { ...prev };
      if (Object.keys(next).length === 0) delete out[q.qkey];
      else out[q.qkey] = next;
      return out;
    });
  };

  const changed: AnSurveyQuestionPatch[] = useMemo(
    () =>
      Object.entries(edits).map(([qkey, e]) => {
        const row: AnSurveyQuestionPatch = { qkey };
        if (e.label !== undefined) row.label = e.label.trim();
        if (e.qtype !== undefined) row.qtype = e.qtype;
        if (e.include_in_report !== undefined) row.include_in_report = e.include_in_report;
        return row;
      }),
    [edits]
  );

  const save = async () => {
    setError(null);
    try {
      await patch.mutateAsync({ questions: changed });
      setEdits({});
    } catch (e) {
      setError(describeAnSurveyError(e, "Could not save the questions"));
    }
  };

  if (ordered.length === 0) {
    return (
      <p className={cn("rounded-md border border-dashed p-6 text-sm text-muted-foreground", className)}>
        No questions yet — upload a CSV first.
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {ordered.filter((q) => effective(q).include).length} of {ordered.length} columns in the report.
          Metadata columns switched on become breakdowns for cross-tabs.
        </p>
        {canWrite && (
          <div className="flex items-center gap-2">
            {changed.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEdits({})} disabled={patch.isPending}>
                <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                Discard
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={changed.length === 0 || patch.isPending}
              onClick={() => void save()}
            >
              {patch.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" aria-hidden />
              )}
              Save {changed.length > 0 ? `${changed.length} change${changed.length === 1 ? "" : "s"}` : "changes"}
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56">Question</TableHead>
              <TableHead className="min-w-44">Type</TableHead>
              <TableHead className="min-w-56">Source columns</TableHead>
              <TableHead className="w-36 text-right">In report</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map((q) => {
              const eff = effective(q);
              const missing = q.missing_since != null;
              const isIdentity = eff.qtype === "identity";
              const dirty = edits[q.qkey] != null;
              return (
                <TableRow key={q.qkey} className={cn(missing && "opacity-60", dirty && "bg-primary/5")}>
                  <TableCell className="align-top">
                    {canWrite ? (
                      <Input
                        value={eff.label}
                        onChange={(e) => setEdit(q, { label: e.target.value })}
                        className="h-8 text-xs"
                        aria-label={`Label for ${q.qkey}`}
                      />
                    ) : (
                      <span className="text-sm">{eff.label}</span>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      <code className="rounded bg-muted px-1">{q.qkey}</code>
                      {q.user_edited && <span>· edited</span>}
                      {missing && (
                        <Badge variant="warning" className="font-normal">
                          column not in latest upload
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    {canWrite ? (
                      <Select
                        value={eff.qtype}
                        onValueChange={(v) => setEdit(q, { qtype: v as AnSurveyQuestionType })}
                      >
                        <SelectTrigger className="h-8 text-xs" aria-label={`Type for ${q.qkey}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AN_SURVEY_QUESTION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value} className="text-xs">
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">
                        {AN_SURVEY_QUESTION_TYPES.find((t) => t.value === eff.qtype)?.label ?? eff.qtype}
                      </span>
                    )}
                    {eff.qtype !== "free_text" && eff.qtype !== "identity" && q.options.length > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {q.options.length} option{q.options.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-1">
                      {q.source_columns.map((c) => (
                        <Badge key={c} variant="outline" className="font-normal">
                          {c}
                        </Badge>
                      ))}
                      {q.other_column && (
                        <Badge variant="secondary" className="font-normal" title="Free-text 'other' column">
                          other: {q.other_column}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-right">
                    {isIdentity ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                        title="Identity columns are never reported"
                      >
                        <Lock className="h-3 w-3" aria-hidden />
                        never
                      </span>
                    ) : (
                      <div className="inline-flex flex-col items-end gap-1">
                        <Switch
                          checked={eff.include}
                          disabled={!canWrite}
                          onCheckedChange={(v) => setEdit(q, { include_in_report: v })}
                          aria-label={`Include ${eff.label} in report`}
                        />
                        {eff.qtype === "meta" && (
                          <span className="text-[11px] text-muted-foreground">
                            {eff.include ? "Used as breakdown" : "Use as breakdown"}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
