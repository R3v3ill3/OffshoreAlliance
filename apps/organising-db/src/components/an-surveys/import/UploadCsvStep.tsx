"use client";

/**
 * Upload (or re-upload) the Action Network CSV export for one import.
 *
 * Used twice: as the first step after an import is created, and as
 * "Refresh" on an existing one. The route replaces the current batch, so a
 * refresh shows what changed (rows, respondents, header diff) and — when a
 * report already exists with a saved brief — offers to re-run step 3 with
 * that brief so the narrative catches up without another interview.
 */

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { cn } from "@/lib/utils/cn";
import type { AnSurveyImportConflict, AnSurveyImportResponse } from "@/lib/an-surveys/types";
import {
  describeAnSurveyError,
  useGenerateAnSurveyReport,
  useImportAnSurveyCsv,
} from "@/lib/hooks/useAnSurveys";

export interface UploadCsvStepProps {
  importId: string;
  /** "first" = no batch yet; "refresh" = replacing the current batch. */
  mode: "first" | "refresh";
  /** Called once the user is done with this step (after upload, and after any regenerate). */
  onDone: (result: AnSurveyImportResponse) => void;
  /** Optional escape hatch shown before a file is chosen (e.g. "Skip for now"). */
  onSkip?: () => void;
  className?: string;
}

type Phase =
  | { kind: "pick" }
  | { kind: "uploading"; file: File; confirm: boolean }
  | { kind: "conflict"; file: File; conflict: AnSurveyImportConflict }
  | { kind: "done"; result: AnSurveyImportResponse }
  | { kind: "regenerating"; result: AnSurveyImportResponse };

export function UploadCsvStep({ importId, mode, onDone, onSkip, className }: UploadCsvStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  const importCsv = useImportAnSurveyCsv(importId);
  const generate = useGenerateAnSurveyReport(importId);

  const upload = useCallback(
    async (file: File, confirm: boolean) => {
      setError(null);
      setPhase({ kind: "uploading", file, confirm });
      try {
        const result = await importCsv.mutateAsync({ file, confirm });
        if (result.kind === "conflict") {
          setPhase({ kind: "conflict", file, conflict: result.conflict });
          return;
        }
        setPhase({ kind: "done", result: result.data });
      } catch (e) {
        setError(describeAnSurveyError(e, "Upload failed"));
        setPhase({ kind: "pick" });
      }
    },
    [importCsv]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void upload(file, false);
    },
    [upload]
  );

  const regenerate = useCallback(
    async (result: AnSurveyImportResponse) => {
      setError(null);
      setPhase({ kind: "regenerating", result });
      try {
        await generate.mutateAsync({ reuse_current: true });
        onDone(result);
      } catch (e) {
        setError(describeAnSurveyError(e, "Re-running the analysis failed"));
        setPhase({ kind: "done", result });
      }
    },
    [generate, onDone]
  );

  const busy = phase.kind === "uploading" || phase.kind === "regenerating";

  return (
    <div className={cn("space-y-4", className)}>
      {phase.kind === "pick" && (
        <>
          <p className="text-sm text-muted-foreground">
            {mode === "first"
              ? "Upload the report export from Action Network (CSV or Excel). The columns become the questions; identity columns are kept only for assessment mapping and never reach the AI."
              : "Upload a newer export to replace the current data. AN exports are cumulative, so the new file supersedes the old one; the questions and any saved report brief are kept."}
          </p>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
            <div className="text-sm font-medium">Drop the Action Network export here</div>
            <div className="text-xs text-muted-foreground">or click to browse — .csv, .xlsx or .xls (10 MB max)</div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              In Action Network: open the form or survey → <em>Reports</em> → download the CSV. Question
              answers are only included in report exports. Checkbox options usually arrive as their own
              columns with a value of 1.
            </span>
          </div>
          {onSkip && (
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
                Skip for now
              </Button>
            </div>
          )}
        </>
      )}

      {phase.kind === "uploading" && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-10 text-sm text-muted-foreground">
          <EurekaLoadingSpinner size="md" />
          <span>
            Uploading and reading <span className="font-medium text-foreground">{phase.file.name}</span>…
          </span>
        </div>
      )}

      {phase.kind === "conflict" && (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">This file looks like a different form</p>
              <p className="text-muted-foreground">{phase.conflict.error}</p>
            </div>
          </div>
          <HeaderDiff diff={phase.conflict.header_diff} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPhase({ kind: "pick" })}>
              Choose another file
            </Button>
            <Button type="button" size="sm" onClick={() => void upload(phase.file, true)}>
              Import anyway
            </Button>
          </div>
        </div>
      )}

      {(phase.kind === "done" || phase.kind === "regenerating") && (
        <div className="space-y-3 rounded-md border p-4 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">
                {phase.result.batch.file_name ?? "File"} imported
              </p>
              <p className="text-muted-foreground">
                {phase.result.batch.row_count.toLocaleString()} rows ·{" "}
                {phase.result.batch.response_count.toLocaleString()} respondents ·{" "}
                {phase.result.batch.duplicate_count.toLocaleString()} duplicate
                {phase.result.batch.duplicate_count === 1 ? "" : "s"} collapsed ·{" "}
                {phase.result.questions.filter((q) => q.include_in_report).length} questions in the report
              </p>
            </div>
          </div>
          {phase.result.header_diff &&
            (phase.result.header_diff.added.length > 0 || phase.result.header_diff.removed.length > 0) && (
              <HeaderDiff diff={phase.result.header_diff} />
            )}
          {phase.kind === "regenerating" ? (
            <div className="flex items-center gap-3 rounded-md border border-dashed p-4 text-muted-foreground">
              <EurekaLoadingSpinner size="sm" />
              Re-running the analysis with the saved brief…
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {phase.result.can_regenerate ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => onDone(phase.result)}>
                    Keep the old narrative for now
                  </Button>
                  <Button type="button" size="sm" onClick={() => void regenerate(phase.result)}>
                    Re-run analysis with saved brief
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" onClick={() => onDone(phase.result)}>
                  Continue
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {busy && <span className="sr-only">Working…</span>}
    </div>
  );
}

/** Added / removed columns between the previous batch and this file. */
export function HeaderDiff({ diff }: { diff: { added: string[]; removed: string[] } }) {
  if (diff.added.length === 0 && diff.removed.length === 0) {
    return <p className="text-xs text-muted-foreground">Columns match the previous upload.</p>;
  }
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-2">
      <div>
        <p className="mb-1 font-medium">Added columns ({diff.added.length})</p>
        <div className="flex flex-wrap gap-1">
          {diff.added.length === 0 ? (
            <span className="text-muted-foreground">none</span>
          ) : (
            diff.added.map((h) => (
              <Badge key={h} variant="success" className="font-normal">
                {h}
              </Badge>
            ))
          )}
        </div>
      </div>
      <div>
        <p className="mb-1 font-medium">Removed columns ({diff.removed.length})</p>
        <div className="flex flex-wrap gap-1">
          {diff.removed.length === 0 ? (
            <span className="text-muted-foreground">none</span>
          ) : (
            diff.removed.map((h) => (
              <Badge key={h} variant="warning" className="font-normal">
                {h}
              </Badge>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
